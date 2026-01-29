export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(req: Request) {
  try {
    const { orderId } = await req.json();
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!, 
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // 1. DATABASE FETCH & PRE-FLIGHT
    const { data: order, error: dbErr } = await supabase.from('translations').select('*').eq('id', orderId).single();
    if (dbErr || !order) throw new Error('Order not found in database.');

    if (!process.env.API2PDF_KEY) throw new Error('Missing API2PDF_KEY in environment variables.');

    // 2. GET DESIGN FROM CODIA (With error catching)
    let translationHtml = order.extracted_text || '';
    try {
      const codiaRes = await fetch('https://api.codia.ai/v1/open/image_to_design', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${process.env.CODIA_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ image_url: order.image_url, platform: 'web', framework: 'html' })
      });
      const codiaData = await codiaRes.json();
      if (codiaRes.ok) {
        translationHtml = codiaData.data?.html || codiaData.code?.html || translationHtml;
      }
    } catch (e) {
      console.warn("Codia failed, using base text for PDF.");
    }

    // 3. CONSTRUCT ROBUST HTML DOCUMENT
    const fullHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            @page { margin: 0; size: A4; }
            body { font-family: sans-serif; margin: 0; padding: 0; }
            .letter-page { padding: 80px; height: 1000px; page-break-after: always; position: relative; }
            .header-line { border-bottom: 2px solid #000; margin: 20px 0; }
            .details-box { background: #f4f4f4; padding: 20px; margin: 20px 0; border-radius: 5px; }
            .design-page { width: 100%; padding: 40px; box-sizing: border-box; }
          </style>
        </head>
        <body>
          <div class="letter-page">
            <h1 style="font-size: 32px; margin: 0;">ACCUCERT</h1>
            <p style="font-style: italic; color: #555;">Official Translation & Legalisation Services</p>
            <div class="header-line"></div>
            <p style="text-align: right;">Date: ${new Date().toLocaleDateString()}</p>
            <h2 style="margin-top: 40px;">CERTIFICATE OF TRANSLATION ACCURACY</h2>
            <p>Accucert Translation Services hereby certifies that the following document is a true and accurate translation.</p>
            <div class="details-box">
              <strong>Client:</strong> ${order.full_name || 'N/A'}<br>
              <strong>Document:</strong> ${order.document_type || 'Official'}<br>
              <strong>Languages:</strong> ${order.language_from} to ${order.language_to}
            </div>
            <p style="margin-top: 100px;">__________________________<br>Director of Certification</p>
          </div>
          <div class="design-page">
            ${translationHtml}
          </div>
        </body>
      </html>
    `;

    // 4. GENERATE PDF VIA API2PDF (Stable Endpoint)
    const api2pdfRes = await fetch('https://v2.api2pdf.com/chrome/html', {
      method: 'POST',
      headers: { 
        'Authorization': process.env.API2PDF_KEY, 
        'Content-Type': 'application/json' 
      },
      body: JSON.stringify({ 
        html: fullHtml, 
        inline: false, 
        fileName: `Certified_Order_${orderId.slice(0,5)}.pdf` 
      })
    });

    const apiResult = await api2pdfRes.json();
    if (!api2pdfRes.ok || !apiResult.FileUrl) {
      throw new Error(`Api2Pdf Error: ${apiResult.message || 'Check your API2PDF_KEY and Balance'}`);
    }

    // 5. FETCH BYTES & SEND EMAIL
    const pdfResponse = await fetch(apiResult.FileUrl);
    const pdfBuffer = await pdfResponse.arrayBuffer();

    await resend.emails.send({
      from: 'Accucert <onboarding@resend.dev>',
      to: order.user_email,
      subject: 'Your Official Certified Translation',
      html: `<p>Hello ${order.full_name}, your certified PDF is attached.</p>`,
      attachments: [{
        filename: 'Accucert_Certified_Translation.pdf',
        content: Buffer.from(pdfBuffer),
      }],
    });

    await supabase.from('translations').update({ status: 'completed' }).eq('id', orderId);
    return NextResponse.json({ success: true });

  } catch (err: any) {
    console.error("CRITICAL_DISPATCH_ERROR:", err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}