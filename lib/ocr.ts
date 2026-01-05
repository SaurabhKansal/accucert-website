// lib/ocr.ts
import { createWorker } from "tesseract.js";
import path from "path";
import sharp from "sharp";

export async function runOCR(buffer: Buffer): Promise<string> {
  const root = process.cwd();

  // 1. Optimize image
  const cleanBuffer = await sharp(buffer)
    .resize(1200)
    .toFormat('png')
    .toBuffer();

  // 2. Point to the "Safe" Public folder locations
  // In Vercel, public files are available at path.join(root, "public", ...)
  const workerPath = path.join(root, "public/tesseract/worker-script/node/index.js");
  const corePath = path.join(root, "public/tesseract/tesseract.js-core");

  const worker = await createWorker("eng", 1, {
    workerPath,
    corePath,
    langPath: root, 
    gzip: false,
    logger: (m) => console.log("OCR Status:", m.status),
  });

  try {
    const { data: { text } } = await worker.recognize(cleanBuffer);
    return text?.trim() || "";
  } catch (err) {
    console.error("Public Folder OCR Error:", err);
    throw err;
  } finally {
    await worker.terminate();
  }
}