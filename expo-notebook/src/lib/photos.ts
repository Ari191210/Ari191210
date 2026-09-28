import type { OwnerType, Photo } from '../db/types';
import { addPhoto } from '../db/repo';
import { uuid } from './id';

export const MAX_EDGE = 1600;
export const THUMB_EDGE = 300;
export const JPEG_QUALITY = 0.82;
export const THUMB_QUALITY = 0.72;

export function fitWithin(w: number, h: number, maxEdge: number): { width: number; height: number } {
  const scale = Math.min(1, maxEdge / Math.max(w, h));
  return { width: Math.max(1, Math.round(w * scale)), height: Math.max(1, Math.round(h * scale)) };
}

/**
 * Decodes via <img>, which applies EXIF orientation in all current browsers
 * (Chrome 81+, Safari 13.1+, Firefox 77+), so drawn pixels are already upright.
 */
async function loadImage(file: Blob): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    await img.decode();
    return img;
  } catch {
    throw new Error('Could not read this image. Try a JPEG or PNG photo.');
  } finally {
    // Safe: once decoded, the image keeps its pixel data.
    URL.revokeObjectURL(url);
  }
}

function canvasToJpeg(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('Image encoding failed'))),
      'image/jpeg',
      quality,
    ),
  );
}

function drawScaled(img: HTMLImageElement, maxEdge: number): HTMLCanvasElement {
  const { width, height } = fitWithin(img.naturalWidth, img.naturalHeight, maxEdge);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas not available');
  ctx.fillStyle = '#fff'; // PNG transparency → white instead of black in JPEG
  ctx.fillRect(0, 0, width, height);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, width, height);
  return canvas;
}

export interface ProcessedImage {
  blob: Blob;
  thumb: Blob;
  width: number;
  height: number;
}

export async function processImage(file: Blob): Promise<ProcessedImage> {
  const img = await loadImage(file);
  const full = drawScaled(img, MAX_EDGE);
  const blob = await canvasToJpeg(full, JPEG_QUALITY);
  const thumbCanvas = drawScaled(img, THUMB_EDGE);
  const thumb = await canvasToJpeg(thumbCanvas, THUMB_QUALITY);
  const res = { blob, thumb, width: full.width, height: full.height };
  // Release canvas backing stores promptly (iOS has a tight total canvas memory budget).
  full.width = full.height = thumbCanvas.width = thumbCanvas.height = 0;
  return res;
}

export async function savePhotoFor(ownerType: OwnerType, ownerId: string, file: Blob): Promise<Photo> {
  const p = await processImage(file);
  const photo: Photo = {
    id: uuid(),
    owner_type: ownerType,
    owner_id: ownerId,
    blob: p.blob,
    thumb_blob: p.thumb,
    width: p.width,
    height: p.height,
    created_at: Date.now(),
  };
  await addPhoto(photo);
  return photo;
}
