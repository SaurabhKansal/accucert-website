import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";
import { generateCertifiedPdf } from "@/lib/generateCertifiedPdf";

// Note: Use SERVICE_ROLE_KEY here because it bypasses RLS for admin actions
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);
const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(req: Request) {
  try {
    const { requestId, email } = await req.json();

    // 1. Fetch the data from Supabase
    const { data: translation, error: fetchError } = await supabase
      .from("translations")
      .select("*")
      .eq("id", requestId)
      .single();

    if (fetchError || !translation) {
      throw new Error("Could not find translation request.");
    }

    // 2. Generate the PDF using the text we stored earlier
    const pdfBytes = await generateCertifiedPdf({
      originalFilename: translation.filename,
      extractedText: translation.extracted_text,
    });

    // 3. Send the Email with the Attachment
    const { data, error: emailError } = await resend.emails.send({
      from: "Accucert Team <onboarding@resend.dev>", // Generic for now
      to: email,
      subject: `Approved: Certified Translation for ${translation.filename}`,
      html: `
        <div style="font-family: sans-serif; color: #333;">
          <h2>Your Certified Translation is Ready</h2>
          <p>The review of your document <strong>${translation.filename}</strong> is complete.</p>
          <p>Please find the certified PDF attached to this email.</p>
          <br />
          <p>Thank you for choosing Accucert.</p>
        </div>
      `,
      attachments: [
        {
          filename: `certified-${translation.filename}.pdf`,
          content: Buffer.from(pdfBytes),
        },
      ],
    });

    if (emailError) throw emailError;

    // 4. Update the status to 'approved' so it clears from the pending list
    await supabase
      .from("translations")
      .update({ status: "approved" })
      .eq("id", requestId);

    return new Response(JSON.stringify({ success: true }), { status: 200 });

  } catch (err: any) {
    console.error("APPROVAL ERROR:", err);
    return new Response(`Error: ${err.message}`, { status: 500 });
  }
}