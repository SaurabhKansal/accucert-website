// lib/ocr.ts
export async function runOCR(buffer: Buffer): Promise<string> {
  const apiKey = process.env.GOOGLE_VISION_API_KEY;

  if (!apiKey) {
    console.error("Missing Google API Key");
    throw new Error("OCR Configuration Error");
  }

  const base64Image = buffer.toString("base64");
  const url = `https://vision.googleapis.com/v1/images:annotate?key=${apiKey}`;

  const requestBody = {
    requests: [{
      image: { content: base64Image },
      features: [{ type: "TEXT_DETECTION" }],
    }],
  };

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(`Google Vision API Error: ${JSON.stringify(errorData)}`);
  }

  const data = await response.json();
  const text = data.responses[0]?.fullTextAnnotation?.text || "";
  
  return text.trim();
}