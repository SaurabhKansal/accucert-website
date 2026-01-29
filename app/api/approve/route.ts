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

    if (dbErr || !order) throw new Error('Order not found.');

    // 1. CLEAN THE TEXT (Fixes the TypeScript 'tag' error)
    const cleanTranslation = (order.extracted_text || "")
      .replace(/&nbsp;/g, ' ')
      .replace(/<[^>]*>/g, (tag: string) => (tag === '<br>' || tag === '</p>') ? '\n' : '')
      .trim();

    // 2. GET THE DESIGN IMAGE FROM CODIA
    const codiaRes = await fetch('https://api.codia.ai/v1/open/image_to_design', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${process.env.CODIA_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        image_url: order.image_url, 
        platform: 'web', 
        render_image: true 
      })
    });
    const codiaData = await codiaRes.json();
    // Fallback to the original uploaded image if Codia image fails
    const designImage = codiaData.data?.image_url || order.image_url;

    // 3. CONSTRUCT THE PDF HTML (Page 1: Letter, Page 2: Design + English)
    const finalHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            @page { margin: 0; size: A4; }
            body { margin: 0; padding: 0; font-family: 'Helvetica', Arial, sans-serif; }
            .page { width: 210mm; height: 297mm; position: relative; overflow: hidden; page-break-after: always; box-sizing: border-box; }
            
            /* PAGE 1: OFFICIAL LETTER */
            .letter-content { padding: 80px; background: white; height: 100%; }
            .blue-bar { border-bottom: 4px solid #003461; margin-bottom: 30px; }
            
            /* PAGE 2: DESIGN OVERLAY */
            .design-background { 
              position: absolute; top: 0; left: 0; width: 100%; height: 100%;
              background-image: url('${designImage}');
              background-size: contain; background-repeat: no-repeat; background-position: center;
              z-index: 1;
            }
            .english-overlay-box {
              position: absolute; top: 20%; left: 15%; width: 70%; height: 60%;
              background: rgba(255, 255, 255, 0.92); /* Slightly transparent white to cover Spanish text */
              z-index: 10; padding: 40px; border-radius: 5px;
              display: flex; flex-direction: column; align-items: center; justify-content: center;
              text-align: center; box-shadow: 0 0 20px rgba(0,0,0,0.1);
            }
          </style>
        </head>
        <body>
          <div class="page">
            <div class="letter-content">
              <h1 style="color: #003461; margin: 0;">ACCUCERT</h1>
              <p style="color: #666;">Official Certification of Accuracy</p>
              <div class="blue-bar"></div>
              <p style="text-align: right;">Date: ${new Date().toLocaleDateString()}</p>
              <h2 style="margin-top: 50px;">CERTIFICATE OF TRANSLATION</h2>
              <p>This document is certified to be an accurate translation for <b>${order.full_name}</b>.</p>
              <div style="margin-top: 200px;">
                <div style="border-top: 1px solid #000; width: 220px; padding-top: 10px;">Director of Certification</div>
              </div>
            </div>
          </div>

          <div class="page">
            <div class="design-background"></div>
            
            <div class="english-overlay-box">
              <h3 style="text-transform: uppercase; margin-bottom: 20px; border-bottom: 1px solid #ddd; padding-bottom: 10px;">Certified English Translation</h3>
              <div style="white-space: pre-wrap; line-height: 1.6; font-size: 14px;">${cleanTranslation}</div>
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

    if (!pdfUrl) throw new Error("PDF failed to generate. URL is missing.");

    const pdfBuffer = await fetch(pdfUrl).then(res => res.arrayBuffer());

    // 5. DISPATCH
    await resend.emails.send({
      from: 'Accucert <onboarding@resend.dev>',
      to: order.user_email.toString(),
      subject: `Official Certified Translation: ${order.full_name}`,
      text: `Your certified translation for ${order.document_type} is attached.`,
      html: `<p>Hello ${order.full_name}, your official translation is attached.</p>`,
      attachments: [{ 
        filename: `Accucert_Translation.pdf`, 
        content: Buffer.from(pdfBuffer) 
      }],
    });

    await supabase.from('translations').update({ status: 'completed' }).eq('id', orderId);
    return NextResponse.json({ success: true });

  } catch (err: any) {
    console.error("OVERLAY_ERROR:", err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}