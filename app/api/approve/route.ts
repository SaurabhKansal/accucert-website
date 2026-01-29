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

    // 1. GET DYNAMIC DESIGN FROM CODIA AI
    const codiaRes = await fetch('https://api.codia.ai/v1/open/image_to_design', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${process.env.CODIA_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        image_url: order.image_url, 
        platform: 'web', 
        framework: 'html',
        options: { inline_css: true } 
      })
    });
    
    const codiaData = await codiaRes.json();
    const dynamicHtml = codiaData.data?.html || codiaData.code?.html || "";

    // 2. TEXT SWAP LOGIC
    // We wrap your English translation in a styled div that will sit inside Codia's design container.
    const englishContent = `
      <div style="
        position: absolute; top: 15%; left: 10%; width: 80%; height: 75%; 
        display: flex; flex-direction: column; align-items: center; justify-content: center;
        text-align: center; color: #1a1a1a; font-family: 'Times New Roman', serif;
        font-size: 16px; line-height: 1.6; z-index: 999;
      ">
        <h1 style="font-size: 24px; text-transform: uppercase; margin-bottom: 20px;">Official Translated Record</h1>
        <div style="white-space: pre-wrap;">${order.extracted_text}</div>
      </div>
    `;

    // 3. CONSTRUCT THE DOCUMENT
    const finalHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            @page { margin: 0; size: A4; }
            body { margin: 0; padding: 0; -webkit-print-color-adjust: exact !important; }
            .letterhead { height: 297mm; padding: 80px; page-break-after: always; box-sizing: border-box; font-family: sans-serif; }
            /* This container holds the Codia Design (Borders/Backgrounds) */
            .design-wrapper { width: 210mm; height: 297mm; position: relative; overflow: hidden; }
            /* We hide the original Spanish text from Codia while keeping the structure */
            .design-wrapper span, .design-wrapper p, .design-wrapper h1 { visibility: hidden; }
            /* Show our injected English content */
            .english-overlay { visibility: visible !important; }
          </style>
        </head>
        <body>
          <div class="letterhead">
            <h1 style="color: #003461;">ACCUCERT</h1>
            <p>Certified Legal Translations</p>
            <hr style="border: 1px solid #003461; margin: 20px 0;"/>
            <p style="text-align: right;">Date: ${new Date().toLocaleDateString()}</p>
            <h2>CERTIFICATE OF ACCURACY</h2>
            <p>Accucert hereby certifies the translation for <b>${order.full_name}</b> is an accurate rendering of the original document.</p>
            <p style="margin-top: 150px;">__________________________<br/>Director of Certification</p>
          </div>

          <div class="design-wrapper">
            ${dynamicHtml}
            
            <div class="english-overlay">
              ${englishContent}
            </div>
          </div>
        </body>
      </html>
    `;

    // 4. PRINT TO PDF
    const apiRes = await fetch('https://v2.api2pdf.com/chrome/pdf/html', {
      method: 'POST',
      headers: { 'Authorization': process.env.API2PDF_KEY!, 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        html: finalHtml, 
        inline: false, 
        options: { printBackground: true, waitForNetworkIdle: true } 
      })
    });
    
    const apiData = await apiRes.json();
    const pdfUrl = apiData.FileUrl || apiData.fileUrl;

    const pdfBuffer = await fetch(pdfUrl).then(res => res.arrayBuffer());

    // 5. DISPATCH
    await resend.emails.send({
      from: 'Accucert <onboarding@resend.dev>',
      to: order.user_email.toString(),
      subject: `Official Certified Translation: ${order.full_name}`,
      text: `Your translation for ${order.document_type} is attached.`,
      html: `<p>Hello ${order.full_name}, your translation is attached.</p>`,
      attachments: [{ filename: `Accucert_Translation.pdf`, content: Buffer.from(pdfBuffer) }],
    });

    await supabase.from('translations').update({ status: 'completed' }).eq('id', orderId);
    return NextResponse.json({ success: true });

  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}