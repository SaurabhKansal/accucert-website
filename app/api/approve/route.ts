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

    // 1. GET PIXEL-PERFECT DESIGN FROM CODIA
    const codiaRes = await fetch('https://api.codia.ai/v1/open/image_to_design', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${process.env.CODIA_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ image_url: order.image_url, platform: 'web', framework: 'html' })
    });
    const codiaData = await codiaRes.json();
    const translationHtml = codiaData.data?.html || codiaData.code?.html || order.extracted_text;

    // 2. CONSTRUCT THE FULL DOCUMENT HTML (Cover Letter + Codia Design)
    const fullHtmlDocument = `
      <html>
        <head>
          <style>
            @page { margin: 0; }
            body { font-family: 'Helvetica', sans-serif; margin: 0; padding: 0; }
            .page-break { page-break-after: always; }
            .letter-head { padding: 60px; height: 1000px; position: relative; }
            .design-page { width: 100%; height: auto; }
            .header-line { border-bottom: 2px solid #000; margin: 20px 0; }
          </style>
        </head>
        <body>
          <div class="letter-head page-break">
            <h1 style="margin:0; font-size: 32px;">ACCUCERT</h1>
            <p style="font-style: italic; color: #555;">Official Translation & Legalisation Services</p>
            <div class="header-line"></div>
            <p style="text-align: right;">Date: ${new Date().toLocaleDateString()}</p>
            <h2 style="margin-top: 50px;">CERTIFICATE OF TRANSLATION ACCURACY</h2>
            <p>To Whom It May Concern,</p>
            <p>Accucert Translation Services hereby certifies that the attached document is a true, complete, and accurate translation of the original text.</p>
            <div style="background: #f4f4f4; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <strong>Client:</strong> ${order.full_name}<br>
              <strong>Document:</strong> ${order.document_type}<br>
              <strong>Languages:</strong> ${order.language_from} to ${order.language_to}<br>
              <strong>Ref:</strong> ${orderId}
            </div>
            <p>I further certify that I am competent in both languages and this translation meets international standards.</p>
            <div style="margin-top: 100px;">
              <div style="border-top: 1px solid #000; width: 200px; padding-top: 5px;">Director of Certification</div>
            </div>
          </div>

          <div class="design-page">
            ${translationHtml}
          </div>
        </body>
      </html>
    `;

    // 3. CONVERT HTML TO PDF USING API2PDF (Preserves Codia Design)
    const pdfRes = await fetch('https://v2.api2pdf.com/chrome/html', {
      method: 'POST',
      headers: { 'Authorization': process.env.API2PDF_KEY!, 'Content-Type': 'application/json' },
      body: JSON.stringify({ html: fullHtmlDocument, inline: false, fileName: `Accucert_${orderId}.pdf` })
    });
    const pdfData = await pdfRes.json();
    
    // Fetch the actual PDF bytes from the URL Api2Pdf provides
    const finalPdfFile = await fetch(pdfData.FileUrl).then(res => res.arrayBuffer());

    // 4. SEND VIA RESEND
    await resend.emails.send({
      from: 'Accucert <onboarding@resend.dev>',
      to: order.user_email,
      subject: `Official Certified Translation: ${order.full_name}`,
      html: `<p>Hello ${order.full_name}, please find your certified translation attached.</p>`,
      attachments: [{
        filename: `Accucert_Certified_Translation.pdf`,
        content: Buffer.from(finalPdfFile),
      }],
    });

    await supabase.from('translations').update({ status: 'completed' }).eq('id', orderId);
    return NextResponse.json({ success: true });

  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}