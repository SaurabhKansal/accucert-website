import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";
import { generateCertifiedPdf } from "@/lib/generateCertifiedPdf";

export const runtime = "nodejs";
// Force dynamic rendering to ensure environment variables are always fresh
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const { requestId, email } = await req.json();

    // 1. GET & VALIDATE ENV VARS
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
    const resendKey = process.env.RESEND_API_KEY?.trim();

    if (!supabaseUrl || !supabaseKey || !resendKey) {
      throw new Error("Missing server configuration (Supabase/Resend Keys).");
    }

    // 2. INITIALIZE CLIENTS
    const supabase = createClient(supabaseUrl, supabaseKey);
    const resend = new Resend(resendKey);

    // 3. FETCH DATA
    const { data: translation, error: fetchError } = await supabase
      .from("translations")
      .select("*")
      .eq("id", requestId)
      .single();

    if (fetchError || !translation) {
      throw new Error("Translation record not found.");
    }

    // 4. GENERATE PDF
    // Ensure generateCertifiedPdf returns a Buffer or Uint8Array
    const pdfBytes = await generateCertifiedPdf({
      originalFilename: translation.filename,
      extractedText: translation.extracted_text,
      fullName: translation.full_name || "Valued Client",
      orderId: translation.id
    });

    // 5. SEND EMAIL
    // IMPORTANT: Resend requires the content to be a Buffer or a base64 string.
    // We use Buffer.from(pdfBytes) to ensure compatibility.
    const { data: emailData, error: emailError } = await resend.emails.send({
      from: "Accucert <onboarding@resend.dev>", // Replace with your verified domain later
      to: email,
      subject: `Certified Translation: ${translation.filename}`,
      html: `
        <div style="font-family: sans-serif; color: #18222b;">
          <h2>Your Certified Document is Ready</h2>
          <p>Hello <strong>${translation.full_name}</strong>,</p>
          <p>Please find your certified translation for <strong>${translation.filename}</strong> attached.</p>
          <p>Order ID: ${translation.id}</p>
        </div>
      `,
      attachments: [
        {
          filename: `Certified_${translation.filename}.pdf`,
          content: Buffer.from(pdfBytes), 
        },
      ],
    });

    if (emailError) {
      console.error("Resend Error Details:", emailError);
      throw new Error(`Email failed: ${emailError.message}`);
    }

    // 6. UPDATE STATUS
    await supabase
      .from("translations")
      .update({ status: "approved" })
      .eq("id", requestId);

    return new Response(JSON.stringify({ success: true, message: "Dispatched successfully" }), { 
      status: 200,
      headers: { "Content-Type": "application/json" }
    });

  } catch (err: any) {
    console.error("CRITICAL_APPROVE_ERROR:", err.message);
    return new Response(JSON.stringify({ error: err.message }), { 
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}