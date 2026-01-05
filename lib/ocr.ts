// lib/ocr.ts
import { createWorker } from "tesseract.js";
import path from "path";

export async function runOCR(buffer: Buffer): Promise<string> {
  const root = process.cwd();
  
  // 1. Define all paths clearly
  const workerPath = path.join(root, "node_modules/tesseract.js/src/worker-script/node/index.js");
  const corePath = path.join(root, "node_modules/tesseract-wasm/dist/tesseract-core.wasm.js");
  // This tells Tesseract to look in the root folder for the 'eng.traineddata' file I saw in your Git
  const langPath = root; 

  const worker = await createWorker("eng", 1, {
    workerPath,
    corePath,
    langPath, // ✅ Explicitly tell it to look where your eng.traineddata is
    logger: (m) => console.log("OCR Status:", m),
  });

  try {
    const { data: { text } } = await worker.recognize(buffer);
    return text?.trim() || "";
  } catch (error: any) {
    console.error("DETAILED OCR ERROR:", error); // This will show up in Vercel Logs
    throw new Error(error.message || "Tesseract failed to recognize text");
  } finally {
    await worker.terminate();
  }
}