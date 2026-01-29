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

    // 1. Fetch the High-Fidelity Design from Codia
    const codiaRes = await fetch('https://api.codia.ai/v1/open/image_to_design', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${process.env.CODIA_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ image_url: order.image_url, platform: 'web', framework: 'html' })
    });
    const codiaData = await codiaRes.json();
    const translationDesign = codiaData.data?.html || codiaData.code?.html || order.extracted_text;

    // 2. Build a Print-Ready HTML Document
    const fullHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            @page { margin: 0; size: A4; }
            body { font-family: Arial, sans-serif; margin: 0; padding: 0; -webkit-print-color-adjust: exact; }
            .letter-head { height: 1000px; padding: 60px; page-break-after: always; position: relative; }
            .footer-branding { position: absolute; bottom: 40px; left: 60px; font-size: 10px; color: #666; }
            .design-layer { width: 100%; height: auto; }
          </style>
        </head>
        <body>
          <div class="letter-head">
            <h1 style="color: #003461; margin: 0; font-size: 32px;">ACCUCERT</h1>
            <p style="font-style: italic; margin-top: 5px;">Certified Translation Services</p>
            <div style="border-bottom: 2px solid #003461; margin: 20px 0;"></div>
            <p style="text-align: right;">Date: ${new Date().toLocaleDateString()}</p>
            <h2 style="margin-top: 50px;">CERTIFICATE OF TRANSLATION ACCURACY</h2>
            <p>This is an official certification that the document titled <b>${order.document_type}</b> has been translated accurately from <b>${order.language_from}</b> to <b>${order.language_to}</b>.</p>
            <div style="background: #f8f9fa; padding: 25px; border-radius: 8px; margin: 30px 0;">
               <strong>Order ID:</strong> ${orderId}<br/>
               <strong>Client:</strong> ${order.full_name}
            </div>
            <p style="margin-top: 100px;">__________________________<br/>Director of Certification</p>
            <div class="footer-branding">Accucert Ltd. Official Certification Document</div>
          </div>

          <div class="design-layer">
            ${translationDesign}
          </div>
        </body>
      </html>
    `;

    // 3. Render PDF via Api2Pdf (Preserves the design!)
    const apiRes = await fetch('https://v2.api2pdf.com/chrome/html', {
      method: 'POST',
      headers: { 'Authorization': process.env.API2PDF_KEY!, 'Content-Type': 'application/json' },
      body: JSON.stringify({ html: fullHtml, inline: false, fileName: `Certified_${order.full_name}.pdf` })
    });
    
    const apiData = await apiRes.json();
    if (!apiData.FileUrl) throw new Error("PDF Printing Failed - Check Api2Pdf Credits");

    const pdfBuffer = await fetch(apiData.FileUrl).then(res => res.arrayBuffer());

    // 4. Send Email with Professional Attachment
    await resend.emails.send({
      from: 'Accucert <onboarding@resend.dev>',
      to: order.user_email,
      subject: `Official Certified Translation: ${order.full_name}`,
      html: `<p>Hello ${order.full_name}, your official certified translation is attached.</p>`,
      attachments: [{ filename: `Accucert_Certified_${orderId.slice(0,6)}.pdf`, content: Buffer.from(pdfBuffer) }],
    });

    await supabase.from('translations').update({ status: 'completed' }).eq('id', orderId);
    return NextResponse.json({ success: true });

  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}