#!/usr/bin/env python3
"""
Detect and perspective-correct a document from a phone photo.
Usage: python3 crop_document.py <input_path> <output_path>
Exit 0 = success (cropped), Exit 1 = no document detected (caller should use original)
"""
import sys
import cv2
import numpy as np


A4_W, A4_H = 1240, 1754  # 150 dpi — good enough for viewing, keeps file small
JPEG_Q = 80

# เกณฑ์ทิ้ง quad ที่ "ไม่น่าจะใช่กระดาษ" — เจตนา: worst case ต้องเป็น "ไม่ครอบ" ไม่ใช่ "ครอบเบี้ยว"
#
# ⚠️ ห้ามเอาสัดส่วน A4 (1.414) มาเป็นเกณฑ์ตรงๆ — quad ที่เห็นในรูปคือ**เงาฉาย**ของกระดาษ
#    ถ่ายเอียงนิดเดียวสัดส่วนก็เพี้ยนไปมาก (วัดจริงตอนเทส 2026-08-09: A4 ถ่ายเฉียงได้ 1.02)
#    เกณฑ์แคบ = autocrop ไม่ทำงานเลยทั้งที่เจอเอกสารแล้ว
PAPER_MIN, PAPER_MAX = 1.05, 1.95   # หลวมพอสำหรับมุมกล้องจริง แต่ยังตัดของยาว/แบนผิดปกติ

# quad ที่กินเกือบทั้งเฟรม = ไม่ได้เจอกระดาษ แต่ไปจับขอบรูป/ขอบโต๊ะ/เงาทั้งใบ
# → warp ทั้งรูปให้เอียงตามขอบที่จับผิด = อาการ "ภาพเบี้ยว" ที่คนใช้เจอ
MAX_QUAD_FRAME_RATIO = 0.92


def order_points(pts):
    rect = np.zeros((4, 2), dtype='float32')
    s = pts.sum(axis=1)
    rect[0] = pts[np.argmin(s)]   # top-left
    rect[2] = pts[np.argmax(s)]   # bottom-right
    diff = np.diff(pts, axis=1)
    rect[1] = pts[np.argmin(diff)]  # top-right
    rect[3] = pts[np.argmax(diff)]  # bottom-left
    return rect


def four_point_transform(image, pts):
    rect = order_points(pts)
    (tl, tr, br, bl) = rect

    width_a = np.linalg.norm(br - bl)
    width_b = np.linalg.norm(tr - tl)
    max_width = max(int(width_a), int(width_b))

    height_a = np.linalg.norm(tr - br)
    height_b = np.linalg.norm(tl - bl)
    max_height = max(int(height_a), int(height_b))

    dst = np.array([
        [0, 0],
        [max_width - 1, 0],
        [max_width - 1, max_height - 1],
        [0, max_height - 1],
    ], dtype='float32')

    M = cv2.getPerspectiveTransform(rect, dst)
    return cv2.warpPerspective(image, M, (max_width, max_height))


def fit_to_a4(img):
    """วางรูปกลางหน้า A4 พื้นขาว โดย**รักษาสัดส่วนเดิม** — ห้าม resize ตรงๆ เป็น (A4_W, A4_H)
    เพราะรูปที่สัดส่วนไม่ใช่ A4 จะถูกยืด/บี้ (ต้นตออาการ 'ภาพเพี้ยน' ที่เจอ 2026-08-09)
    ผลลัพธ์ยังเป็น A4 เป๊ะทุกใบ → build_pdf.py/export ได้หน้ากระดาษเท่ากันเหมือนเดิม"""
    h, w = img.shape[:2]
    s = min(A4_W / w, A4_H / h)
    nw, nh = max(1, int(round(w * s))), max(1, int(round(h * s)))
    interp = cv2.INTER_AREA if s < 1 else cv2.INTER_LANCZOS4
    resized = cv2.resize(img, (nw, nh), interpolation=interp)

    canvas = np.full((A4_H, A4_W, 3), 255, dtype=np.uint8)
    x, y = (A4_W - nw) // 2, (A4_H - nh) // 2
    canvas[y:y + nh, x:x + nw] = resized
    return canvas


def looks_like_paper(img):
    """สัดส่วนของสิ่งที่ครอบได้ ดูเหมือนกระดาษไหม (ดูด้านยาว/ด้านสั้น ไม่สนแนวตั้ง-นอน)"""
    h, w = img.shape[:2]
    short = max(1, min(h, w))
    return PAPER_MIN <= max(h, w) / short <= PAPER_MAX


def is_roughly_rectangular(pts):
    """Check that the 4-point shape has angles close to 90 degrees."""
    ordered = order_points(pts)
    angles = []
    for i in range(4):
        p0 = ordered[(i - 1) % 4]
        p1 = ordered[i]
        p2 = ordered[(i + 1) % 4]
        v1 = p0 - p1
        v2 = p2 - p1
        cos_a = np.dot(v1, v2) / (np.linalg.norm(v1) * np.linalg.norm(v2) + 1e-6)
        angles.append(np.degrees(np.arccos(np.clip(cos_a, -1, 1))))
    # All angles should be between 60° and 120° for a valid document quad
    return all(60 < a < 120 for a in angles)


