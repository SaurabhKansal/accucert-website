type ExtractResult = {
    text: string;
    source: "pdf-native" | "ocr" | "none";
  };
  
  export async function extractText(
    buffer: Buffer,
    mimeType: string
  ): Promise<ExtractResult> {
    /* -----------------------------
       CASE 1: PDF — native text
    ------------------------------ */
    if (mimeType === "application/pdf") {
      try {
        // IMPORTANT: require INSIDE function (Node-only)
        const pdfParse = require("pdf-parse");
  
        const data = await pdfParse(buffer);
  
        if (data.text && data.text.trim().length > 50) {
          return {
            text: data.text.trim(),
            source: "pdf-native",
          };
        }
      } catch (err) {
        console.warn("PDF native extraction failed:", err);
      }
    }
  
    /* -----------------------------
       CASE 2: OCR fallback (optional)
       Safe stub — does NOT crash
    ------------------------------ */
    try {
      const { runOCR } = await import("./ocr");
  
      const ocrText = await runOCR(buffer);
  
      if (ocrText && ocrText.trim().length > 0) {
        return {
          text: ocrText.trim(),
          source: "ocr",
        };
      }
    } catch (err) {
      console.warn("OCR failed or not enabled:", err);
    }
  
    /* -----------------------------
       CASE 3: Nothing extracted
    ------------------------------ */
    return {
      text: "",
      source: "none",
    };
  }
  