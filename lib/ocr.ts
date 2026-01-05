// lib/ocr.ts
import { createWorker } from "tesseract.js";
import path from "path";
import sharp from "sharp";

export async function runOCR(buffer: Buffer): Promise<string> {
  const root = process.cwd();

  // 1. Convert to PNG to bypass internal BMP-JS logic completely
  const cleanBuffer = await sharp(buffer)
    .resize(1200)
    .toFormat('png')
    .toBuffer();

  // 2. Define absolute paths to the ACTUAL node_modules location on the server
  const workerPath = path.resolve(root, "node_modules/tesseract.js/src/worker-script/node/index.js");
  const corePath = path.resolve(root, "node_modules/tesseract.js-core");

  const worker = await createWorker("eng", 1, {
    workerPath,
    corePath,
    langPath: root, // Assumes eng.traineddata is at the root
    gzip: false,
    logger: (m) => console.log("OCR Progress:", m.status),
  });

  try {
    const { data: { text } } = await worker.recognize(cleanBuffer);
    return text?.trim() || "";
  } catch (err) {
    console.error("OCR Runtime Error:", err);
    throw err;
  } finally {
    await worker.terminate();
  }
}