// lib/ocr.ts
import { createWorker } from "tesseract.js";
import path from "path";
import sharp from "sharp";

export async function runOCR(buffer: Buffer): Promise<string> {
  const root = process.cwd();

  // 1. Pre-process with Sharp to avoid BMP issues
  const cleanBuffer = await sharp(buffer)
    .resize(1200)
    .toFormat('png')
    .toBuffer();

  // 2. Define directory paths
  const workerPath = path.join(root, "node_modules/tesseract.js/src/worker-script/node/index.js");
  
  // ✅ Point to the DIRECTORY containing the cores, not a specific file.
  // This allows Tesseract to find 'tesseract-core-simd.wasm.js' automatically.
  const corePath = path.join(root, "node_modules/tesseract.js-core");

  const worker = await createWorker("eng", 1, {
    workerPath,
    corePath, 
    langPath: root,
    gzip: false,
  });

  try {
    const { data: { text } } = await worker.recognize(cleanBuffer);
    return text?.trim() || "";
  } catch (err: any) {
    console.error("OCR Runtime Error:", err.message);
    throw err;
  } finally {
    await worker.terminate();
  }
}