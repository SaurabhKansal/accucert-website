// lib/ocr.ts
import { createWorker } from "tesseract.js";
import path from "path";
import sharp from "sharp";

export async function runOCR(buffer: Buffer): Promise<string> {
  const root = process.cwd();

  // ✅ FORCE conversion to PNG using Sharp. 
  // Tesseract won't need bmp-js if we give it a clean PNG buffer.
  const cleanBuffer = await sharp(buffer)
    .resize(1500) 
    .toFormat('png') 
    .toBuffer();

  const worker = await createWorker("eng", 1, {
    workerPath: path.join(root, "node_modules/tesseract.js/src/worker-script/node/index.js"),
    corePath: path.join(root, "node_modules/tesseract-wasm/dist/tesseract-core.wasm.js"),
    langPath: root,
    // This suppresses the dynamic loading of extra utils
    logger: (m) => console.log(m.status), 
  });

  try {
    const { data: { text } } = await worker.recognize(cleanBuffer);
    return text?.trim() || "";
  } finally {
    await worker.terminate();
  }
}