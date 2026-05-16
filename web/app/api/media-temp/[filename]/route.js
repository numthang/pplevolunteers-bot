import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const TEMP_DIR = process.env.META_TEMP_DIR
  || path.join(process.cwd(), 'public', 'media-temp');

const MIME = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };

export async function GET(request, { params }) {
  const { filename } = await params;
  if (!filename || filename.includes('..') || filename.includes('/')) {
    return NextResponse.json({ error: 'Invalid filename' }, { status: 400 });
  }
  const filePath = path.join(TEMP_DIR, filename);
  try {
    const buffer = fs.readFileSync(filePath);
    const ext = filename.split('.').pop().toLowerCase();
    const contentType = MIME[ext] || 'application/octet-stream';
    return new NextResponse(buffer, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=3600',
      },
    });
  } catch {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
}
