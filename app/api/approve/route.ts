import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";
import { generateCertifiedPdf } from "@/lib/generateCertifiedPdf";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const { requestId, email } = await req.json();

    // 1. GET & VALIDATE VARIABLES (With trimming to remove hidden spaces)
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
    const resendKey = process.env.RESEND_API_KEY?.trim();

    // Log the health check to Vercel Function Logs
    console.log("Approval API Audit:", {
      hasUrl: !!supabaseUrl,
      hasServiceKey: !!supabaseKey,
      hasResendKey: !!resendKey,
      requestId,
      clientEmail: email
    });

    if (!supabaseUrl || !supabaseUrl.startsWith("https://")) {
      return new Response(
        JSON.stringify({ error: "Invalid or missing Supabase URL configuration." }), 
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    // 2. INITIALIZE CLIENTS
    const supabase = createClient(supabaseUrl, supabaseKey!);
    const resend = new Resend(resendKey);

    // 3. FETCH DATA FROM SUPABASE
    const { data: translation, error: fetchError } = await supabase
      .from("translations")
      .select("*")
      .eq("id", requestId)
      .single();

    if (fetchError || !translation) {
      console.error("Supabase Fetch Error:", fetchError);
      throw new Error("Could not find translation request in database.");
    }

    // 4. GENERATE THE CERTIFIED PDF
    // This is the manual review part—it uses the extracted_text saved in DB
    const pdfBytes = await generateCertifiedPdf({
      originalFilename: translation.filename,
      extractedText: translation.extracted_text,
    });

    // 5. SEND EMAIL WITH ATTACHMENT
    const { error: emailError } = await resend.emails.send({
      from: "Accucert Team <onboarding@resend.dev>", 
      to: email,
      subject: `Approved: Certified Translation for ${translation.filename}`,
      html: `
        <div style="font-family: sans-serif; color: #333; line-height: 1.6;">
          <h2 style="color: #1a2a3a;">Your Certified Translation is Ready</h2>
          <p>Hello,</p>
          <p>Our professional review team has completed the certification of <strong>${translation.filename}</strong>.</p>
          <p>Please find your certified PDF translation attached to this email.</p>
          <br />
          <p>Thank you for choosing Accucert.</p>
          <hr style="border:none; border-top:1px solid #eee;" />
          <p style="font-size: 11px; color: #999;">Accucert Professional Translation Services</p>
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
      console.error("Resend Sending Error:", emailError);
      throw new Error("Failed to send translation email.");
    }

    // 6. UPDATE STATUS TO 'APPROVED'
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
    console.error("APPROVAL ROUTE ERROR:", err.message);
    return new Response(JSON.stringify({ error: err.message }), { 
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}