// lib/ocr.ts
import { createWorker } from "tesseract.js";
import path from "path";
import sharp from "sharp";

export async function runOCR(buffer: Buffer): Promise<string> {
  const root = process.cwd();
  let processedBuffer = buffer;

  // Step 1: Attempt optimization
  try {
    processedBuffer = await sharp(buffer)
      .resize(1200) // Lower resolution = much faster OCR
      .grayscale()
      .toBuffer();
    console.log("Image optimized successfully");
  } catch (sharpError) {
    console.error("Sharp optimization failed, using original buffer:", sharpError);
  }

  // Step 2: Initialize Worker
  const worker = await createWorker("eng", 1, {
    workerPath: path.join(root, "node_modules/tesseract.js/src/worker-script/node/index.js"),
    corePath: path.join(root, "node_modules/tesseract-wasm/dist/tesseract-core.wasm.js"),
    langPath: root,
    cachePath: root,
  });

  try {
    const { data: { text } } = await worker.recognize(processedBuffer);
    return text?.trim() || "";
  } catch (ocrError: any) {
    console.error("Tesseract Engine Error:", ocrError);
    throw new Error(`OCR Engine failed: ${ocrError.message}`);
  } finally {
    await worker.terminate();
  }
}