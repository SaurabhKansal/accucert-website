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
      return new Response(JSON.stringify({ error: "Missing file or email" }), { status: 400 });
    }

    // 1. GET & VALIDATE VARIABLES
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim(); // .trim() removes hidden spaces
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
    const resendKey = process.env.RESEND_API_KEY?.trim();

    // DEBUG LOG: Check this in Vercel Logs to identify the typo
    console.log("Configuration Audit:", {
      urlExists: !!supabaseUrl,
      urlIsValid: supabaseUrl?.startsWith("https://"),
      keyExists: !!supabaseKey,
      emailExists: !!userEmail
    });

    if (!supabaseUrl || !supabaseUrl.startsWith("https://")) {
      throw new Error(`Invalid Supabase URL: Check your Vercel Environment Variables.`);
    }

    // 2. INITIALIZE CLIENTS
    const supabase = createClient(supabaseUrl, supabaseKey!);
    const resend = new Resend(resendKey);

    // 3. OCR + TRANSLATION
    const buffer = Buffer.from(await file.arrayBuffer());
    const translatedText = await runOCR(buffer);

    // 4. SAVE TO SUPABASE
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

    if (dbError) {
      console.error("Database Error:", dbError);
      throw new Error(`Database save failed: ${dbError.message}`);
    }

    // 5. SEND CONFIRMATION EMAIL
    await resend.emails.send({
      from: "Accucert <onboarding@resend.dev>", 
      to: userEmail,
      subject: "Document Received - Accucert Professional Review",
      html: `
        <div style="font-family: sans-serif; color: #333; line-height: 1.6;">
          <h2 style="color: #1a2a3a;">Confirmation</h2>
          <p>We have successfully received <strong>${file.name}</strong>.</p>
          <p>Our team is reviewing the document. You will receive an email with your certified PDF once approved.</p>
          <br />
          <p>© 2026 Accucert Official Translation Services</p>
        </div>
      `,
    });

    return new Response(JSON.stringify({ success: true, id: data.id }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });

  } catch (err: any) {
    console.error("CRITICAL UPLOAD ERROR:", err.message);
    return new Response(JSON.stringify({ error: err.message }), { 
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}