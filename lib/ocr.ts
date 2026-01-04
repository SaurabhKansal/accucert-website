import Tesseract from "tesseract.js";

export async function runOCR(buffer: Buffer) {
  const { data } = await Tesseract.recognize(buffer, "eng", {
    logger: () => {},
  });

  return data.text || "";
}
