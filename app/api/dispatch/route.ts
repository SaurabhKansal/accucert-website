export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(req: Request) {
  try {
    const { orderId } = await req.json();

    // 1. INITIALIZE SUPABASE
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // 2. FETCH THE ALREADY RECONSTRUCTED DOCUMENT
    const { data: order, error: dbError } = await supabase
      .from('translations')
      .select('*')
      .eq('id', orderId)
      .single();

    if (dbError || !order) throw new Error('Order record not found.');
    if (!order.translated_url) throw new Error('AI Reconstruction has not been completed yet.');

    // 3. DOWNLOAD THE FILE FROM WAVESPEED/CDN
    const fileRes = await fetch(order.translated_url);
    if (!fileRes.ok) throw new Error('Failed to retrieve the file from the cloud storage.');
    const fileBuffer = await fileRes.arrayBuffer();

    // 4. DISPATCH VIA RESEND
    const emailResult = await resend.emails.send({
      from: 'Accucert <onboarding@resend.dev>', // Update to your domain once verified
      to: order.user_email,
      subject: `Official Certified Translation: ${order.full_name}`,
      html: `
        <div style="font-family: sans-serif; padding: 40px; background-color: #f8fafc; color: #1e293b;">
          <div style="max-width: 600px; margin: 0 auto; background: white; padding: 40px; border-radius: 24px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1);">
            <h1 style="color: #0f172a; font-size: 24px; font-weight: 800; margin-bottom: 24px;">Your Translation is Ready</h1>
            <p style="font-size: 16px; line-height: 1.6;">Hi ${order.full_name},</p>
            <p style="font-size: 16px; line-height: 1.6;">Your <strong>${order.document_type || 'document'}</strong> has been successfully translated from ${order.language_from} to ${order.language_to}.</p>
            <p style="font-size: 16px; line-height: 1.6;">Please find your certified high-fidelity reconstruction attached to this email.</p>
            <div style="margin-top: 40px; padding-top: 24px; border-top: 1px solid #e2e8f0;">
              <p style="font-size: 12px; color: #64748b;">Accucert Global - Official Certified Translation Services</p>
            </div>
          </div>
        </div>
      `,
      attachments: [{
        filename: `Accucert_Translation_${orderId}.jpg`,
        content: Buffer.from(fileBuffer),
      }],
    });

    if (emailResult.error) throw new Error(`Email Dispatch Failed: ${emailResult.error.message}`);

    // 5. UPDATE FINAL STATUS IN DATABASE
    await supabase
      .from('translations')
      .update({ status: 'completed' })
      .eq('id', orderId);

    return NextResponse.json({ success: true, message: "Email dispatched successfully." });

  } catch (err: any) {
    console.error("DISPATCH_CRITICAL_FAILURE:", err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}