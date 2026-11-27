/**
 * Shrink a phone photo before upload (max ~2000px, JPEG ~0.5–1 MB). Full-size phone photos are
 * often 5–8 MB, over the hosting upload limit (~4.5 MB), which shows as "Failed to fetch".
 * Anything that isn't a photo (PDF, Excel, CSV, Touchstore .QRP…) passes through unchanged, and so
 * does a photo the browser can't decode.
 */
export async function compressImage(file: Blob, name: string): Promise<File> {
  const keep = () => (file instanceof File ? file : new File([file], name, { type: file.type }));
  if (!file.type.startsWith('image/') || file.type === 'image/gif') return keep();
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
    const scale = Math.min(1, 2000 / Math.max(img.width, img.height));
    if (scale === 1 && file.size < 1.5e6) return keep(); // already small
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.width * scale);
    canvas.height = Math.round(img.height * scale);
    canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
    const out: Blob = await new Promise((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error('encode'))), 'image/jpeg', 0.88));
    return new File([out], (name || 'photo').replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' });
  } catch {
    return keep();
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Every file of a selection, photos shrunk. */
export const compressAll = (files: Iterable<File>) => Promise.all(Array.from(files).map((f, i) => compressImage(f, f.name || `photo-${i + 1}.jpg`)));
