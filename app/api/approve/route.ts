export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(req: Request) {
  try {
    const { orderId } = await req.json();
    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
    const { data: order, error: dbErr } = await supabase.from('translations').select('*').eq('id', orderId).single();

    if (dbErr || !order) throw new Error('Order not found in database.');

    // 1. GET THE HIGH-RES DESIGN IMAGE
    const codiaRes = await fetch('https://api.codia.ai/v1/open/image_to_design', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${process.env.CODIA_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ image_url: order.image_url, platform: 'web', render_image: true })
    });
    const codiaData = await codiaRes.json();
    const designImageUrl = codiaData.data?.image_url || order.image_url;

    // 2. CONVERT IMAGE TO BASE64 (This prevents "Blank PDF" issues)
    const imageRes = await fetch(designImageUrl);
    const imageArrayBuffer = await imageRes.arrayBuffer();
    const base64Image = Buffer.from(imageArrayBuffer).toString('base64');
    const imageType = imageRes.headers.get('content-type') || 'image/png';

    // 3. BUILD THE "CANVA" OVERLAY HTML
    const finalHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            @page { margin: 0; size: A4; }
            body { margin: 0; padding: 0; font-family: 'Times New Roman', serif; }
            .page { width: 210mm; height: 297mm; position: relative; page-break-after: always; overflow: hidden; }
            
            /* PAGE 1: THE CERTIFICATION */
            .letterhead { padding: 80px; background: white; height: 100%; box-sizing: border-box; }
            
            /* PAGE 2: THE CANVA-STYLE DESIGN */
            .design-bg { 
              position: absolute; top: 0; left: 0; width: 100%; height: 100%;
              background-image: url('data:${imageType};base64,${base64Image}');
              background-size: contain; background-repeat: no-repeat; background-position: center;
              z-index: 1;
            }
            .english-text-layer {
              position: absolute; top: 18%; left: 12%; width: 76%; height: 65%;
              z-index: 10; padding: 20px;
              display: flex; flex-direction: column; align-items: center; justify-content: center;
              text-align: center; color: #333; line-height: 1.8; font-size: 16px;
              /* This makes the box "blend" into the parchment background */
              background: rgba(253, 250, 245, 0.85); 
              backdrop-filter: blur(2px);
              white-space: pre-wrap;
            }
          </style>
        </head>
        <body>
          <div class="page">
            <div class="letterhead">
              <h1 style="color: #003461; margin: 0;">ACCUCERT</h1>
              <p>Certified Translation Services</p>
              <hr style="border: 1px solid #003461; margin: 20px 0;"/>
              <p style="text-align: right;">Date: ${new Date().toLocaleDateString()}</p>
              <h2 style="margin-top: 40px;">CERTIFICATE OF ACCURACY</h2>
              <p>Accucert hereby certifies the translation for <b>${order.full_name}</b> is accurate.</p>
              <p style="margin-top: 150px;">__________________________<br/>Director of Certification</p>
            </div>
          </div>

          <div class="page">
            <div class="design-bg"></div>
            <div class="english-text-layer">
              <h2 style="text-transform: uppercase; border-bottom: 1px solid #8b6b32; margin-bottom: 20px;">English Translation</h2>
              ${(order.extracted_text || "").replace(/&nbsp;/g, ' ')}
            </div>
          </div>
        </body>
      </html>
    `;

    // 4. PRINT TO PDF
    const apiRes = await fetch('https://v2.api2pdf.com/chrome/pdf/html', {
      method: 'POST',
      headers: { 'Authorization': process.env.API2PDF_KEY!, 'Content-Type': 'application/json' },
      body: JSON.stringify({ html: finalHtml, inline: false, options: { printBackground: true } })
    });
    
    const apiData = await apiRes.json();
    const pdfUrl = apiData.FileUrl || apiData.fileUrl || apiData.pdf;
    if (!pdfUrl) throw new Error("Api2Pdf failed: " + JSON.stringify(apiData));

    const finalPdf = await fetch(pdfUrl).then(res => res.arrayBuffer());

    // 5. DISPATCH
    await resend.emails.send({
      from: 'Accucert <onboarding@resend.dev>',
      to: (order.user_email || '').toString(),
      subject: `Official Certified Translation: ${order.full_name}`,
      text: `Your certified translation for ${order.document_type} is attached.`,
      html: `<p>Hello ${order.full_name}, your official translation is attached.</p>`,
      attachments: [{ filename: `Accucert_Translation.pdf`, content: Buffer.from(finalPdf) }],
    });

    await supabase.from('translations').update({ status: 'completed' }).eq('id', orderId);
    return NextResponse.json({ success: true });

  } catch (err: any) {
    console.error("FINAL_ERROR:", err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}