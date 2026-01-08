import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";
import { runOCR } from "@/lib/ocr"; // This should be your Google Vision + Translate function

// Initialize clients
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY! // Use Service Role for backend writes
);
const resend = new Resend(process.env.RESEND_API_KEY);

export const runtime = "nodejs";
export const maxDuration = 300; 

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const userEmail = formData.get("email") as string | null;

    if (!file || !userEmail) {
      return new Response("Missing file or email", { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    // 1. OCR + Translation (Google Cloud)
    // This function now returns the English translation
    const translatedText = await runOCR(buffer);

    // 2. Save to Supabase
    const { data, error: dbError } = await supabase
      .from("translations")
      .insert([
        {
          filename: file.name,
          user_email: userEmail,
          extracted_text: translatedText,
          status: "pending",
        },
      ])
      .select()
      .single();

    if (dbError) throw dbError;

    // 3. Send Confirmation Email to User (Resend)
    await resend.emails.send({
      from: "Accucert <onboarding@resend.dev>", // Change this once you verify a domain
      to: userEmail,
      subject: "We've Received Your Document",
      html: `
        <div style="font-family: sans-serif; color: #333;">
          <h2>Hello,</h2>
          <p>We have successfully received your document: <strong>${file.name}</strong>.</p>
          <p>Our team is currently reviewing the translation. You will receive another email with the certified PDF once it has been approved.</p>
          <hr />
          <p style="font-size: 12px; color: #666;">© 2026 Accucert Official Translation Services</p>
        </div>
      `,
    });

    return new Response(JSON.stringify({ success: true, id: data.id }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });

  } catch (err: any) {
    console.error("UPLOAD ROUTE ERROR:", err);
    return new Response(`Error: ${err.message}`, { status: 500 });
  }
}