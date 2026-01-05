// lib/ocr.ts
import { createWorker } from "tesseract.js";
import path from "path";

export async function runOCR(buffer: Buffer): Promise<string> {
  const root = process.cwd();

  // Absolute paths for the production environment
  const workerPath = path.join(root, "node_modules/tesseract.js/src/worker-script/node/index.js");
  const corePath = path.join(root, "node_modules/tesseract-wasm/dist/tesseract-core.wasm.js");

  const worker = await createWorker("eng", 1, {
    workerPath,
    corePath,
    logger: (m) => console.log("OCR Status:", m), // This shows up in your Vercel logs
  });

  try {
    const { data: { text } } = await worker.recognize(buffer);
    return text?.trim() || "";
  } catch (error: any) {
    console.error("Tesseract Production Error:", error.message);
    throw new Error(`OCR failed: ${error.message}`);
  } finally {
    await worker.terminate();
  }
}