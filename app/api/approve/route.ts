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

    if (!order) throw new Error('Order not found.');

    // 1. GET FULL DESIGN FROM CODIA AI
    const codiaRes = await fetch('https://api.codia.ai/v1/open/image_to_design', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${process.env.CODIA_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        image_url: order.image_url, 
        platform: 'web', 
        framework: 'html',
        options: { inline_css: true } // Forces styles to be inside the HTML tags
      })
    });
    
    const codiaData = await codiaRes.json();
    // Safety: If Codia fails, we at least show the text, but prioritize the HTML Design
    const translationHtml = codiaData.data?.html || codiaData.code?.html || `<div>${order.extracted_text}</div>`;

    // 2. CONSTRUCT THE PIXEL-PERFECT SHELL
    // We add "-webkit-print-color-adjust" to FORCE the gold border and backgrounds to print
    const finalHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            @page { margin: 0; size: A4; }
            body { margin: 0; padding: 0; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
            .letterhead-page { height: 297mm; width: 210mm; padding: 60px; box-sizing: border-box; page-break-after: always; font-family: sans-serif; background: white; position: relative; }
            .design-page { width: 210mm; min-height: 297mm; position: relative; }
            .blue-line { border-bottom: 3px solid #003461; margin: 20px 0; }
          </style>
        </head>
        <body>
          <div class="letterhead-page">
            <h1 style="color: #003461; margin:0;">ACCUCERT</h1>
            <p style="font-style: italic; color: #666;">Official Certified Translation Services</p>
            <div class="blue-line"></div>
            <p style="text-align: right;">Date: ${new Date().toLocaleDateString()}</p>
            <h2 style="margin-top: 50px;">CERTIFICATE OF TRANSLATION ACCURACY</h2>
            <p>Accucert hereby certifies that the attached translation for <b>${order.full_name}</b> is an accurate rendering of the original document.</p>
            <div style="margin-top: 150px;">
              <div style="border-top: 1px solid #000; width: 200px; padding-top: 10px;">Director of Certification</div>
            </div>
          </div>
          <div class="design-page">
            ${translationHtml}
          </div>
        </body>
      </html>
    `;

    // 3. PRINT VIA API2PDF (New "Wait" settings to catch the design)
    const apiRes = await fetch('https://v2.api2pdf.com/chrome/pdf/html', {
      method: 'POST',
      headers: { 'Authorization': process.env.API2PDF_KEY!, 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        html: finalHtml, 
        inline: false, 
        options: { 
          printBackground: true, 
          waitForNetworkIdle: true, // WAITS for images/borders to load
          useLatestChrome: true 
        } 
      })
    });
    
    const apiData = await apiRes.json();
    const pdfUrl = apiData.FileUrl || apiData.fileUrl || apiData.pdf;
    if (!pdfUrl) throw new Error("PDF failed to generate a URL.");

    const pdfBuffer = await fetch(pdfUrl).then(res => res.arrayBuffer());

    // 4. DISPATCH (Fixes the "text property missing" error)
    await resend.emails.send({
      from: 'Accucert <onboarding@resend.dev>',
      to: order.user_email.toString(),
      subject: `Official Certified Translation: ${order.full_name}`,
      text: `Your certified translation for ${order.document_type} is attached.`, // REQUIRED
      html: `<p>Hello ${order.full_name}, your official certified translation is attached as a PDF.</p>`,
      attachments: [{ 
        filename: `Accucert_Certified_Translation.pdf`, 
        content: Buffer.from(pdfBuffer) 
      }],
    });

    await supabase.from('translations').update({ status: 'completed' }).eq('id', orderId);
    return NextResponse.json({ success: true });

  } catch (err: any) {
    console.error("DISPATCH_ERROR:", err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}