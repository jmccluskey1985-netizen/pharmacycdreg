/** Shrink a phone photo before upload (max ~2000px, JPEG). PDFs pass through. */
export async function compressImage(file: Blob, name: string): Promise<File> {
  if (file.type === 'application/pdf') return new File([file], name, { type: file.type });
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
    const scale = Math.min(1, 2000 / Math.max(img.width, img.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.width * scale);
    canvas.height = Math.round(img.height * scale);
    canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
    const out: Blob = await new Promise((res) => canvas.toBlob((b) => res(b!), 'image/jpeg', 0.88));
    return new File([out], name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' });
  } finally {
    URL.revokeObjectURL(url);
  }
}
