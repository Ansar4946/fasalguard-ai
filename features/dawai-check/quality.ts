import { classifyQuality, computeGrayStats, type QualityHint } from "./ui";

const SAMPLE_EDGE = 256;

/**
 * Cheap on-device photo hint (tiny, dark, glare, blurry) from a downscaled canvas. Never throws: if anything
 * fails the answer is "ok" so a hint can never block a check.
 */
export async function analysePhotoQuality(file: File): Promise<QualityHint> {
  const url = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("decode"));
      img.src = url;
    });
    const w = image.naturalWidth;
    const h = image.naturalHeight;
    if (!w || !h) return "ok";
    const scale = Math.min(1, SAMPLE_EDGE / Math.max(w, h));
    const cw = Math.max(8, Math.round(w * scale));
    const ch = Math.max(8, Math.round(h * scale));
    const canvas = document.createElement("canvas");
    canvas.width = cw;
    canvas.height = ch;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) return "ok";
    context.drawImage(image, 0, 0, cw, ch);
    const { data } = context.getImageData(0, 0, cw, ch);
    const gray = new Uint8ClampedArray(cw * ch);
    for (let i = 0, p = 0; i < gray.length; i++, p += 4) {
      gray[i] = 0.299 * data[p] + 0.587 * data[p + 1] + 0.114 * data[p + 2];
    }
    return classifyQuality(w, h, computeGrayStats(gray, cw, ch));
  } catch {
    return "ok";
  } finally {
    URL.revokeObjectURL(url);
  }
}
