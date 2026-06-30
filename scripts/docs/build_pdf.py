#!/usr/bin/env python3
"""
Combine images into a single PDF.
Usage: python3 build_pdf.py <img1> [img2 ...] <output.pdf>
Exit 0 = success, Exit 1 = no input images
"""
import sys
import os
import tempfile

def main():
    if len(sys.argv) < 3:
        print('Usage: build_pdf.py <img1> [img2 ...] <output.pdf>', file=sys.stderr)
        sys.exit(2)

    *inputs, output = sys.argv[1:]

    try:
        from PIL import Image
    except ImportError:
        print('Pillow not installed: pip3 install pillow', file=sys.stderr)
        sys.exit(2)

    images = []
    for p in inputs:
        try:
            images.append(Image.open(p).convert('RGB'))
        except Exception as e:
            print(f'Cannot open {p}: {e}', file=sys.stderr)

    if not images:
        sys.exit(1)

    # Write to temp file first, then rename — makes the final write atomic
    tmp = output + '.tmp'
    images[0].save(tmp, format='PDF', save_all=True, append_images=images[1:], resolution=150)
    os.replace(tmp, output)

if __name__ == '__main__':
    main()
