// lib/ocr.ts
import { createWorker } from "tesseract.js";
import path from "path";
import sharp from "sharp";

export async function runOCR(buffer: Buffer): Promise<string> {
  const root = process.cwd();

  // Convert to PNG to ensure Tesseract has the easiest possible format
  const cleanBuffer = await sharp(buffer)
    .resize(1200)
    .toFormat('png')
    .toBuffer();

  const worker = await createWorker("eng", 1, {
    workerPath: path.join(root, "node_modules/tesseract.js/src/worker-script/node/index.js"),
    corePath: path.join(root, "node_modules/tesseract-wasm/dist/tesseract-core.wasm.js"),
    langPath: root,
    gzip: false, // Prevents Tesseract from looking for extra compression tools
  });

  try {
    const { data: { text } } = await worker.recognize(cleanBuffer);
    return text?.trim() || "";
  } finally {
    await worker.terminate();
  }
}