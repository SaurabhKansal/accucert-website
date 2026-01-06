// lib/ocr.ts
export async function runOCR(buffer: Buffer): Promise<string> {
  const apiKey = process.env.GOOGLE_VISION_API_KEY;

  if (!apiKey) {
    throw new Error("GOOGLE_VISION_API_KEY is not defined");
  }

  // 1. EXTRACT TEXT (Vision API)
  const base64Image = buffer.toString("base64");
  const visionUrl = `https://vision.googleapis.com/v1/images:annotate?key=${apiKey}`;

  const visionResponse = await fetch(visionUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      requests: [{
        image: { content: base64Image },
        features: [{ type: "TEXT_DETECTION" }],
      }],
    }),
  });

  const visionData = await visionResponse.json();
  const extractedText = visionData.responses[0]?.fullTextAnnotation?.text || "";

  if (!extractedText) {
    return "No text detected in the document.";
  }

  // 2. TRANSLATE TO ENGLISH (Translation API)
  // We send the extracted text to Google Translation
  const translateUrl = `https://translation.googleapis.com/language/translate/v2?key=${apiKey}`;

  try {
    const translateResponse = await fetch(translateUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        q: extractedText,
        target: "en", // We want English
        format: "text",
      }),
    });

    const translateData = await translateResponse.json();
    const translatedText = translateData.data?.translations[0]?.translatedText || extractedText;

    // We return the translated text to be put into your PDF
    return translatedText.trim();
  } catch (error) {
    console.error("Translation Error:", error);
    // If translation fails, we at least return the original extracted text
    return extractedText.trim();
  }
}