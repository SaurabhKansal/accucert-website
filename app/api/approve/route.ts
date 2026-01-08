import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";
import { generateCertifiedPdf } from "@/lib/generateCertifiedPdf";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const { requestId, email } = await req.json();

    // 1. SAFE INITIALIZATION (Prevents build-time 'Invalid supabaseUrl' error)
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const resendKey = process.env.RESEND_API_KEY;

    if (!supabaseUrl || !supabaseKey || !resendKey) {
      console.error("Missing Environment Variables for Approval API");
      return new Response("Server Configuration Error", { status: 500 });
    }

    const supabase = createClient(supabaseUrl, supabaseKey);
    const resend = new Resend(resendKey);

    // 2. FETCH DATA FROM SUPABASE
    const { data: translation, error: fetchError } = await supabase
      .from("translations")
      .select("*")
      .eq("id", requestId)
      .single();

    if (fetchError || !translation) {
      throw new Error("Could not find translation request in database.");
    }

    // 3. GENERATE THE CERTIFIED PDF
    const pdfBytes = await generateCertifiedPdf({
      originalFilename: translation.filename,
      extractedText: translation.extracted_text,
    });

    // 4. SEND EMAIL WITH ATTACHMENT
    const { error: emailError } = await resend.emails.send({
      from: "Accucert Team <onboarding@resend.dev>", // Generic until domain is verified
      to: email,
      subject: `Approved: Certified Translation for ${translation.filename}`,
      html: `
        <div style="font-family: sans-serif; color: #333; line-height: 1.6;">
          <h2 style="color: #1a2a3a;">Your Certified Translation is Ready</h2>
          <p>Hello,</p>
          <p>The professional review of your document <strong>${translation.filename}</strong> is now complete.</p>
          <p>Please find your certified PDF translation attached to this email.</p>
          <br />
          <p>Best regards,<br /><strong>The Accucert Team</strong></p>
        </div>
      `,
      attachments: [
        {
          filename: `certified-${translation.filename}.pdf`,
          content: Buffer.from(pdfBytes),
        },
      ],
    });

    if (emailError) {
      console.error("Resend Email Error:", emailError);
      throw new Error("Failed to send translation email.");
    }

    // 5. UPDATE STATUS TO 'APPROVED'
    const { error: updateError } = await supabase
      .from("translations")
      .update({ status: "approved" })
      .eq("id", requestId);

    if (updateError) throw updateError;

    return new Response(JSON.stringify({ success: true }), { 
      status: 200,
      headers: { "Content-Type": "application/json" }
    });

  } catch (err: any) {
    console.error("APPROVAL ROUTE ERROR:", err);
    return new Response(JSON.stringify({ error: err.message }), { 
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}