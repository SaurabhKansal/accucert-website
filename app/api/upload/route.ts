import { extractText } from "../../../lib/extractText";

import { generateCertifiedPdf } from "@/lib/generateCertifiedPdf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return new Response("No file uploaded", { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    const { text, source } = await extractText(buffer, file.type);

    const pdfBytes = await generateCertifiedPdf({
      originalFilename: file.name,
      extractedText: text || "No text detected in image.",
    });

    return new Response(pdfBytes, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="certified-${file.name}.pdf"`,
        "X-Text-Source": source,
      },
    });
  } catch (err) {
    console.error("OCR UPLOAD ERROR", err);
    return new Response("Upload failed", { status: 500 });
  }
}
