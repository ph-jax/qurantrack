const MAX_DIMENSION = 512;
const SUPPORTED = new Set(['image/png', 'image/jpeg', 'image/webp']);

export async function prepareLogo(file: File): Promise<string> {
  if (!SUPPORTED.has(file.type)) throw new Error('type');
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  for (const quality of [0.85, 0.72, 0.6, 0.48]) {
    const value = canvas.toDataURL('image/webp', quality);
    if (new TextEncoder().encode(value).byteLength <= 200 * 1024) return value;
  }
  throw new Error('size');
}
