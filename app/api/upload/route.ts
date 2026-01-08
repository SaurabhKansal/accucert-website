import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";
import { runOCR } from "@/lib/ocr"; 

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

    // 1. SAFE INITIALIZATION (Prevents build-time 'Invalid supabaseUrl' error)
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const resendKey = process.env.RESEND_API_KEY;

    if (!supabaseUrl || !supabaseKey || !resendKey) {
      console.error("Missing Environment Variables for Upload API");
      return new Response("Server Configuration Error", { status: 500 });
    }

    const supabase = createClient(supabaseUrl, supabaseKey);
    const resend = new Resend(resendKey);

    // 2. OCR + Translation (Google Cloud)
    const buffer = Buffer.from(await file.arrayBuffer());
    const translatedText = await runOCR(buffer);

    // 3. Save to Supabase (Record starts as 'pending')
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

    // 4. Send Confirmation Email to User (Resend)
    await resend.emails.send({
      from: "Accucert <onboarding@resend.dev>", 
      to: userEmail,
      subject: "Document Received - Accucert Professional Review",
      html: `
        <div style="font-family: sans-serif; color: #333; line-height: 1.6;">
          <h2 style="color: #1a2a3a;">We have received your document</h2>
          <p>Hello,</p>
          <p>This is to confirm that we have successfully received <strong>${file.name}</strong> for certified translation.</p>
          <p>Our professional review team is currently processing your request. You will receive an email with your certified PDF once the review is complete.</p>
          <br />
          <hr style="border: none; border-top: 1px solid #eee;" />
          <p style="font-size: 12px; color: #999;">© 2026 Accucert Official Translation Services. All rights reserved.</p>
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