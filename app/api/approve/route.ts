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

    // 1. FETCH THE DESIGN FROM CODIA AI
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
    let designHtml = codiaData.data?.html || codiaData.code?.html || "";

    // 2. THE "CANVA" SWAP: Replace Spanish with English
    // We replace the main content identified by Codia with your English translation.
    // This keeps the borders and layout but changes the words.
    const translatedDoc = designHtml.replace(/>[^<]+</g, (match: string) => {
        // We only replace long text strings to avoid breaking the CSS/HTML structure
        if (match.length > 20) {
            return `>${order.extracted_text}<`;
        }
        return match;
    });

    // 3. BUILD THE FINAL DOCUMENT
    const finalHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            @page { margin: 0; size: A4; }
            body { margin: 0; padding: 0; -webkit-print-color-adjust: exact !important; }
            .letterhead { height: 297mm; padding: 80px; page-break-after: always; box-sizing: border-box; font-family: sans-serif; }
            .canvas-container { width: 210mm; height: 297mm; position: relative; overflow: hidden; }
          </style>
        </head>
        <body>
          <div class="letterhead">
            <h1 style="color: #003461;">ACCUCERT</h1>
            <p>Certified Translation Experts</p>
            <hr style="border: 1px solid #003461; margin: 20px 0;"/>
            <p style="text-align: right;">Date: ${new Date().toLocaleDateString()}</p>
            <h2>CERTIFICATE OF TRANSLATION ACCURACY</h2>
            <p>Accucert hereby certifies the translation for <b>${order.full_name}</b>.</p>
            <p style="margin-top: 150px;">__________________________<br/>Director of Certification</p>
          </div>

          <div class="canvas-container">
            ${translatedDoc}
          </div>
        </body>
      </html>
    `;

    // 4. PRINT TO PDF
    const apiRes = await fetch('https://v2.api2pdf.com/chrome/pdf/html', {
      method: 'POST',
      headers: { 'Authorization': process.env.API2PDF_KEY!, 'Content-Type': 'application/json' },
      body: JSON.stringify({ html: finalHtml, inline: false, options: { printBackground: true, waitForNetworkIdle: true } })
    });
    
    const apiData = await apiRes.json();
    const pdfUrl = apiData.FileUrl || apiData.fileUrl;
    const pdfBuffer = await fetch(pdfUrl).then(res => res.arrayBuffer());

    // 5. DISPATCH
    await resend.emails.send({
      from: 'Accucert <onboarding@resend.dev>',
      to: order.user_email.toString(),
      subject: `Official Certified Translation: ${order.full_name}`,
      text: `Your certified translation is attached.`,
      html: `<p>Hello ${order.full_name}, your official translation is attached.</p>`,
      attachments: [{ filename: `Accucert_Translation.pdf`, content: Buffer.from(pdfBuffer) }],
    });

    await supabase.from('translations').update({ status: 'completed' }).eq('id', orderId);
    return NextResponse.json({ success: true });

  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}