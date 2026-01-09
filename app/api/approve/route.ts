import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";
import { generateCertifiedPdf } from "@/lib/generateCertifiedPdf";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const { requestId, email } = await req.json();

    // 1. GET & VALIDATE VARIABLES
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
    const resendKey = process.env.RESEND_API_KEY?.trim();

    // Audit Log for Debugging
    console.log("Approval API Audit:", {
      hasUrl: !!supabaseUrl,
      hasServiceKey: !!supabaseKey,
      hasResendKey: !!resendKey,
      requestId,
      clientEmail: email
    });

    if (!supabaseUrl || !supabaseUrl.startsWith("https://")) {
      return new Response(
        JSON.stringify({ error: "Invalid Supabase configuration." }), 
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

    // 4. GENERATE THE CERTIFIED PDF (Updated for Request 3)
    // We now pass fullName and orderId so Page 1 of the PDF is personalized
    const pdfBytes = await generateCertifiedPdf({
      originalFilename: translation.filename,
      extractedText: translation.extracted_text,
      fullName: translation.full_name || "Valued Client",
      orderId: translation.id
    });

    // 5. SEND EMAIL WITH ATTACHMENT
    const { error: emailError } = await resend.emails.send({
      from: "Accucert Team <onboarding@resend.dev>", 
      to: email,
      subject: `Approved: Certified Translation for ${translation.filename}`,
      html: `
        <div style="font-family: sans-serif; color: #18222b; line-height: 1.6; max-width: 600px; margin: auto; border: 1px solid #eee; padding: 20px; border-radius: 10px;">
          <h2 style="color: #18222b; border-bottom: 2px solid #18222b; padding-bottom: 10px;">Official Translation Ready</h2>
          <p>Hello <strong>${translation.full_name}</strong>,</p>
          <p>Our professional review team has completed the certification of your document: <strong>${translation.filename}</strong>.</p>
          <p>Please find your official <strong>Certified PDF Package</strong> attached to this email. This package includes:</p>
          <ul>
            <li>Certificate of Translation Accuracy</li>
            <li>Certified Translation Text</li>
          </ul>
          <br />
          <p>Thank you for choosing Accucert.</p>
          <hr style="border:none; border-top:1px solid #eee;" />
          <p style="font-size: 11px; color: #999;">Accucert Professional Translation Services | Order ID: ${translation.id.slice(0,8)}</p>
        </div>
      `,
      attachments: [
        {
          filename: `Certified_Translation_${translation.filename}.pdf`,
          content: Buffer.from(pdfBytes).toString("base64"), // Convert to Base64 for Resend
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