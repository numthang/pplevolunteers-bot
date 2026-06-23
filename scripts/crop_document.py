#!/usr/bin/env python3
"""
Detect and perspective-correct a document from a phone photo.
Usage: python3 crop_document.py <input_path> <output_path>
Exit 0 = success (cropped), Exit 1 = no document detected (caller should use original)
"""
import sys
import cv2
import numpy as np


A4_W, A4_H = 2480, 3508  # 300 dpi


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


def find_document_contour(gray):
    blurred = cv2.GaussianBlur(gray, (5, 5), 0)
    edges = cv2.Canny(blurred, 30, 120)
    # dilate edges to connect broken lines
    kernel = np.ones((3, 3), np.uint8)
    edges = cv2.dilate(edges, kernel, iterations=1)

    contours, _ = cv2.findContours(edges, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    contours = sorted(contours, key=cv2.contourArea, reverse=True)[:10]

    for c in contours:
        peri = cv2.arcLength(c, True)
        approx = cv2.approxPolyDP(c, 0.02 * peri, True)
        if len(approx) == 4:
            area = cv2.contourArea(approx)
            img_area = gray.shape[0] * gray.shape[1]
            if area > 0.15 * img_area:  # must cover at least 15% of image
                return approx.reshape(4, 2)
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

    # auto-orient via EXIF (OpenCV doesn't handle EXIF rotation by default)
    # use cv2.IMREAD_UNCHANGED and re-read with imdecode after checking EXIF manually
    # Workaround: use PIL for EXIF, then pass to OpenCV
    try:
        from PIL import Image, ImageOps
        pil = ImageOps.exif_transpose(Image.open(inp))
        pil_rgb = np.array(pil.convert('RGB'))
        img = cv2.cvtColor(pil_rgb, cv2.COLOR_RGB2BGR)
    except ImportError:
        pass  # PIL not available, use as-is

    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    pts = find_document_contour(gray)

    if pts is None:
        # No clear document border found — just orient + resize as A4
        # Still useful: keeps aspect ratio A4, scales to 300dpi
        h, w = img.shape[:2]
        if h < w:
            img = cv2.rotate(img, cv2.ROTATE_90_CLOCKWISE)
            h, w = img.shape[:2]
        resized = cv2.resize(img, (A4_W, A4_H), interpolation=cv2.INTER_LANCZOS4)
        cv2.imwrite(out, resized, [cv2.IMWRITE_JPEG_QUALITY, 92])
        sys.exit(1)  # signal: no crop (caller may want to know)

    warped = four_point_transform(img, pts.astype('float32'))

    # Rotate to portrait if landscape
    h, w = warped.shape[:2]
    if w > h:
        warped = cv2.rotate(warped, cv2.ROTATE_90_CLOCKWISE)

    result = cv2.resize(warped, (A4_W, A4_H), interpolation=cv2.INTER_LANCZOS4)
    cv2.imwrite(out, result, [cv2.IMWRITE_JPEG_QUALITY, 92])
    sys.exit(0)


if __name__ == '__main__':
    main()
