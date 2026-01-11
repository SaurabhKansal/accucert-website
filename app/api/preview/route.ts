import { createClient } from "@supabase/supabase-js";
import { generateCertifiedPdf } from "@/lib/generateCertifiedPdf";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const { requestId, editText } = await req.json();

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!.trim(),
      process.env.SUPABASE_SERVICE_ROLE_KEY!.trim()
    );

    // 1. Fetch record for metadata (names, original filename)
    const { data: translation } = await supabase
      .from("translations")
      .select("*")
      .eq("id", requestId)
      .single();

    if (!translation) throw new Error("Translation not found");

    // 2. Generate PDF using the current editor HTML (editText)
    const pdfBuffer = await generateCertifiedPdf({
      originalFilename: translation.filename,
      extractedText: editText,
      fullName: translation.full_name || "Valued Client",
      orderId: translation.id
    });

    // 3. Return the PDF as a downloadable stream
    return new Response(pdfBuffer, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="PREVIEW_${translation.filename}.pdf"`,
      },
    });

  } catch (err: any) {
    console.error("PREVIEW ERROR:", err.message);
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}