def find_document_contour(gray):
    scale = 0.25
    small = cv2.resize(gray, None, fx=scale, fy=scale)
    img_area = small.shape[0] * small.shape[1]

    # Method 1: threshold bright regions (white paper on dark background)
    _, thresh = cv2.threshold(small, 180, 255, cv2.THRESH_BINARY)
    kernel = np.ones((9, 9), np.uint8)
    thresh = cv2.morphologyEx(thresh, cv2.MORPH_CLOSE, kernel, iterations=3)
    thresh = cv2.morphologyEx(thresh, cv2.MORPH_OPEN,  kernel, iterations=1)

    contours, _ = cv2.findContours(thresh, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    contours = sorted(contours, key=cv2.contourArea, reverse=True)[:5]
    for c in contours:
        peri = cv2.arcLength(c, True)
        approx = cv2.approxPolyDP(c, 0.02 * peri, True)
        if len(approx) == 4:
            pts = approx.reshape(4, 2).astype('float32')
            area = cv2.contourArea(pts)
            if area > 0.25 * img_area and is_roughly_rectangular(pts):
                return pts / scale

    # Method 2: fallback to Canny edge detection
    blurred = cv2.GaussianBlur(small, (7, 7), 0)
    edges = cv2.Canny(blurred, 50, 150)
    kernel2 = np.ones((5, 5), np.uint8)
    edges = cv2.dilate(edges, kernel2, iterations=2)
    contours2, _ = cv2.findContours(edges, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    contours2 = sorted(contours2, key=cv2.contourArea, reverse=True)[:5]
    for c in contours2:
        peri = cv2.arcLength(c, True)
        approx = cv2.approxPolyDP(c, 0.02 * peri, True)
        if len(approx) == 4:
            pts = approx.reshape(4, 2).astype('float32')
            area = cv2.contourArea(pts)
            if area > 0.25 * img_area and is_roughly_rectangular(pts):
                return pts / scale

    return None


def main():
    if len(sys.argv) != 3:
        print('Usage: crop_document.py <input> <output>', file=sys.stderr)
        sys.exit(2)

    inp, out = sys.argv[1], sys.argv[2]
    img = cv2.imread(inp)
    if img is None:
        print(f'Cannot read {inp}', file=sys.stderr)
        sys.exit(2)

    try:
        from PIL import Image, ImageOps
        pil = ImageOps.exif_transpose(Image.open(inp))
        pil_rgb = np.array(pil.convert('RGB'))
        img = cv2.cvtColor(pil_rgb, cv2.COLOR_RGB2BGR)
    except ImportError:
        pass

    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    pts = find_document_contour(gray)

    # quad กินเกือบทั้งเฟรม = จับขอบรูป/ขอบโต๊ะ ไม่ใช่กระดาษ → ทิ้งตั้งแต่ยังไม่ warp
    if pts is not None:
        frame_area = img.shape[0] * img.shape[1]
        if cv2.contourArea(order_points(pts)) > MAX_QUAD_FRAME_RATIO * frame_area:
            pts = None

    warped = four_point_transform(img, pts) if pts is not None else None

    # ครอบได้แล้วแต่สัดส่วนผิดรูปกระดาษไปไกล = จับผิดชิ้น → ทิ้ง ใช้รูปเต็มดีกว่าครอบเบี้ยว
    if warped is not None and not looks_like_paper(warped):
        warped = None

    if warped is None:
        # ⚠️ ห้ามเดาหมุน 90° ตรงนี้ — ไม่รู้ว่าเอกสารวางแนวไหนในเฟรม เดาผิดคือรูปตะแคง
        #    (EXIF จัดการการหมุนของกล้องให้แล้วตอนอ่านไฟล์ด้านบน) ปล่อยตามต้นฉบับ
        cv2.imwrite(out, fit_to_a4(img), [cv2.IMWRITE_JPEG_QUALITY, JPEG_Q])
        sys.exit(1)

    # ครอบติดแล้ว = รู้ขอบเอกสารจริง เอกสารแนวนอนจึงหมุนตั้งขึ้นได้ (เต็มหน้ากระดาษกว่า
    # แบบเดียวกับสแกนเนอร์) — ต่างจากกรณีข้างบนที่ไม่รู้อะไรเลย
    if warped.shape[1] > warped.shape[0]:
        warped = cv2.rotate(warped, cv2.ROTATE_90_CLOCKWISE)

    cv2.imwrite(out, fit_to_a4(warped), [cv2.IMWRITE_JPEG_QUALITY, JPEG_Q])
    sys.exit(0)


if __name__ == '__main__':
    main()
