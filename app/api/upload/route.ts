import { extractText } from "../../../lib/extractText";
import { generateCertifiedPdf } from "@/lib/generateCertifiedPdf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// app/api/ocr/route.ts

export const maxDuration = 300; // Allow 5 minutes (max for Pro, 60s for Hobby)
// Note: If you are on the Hobby (Free) plan, the max is 60s. 
// If it still times out at 60s, we must optimize the image.

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return new Response("No file uploaded", { status: 400 });
    }

    // 1. Convert file to buffer
    const buffer = Buffer.from(await file.arrayBuffer());

    // 2. Extract Text (This uses your Tesseract logic)
    const { text, source } = await extractText(buffer, file.type);

    // 3. Generate the new PDF
    const pdfBytes = await generateCertifiedPdf({
      originalFilename: file.name,
      extractedText: text || "No text detected in image.",
    });

    // 4. Safety Check: Ensure pdfBytes is valid before sending
    if (!pdfBytes || pdfBytes.byteLength === 0) {
      throw new Error("Generated PDF is empty or invalid.");
    }

    // 5. Return the PDF
    // 5. Return the PDF
    // Wrapping pdfBytes in Buffer.from() solves the TypeScript assignment error
    return new Response(Buffer.from(pdfBytes), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="certified-${file.name}.pdf"`,
        "X-Text-Source": source,
      },
    });
  } catch (err: any) {
    console.error("OCR UPLOAD ERROR:", err);
    // Return the actual error message so you can see it in the browser console
    return new Response(`Upload failed: ${err.message}`, { status: 500 });
  }
}