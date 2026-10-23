import { computeTargetSize, jpegFileName, MAX_EDGE_PX, MAX_UPLOAD_BYTES, needsReencode } from "./image";

export class PhotoError extends Error {
  constructor(readonly code: "unreadable" | "tooBig") {
    super(code);
  }
}

function decode(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new PhotoError("unreadable"));
    };
    image.src = url;
  });
}

function toBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
}

/** Re-encodes to a JPEG of at most 1600px on the longest edge so uploads stay fast on weak networks. */
export async function preparePhoto(file: File): Promise<{ file: File; previewUrl: string }> {
  const image = await decode(file);
  const w = image.naturalWidth;
  const h = image.naturalHeight;
  const target = computeTargetSize(w, h, MAX_EDGE_PX);
  if (target.width === 0) throw new PhotoError("unreadable");
  const canvas = document.createElement("canvas");
  canvas.width = target.width;
  canvas.height = target.height;
  const context = canvas.getContext("2d");
  if (!context) throw new PhotoError("unreadable");
  context.drawImage(image, 0, 0, target.width, target.height);
  const previewUrl = URL.createObjectURL(file);
  if (!needsReencode(file.type, file.size, w, h)) return { file, previewUrl };
  let blob = await toBlob(canvas, 0.85);
  if (blob && blob.size > MAX_UPLOAD_BYTES) blob = await toBlob(canvas, 0.65);
  if (!blob) throw new PhotoError("unreadable");
  if (blob.size > MAX_UPLOAD_BYTES) throw new PhotoError("tooBig");
  return { file: new File([blob], jpegFileName(file.name), { type: "image/jpeg" }), previewUrl };
}
