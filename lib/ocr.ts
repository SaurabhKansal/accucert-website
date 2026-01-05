// lib/ocr.ts
import { createWorker } from "tesseract.js";
import path from "path";
import sharp from "sharp";

export async function runOCR(buffer: Buffer): Promise<string> {
  const root = process.cwd();

  // 1. Optimize Image (Crucial for speed and bypassing BMP issues)
  const cleanBuffer = await sharp(buffer)
    .resize(1200)
    .toFormat('png')
    .toBuffer();

  // 2. ABSOLUTE PATHS - No guessing for the server
  const workerPath = path.join(root, "node_modules/tesseract.js/src/worker-script/node/index.js");
  const corePath = path.join(root, "node_modules/tesseract.js-core");

  const worker = await createWorker("eng", 1, {
    workerPath,
    corePath,
    langPath: root,
    gzip: false,
    logger: (m) => console.log("Status:", m.status),
  });

  try {
    const { data: { text } } = await worker.recognize(cleanBuffer);
    return text?.trim() || "";
  } catch (error) {
    console.error("Internal OCR Error:", error);
    throw error;
  } finally {
    // ALWAYS terminate to prevent the "worked once then failed" memory lock
    await worker.terminate();
  }
}