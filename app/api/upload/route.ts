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

    // 1. SAFE INITIALIZATION
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
    const resendKey = process.env.RESEND_API_KEY?.trim();

    if (!supabaseUrl || !supabaseKey || !resendKey) {
      throw new Error("Server Configuration Error: Missing Environment Variables");
    }

    const supabase = createClient(supabaseUrl, supabaseKey);
    const resend = new Resend(resendKey);

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // 2. UPLOAD ORIGINAL TO SUPABASE STORAGE
    // We create a unique filename to avoid overwriting
    const fileExt = file.name.split('.').pop();
    const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
    const filePath = `uploads/${fileName}`;

    const { data: storageData, error: storageError } = await supabase.storage
      .from("documents")
      .upload(filePath, buffer, {
        contentType: file.type,
        upsert: false
      });

    if (storageError) throw new Error(`Storage Error: ${storageError.message}`);

    // Get the Public URL for the image
    const { data: { publicUrl } } = supabase.storage
      .from("documents")
      .getPublicUrl(filePath);

    // 3. RUN OCR + TRANSLATION
    const translatedText = await runOCR(buffer);

    // 4. SAVE RECORD TO DATABASE
    const { data, error: dbError } = await supabase
      .from("translations")
      .insert([
        {
          filename: file.name,
          user_email: userEmail,
          extracted_text: translatedText,
          status: "pending",
          image_url: publicUrl // This allows the Admin to see the original image
        },
      ])
      .select()
      .single();

    if (dbError) throw dbError;

    // 5. SEND CONFIRMATION EMAIL
    await resend.emails.send({
      from: "Accucert <onboarding@resend.dev>", 
      to: userEmail,
      subject: "Document Received - Accucert Review Team",
      html: `
        <div style="font-family: sans-serif; color: #333;">
          <h2>Confirmation</h2>
          <p>We have received <strong>${file.name}</strong> for professional translation review.</p>
          <p>You will receive your certified PDF via email once our team completes the verification.</p>
        </div>
      `,
    });

    return new Response(JSON.stringify({ success: true, id: data.id }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });

  } catch (err: any) {
    console.error("UPLOAD ERROR:", err.message);
    return new Response(JSON.stringify({ error: err.message }), { 
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}