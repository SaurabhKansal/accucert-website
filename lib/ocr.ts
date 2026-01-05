// lib/ocr.ts
import { createWorker } from "tesseract.js";
import path from "path";
import sharp from "sharp";

export async function runOCR(buffer: Buffer): Promise<string> {
  const root = process.cwd();

  // 1. Pre-process with Sharp
  // Converting to PNG is the "magic bullet" to bypass BMP-JS errors 
  // and makes the OCR process significantly faster on Vercel.
  const cleanBuffer = await sharp(buffer)
    .resize(1200) 
    .toFormat('png')
    .toBuffer();

  // 2. Define Absolute paths for the serverless environment
  const workerPath = path.join(root, "node_modules/tesseract.js/src/worker-script/node/index.js");
  const corePath = path.join(root, "node_modules/tesseract.js-core");

  // 3. Initialize Worker
  // We pass the paths in the third argument (options)
  const worker = await createWorker("eng", 1, {
    workerPath,
    corePath,
    langPath: root, // Assumes eng.traineddata is in your root folder
    gzip: false,    // Disables the need for the 'pako' module for compression
    logger: (m) => console.log("OCR Status:", m.status), 
  });

  try {
    // 4. Perform Recognition
    const { data: { text } } = await worker.recognize(cleanBuffer);
    
    if (!text) {
      console.warn("OCR completed but no text was detected.");
      return "";
    }

    return text.trim();
  } catch (err: any) {
    console.error("DETAILED OCR RUNTIME ERROR:", err);
    throw new Error(`OCR processing failed: ${err.message}`);
  } finally {
    // 5. Cleanup
    // This is vital on Vercel to prevent memory leaks in serverless functions
    await worker.terminate();
  }
}