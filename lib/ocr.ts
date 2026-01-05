// lib/ocr.ts
import { createWorker } from "tesseract.js";

export async function runOCR(buffer: Buffer): Promise<string> {
  // Create worker and specify the language immediately
  const worker = await createWorker("eng");

  try {
    // In v5, recognize() handles the setup automatically
    const { data: { text } } = await worker.recognize(buffer);

    return text?.trim() || "";
  } catch (error) {
    console.error("OCR Error:", error);
    throw error;
  } finally {
    await worker.terminate();
  }
}