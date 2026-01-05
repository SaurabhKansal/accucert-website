// lib/ocr.ts
import { createWorker } from "tesseract.js";
import path from "path";

export async function runOCR(buffer: Buffer): Promise<string> {
  // ✅ This finds the physical path on the production server
  const workerPath = path.resolve(
    process.cwd(),
    "node_modules/tesseract.js/src/worker-script/node/index.js"
  );

  // Initialize worker with the explicit path
  const worker = await createWorker("eng", 1, {
    workerPath: workerPath,
    logger: (m) => console.log(m), // Helpful for checking Vercel logs
  });

  try {
    const { data: { text } } = await worker.recognize(buffer);
    return text?.trim() || "";
  } catch (error) {
    console.error("Tesseract Production Error:", error);
    throw error;
  } finally {
    await worker.terminate();
  }
}