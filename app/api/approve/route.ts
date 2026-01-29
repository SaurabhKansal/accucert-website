export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(req: Request) {
  try {
    const { orderId } = await req.json();
    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
    const { data: order } = await supabase.from('translations').select('*').eq('id', orderId).single();

    if (!order) throw new Error('Order not found');

    // 1. GET THE FULL DESIGN FROM CODIA AI
    const codiaRes = await fetch('https://api.codia.ai/v1/open/image_to_design', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${process.env.CODIA_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ image_url: order.image_url, platform: 'web', framework: 'html' })
    });
    const codiaData = await codiaRes.json();
    const translationHtml = codiaData.data?.html || codiaData.code?.html || order.extracted_text;

    // 2. CONSTRUCT THE EMAIL BODY (Letter + Design)
    // We use "page-break" CSS so that when they print the email, it stays on separate pages.
    const emailHtml = `
      <div style="font-family: sans-serif; background-color: #f9f9f9; padding: 20px;">
        <div style="max-width: 800px; margin: auto; background: white; border: 1px solid #ddd; box-shadow: 0 4px 12px rgba(0,0,0,0.1);">
          
          <div style="padding: 60px; border-bottom: 2px solid #eee; page-break-after: always;">
            <h1 style="margin:0; font-size: 28px; color: #000;">ACCUCERT</h1>
            <p style="font-style: italic; color: #666; margin-bottom: 30px;">Official Translation Services</p>
            <hr/>
            <h2 style="margin-top: 40px;">CERTIFICATE OF ACCURACY</h2>
            <p>This is to certify that the attached document is a true and accurate translation.</p>
            <div style="background: #f4f4f4; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <strong>Client:</strong> ${order.full_name}<br>
              <strong>Document:</strong> ${order.document_type}<br>
              <strong>Order ID:</strong> ${orderId}
            </div>
            <p style="margin-top: 60px;"><strong>Director of Certification</strong></p>
            <p style="font-size: 12px; color: #999;">(Print this email to save as an official PDF)</p>
          </div>

          <div style="padding: 0; width: 100%; overflow: hidden;">
            ${translationHtml}
          </div>

        </div>
      </div>
    `;

    // 3. DISPATCH (No PDF service needed!)
    await resend.emails.send({
      from: 'Accucert <onboarding@resend.dev>',
      to: order.user_email,
      subject: `Your Certified Translation: ${order.full_name}`,
      html: emailHtml,
    });

    await supabase.from('translations').update({ status: 'completed' }).eq('id', orderId);
    return NextResponse.json({ success: true });

  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}