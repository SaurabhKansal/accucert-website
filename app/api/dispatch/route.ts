import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(req: Request) {
  try {
    const { orderId } = await req.json();
    
    // 1. Initialize Supabase
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!, 
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
    
    // 2. Fetch order data
    const { data: order, error: dbError } = await supabase
      .from('translations')
      .select('*')
      .eq('id', orderId)
      .single();

    if (dbError || !order) throw new Error("Order not found in database.");
    if (!order.translated_url) throw new Error("Preview not ready. AI process might still be running.");

    // 3. Download the reconstructed image from WaveSpeed CDN
    const fileRes = await fetch(order.translated_url);
    if (!fileRes.ok) throw new Error("Failed to download the translated document from the source.");
    
    const fileBuffer = await fileRes.arrayBuffer();

    // 4. Send Email via Resend
    const { data: emailData, error: emailError } = await resend.emails.send({
      from: 'Accucert <onboarding@resend.dev>', // Note: Change this to your verified domain in production
      to: order.user_email,
      subject: `Certified Translation: ${order.full_name}`,
      html: `
        <div style="font-family: sans-serif; line-height: 1.5; color: #333;">
          <h2>Your Translation is Ready</h2>
          <p>Hi ${order.full_name},</p>
          <p>Your official English translation for <strong>${order.document_type || 'your document'}</strong> has been successfully processed.</p>
          <p>Please find the reconstructed certified document attached to this email.</p>
          <br/>
          <p>Best regards,<br/><strong>Accucert Global Team</strong></p>
        </div>
      `,
      attachments: [{
        filename: `Accucert_Translation_${orderId}.jpg`, // Dynamic filename for better tracking
        content: Buffer.from(fileBuffer),
      }],
    });

    if (emailError) throw new Error(`Email failed: ${emailError.message}`);

    // 5. Final Status Update
    await supabase
      .from('translations')
      .update({ status: 'completed' })
      .eq('id', orderId);

    return NextResponse.json({ success: true, message: "Translation dispatched successfully." });

  } catch (err: any) {
    console.error("DISPATCH_ERROR:", err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}