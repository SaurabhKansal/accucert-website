// lib/extractText.ts
import { runOCR } from "./ocr";

export type ExtractResult = {
  text: string;
  source: "ocr" | "none";
};

export async function extractText(
  buffer: Buffer,
  mimeType: string
): Promise<ExtractResult> {
  if (!mimeType.startsWith("image/")) {
    return { text: "", source: "none" };
  }

  const text = await runOCR(buffer);

  return {
    text,
    source: "ocr",
  };
}
