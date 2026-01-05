import { createWorker } from "tesseract.js";
import path from "path";
import sharp from "sharp"; // ✅ Add this

export async function runOCR(buffer: Buffer): Promise<string> {
  const root = process.cwd();
  
  // PRE-PROCESS: Shrink the image and make it black & white
  // This makes Tesseract run 5x - 10x faster
  const optimizedBuffer = await sharp(buffer)
    .resize(1500) // Resize to a reasonable width
    .grayscale()  // Black and white is easier for OCR to read
    .toBuffer();

  const worker = await createWorker("eng", 1, {
    workerPath: path.join(root, "node_modules/tesseract.js/src/worker-script/node/index.js"),
    corePath: path.join(root, "node_modules/tesseract-wasm/dist/tesseract-core.wasm.js"),
    langPath: root,
    logger: (m) => console.log(m.status, Math.round(m.progress * 100) + "%"),
  });

  try {
    const { data: { text } } = await worker.recognize(optimizedBuffer);
    return text?.trim() || "";
  } finally {
    await worker.terminate();
  }
}