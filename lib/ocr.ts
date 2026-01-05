// lib/ocr.ts
import { createWorker } from "tesseract.js";
import path from "path";

export async function runOCR(buffer: Buffer): Promise<string> {
  const root = process.cwd();
  
  // Point directly to the core files to avoid the '..' relative require issue
  const workerPath = path.join(root, "node_modules/tesseract.js/src/worker-script/node/index.js");
  const corePath = path.join(root, "node_modules/tesseract-wasm/dist/tesseract-core.wasm.js");

  // Initialize with 'eng' immediately (v5+ syntax)
  const worker = await createWorker("eng", 1, {
    workerPath,
    corePath,
    langPath: root, // Assumes eng.traineddata is in your root
    logger: (m) => console.log(m.status),
  });

  try {
    const { data: { text } } = await worker.recognize(buffer);
    return text?.trim() || "";
  } finally {
    await worker.terminate();
  }
}