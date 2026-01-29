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

    // 1. FETCH DATA
    const { data: order, error: dbErr } = await supabase
      .from('translations')
      .select('*')
      .eq('id', orderId)
      .single();

    if (dbErr || !order) throw new Error('Order not found.');

    // 2. FETCH CODIA DESIGN
    const codiaRes = await fetch('https://api.codia.ai/v1/open/image_to_design', {
      method: 'POST',
      headers: { 
        'Authorization': `Bearer ${process.env.CODIA_API_KEY}`, 
        'Content-Type': 'application/json' 
      },
      body: JSON.stringify({ 
        image_url: order.image_url, 
        platform: 'web', 
        framework: 'html' 
      })
    });
    
    const codiaData = await codiaRes.json();
    const translationDesign = codiaData.data?.html || codiaData.code?.html || order.extracted_text;

    // 3. BUILD HTML (Added -webkit-print-color-adjust for design backgrounds)
    const fullHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            @page { margin: 0; size: A4; }
            body { font-family: 'Helvetica', Arial, sans-serif; margin: 0; padding: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            .cert-page { height: 1000px; padding: 70px; page-break-after: always; position: relative; background: white; }
            .design-wrap { width: 100%; height: auto; }
            .blue-line { border-bottom: 3px solid #003461; margin: 25px 0; }
          </style>
        </head>
        <body>
          <div class="cert-page">
            <h1 style="color: #003461; margin: 0; font-size: 34px;">ACCUCERT</h1>
            <p style="font-style: italic; color: #555;">Certified Translation & Legalisation Experts</p>
            <div class="blue-line"></div>
            <p style="text-align: right;">Date: ${new Date().toLocaleDateString()}</p>
            
            <h2 style="margin-top: 60px;">CERTIFICATE OF TRANSLATION ACCURACY</h2>
            <p>Accucert hereby certifies that the document titled <b>${order.document_type || 'Official Record'}</b> is a true and accurate translation.</p>
            
            <div style="background: #f8f9fa; padding: 25px; border-radius: 10px; margin: 35px 0; border: 1px solid #e9ecef;">
               <strong>Order Reference:</strong> ${orderId}<br/>
               <strong>Client:</strong> ${order.full_name}<br/>
               <strong>Linguistic Pair:</strong> ${order.language_from} to ${order.language_to}
            </div>

            <p style="margin-top: 120px;">__________________________<br/>Director of Certification</p>
          </div>
          <div class="design-wrap">${translationDesign}</div>
        </body>
      </html>
    `;

    // 4. PRINT TO PDF (REFINED LOGIC)
    const apiRes = await fetch('https://v2.api2pdf.com/chrome/html', {
      method: 'POST',
      headers: { 
        'Authorization': process.env.API2PDF_KEY!, 
        'Content-Type': 'application/json' 
      },
      body: JSON.stringify({ 
        html: fullHtml, 
        inline: false, 
        fileName: `Certified_Order_${orderId.slice(0,5)}.pdf`,
        options: { printBackground: true } // Ensures Codia's backgrounds are rendered
      })
    });
    
    const apiData = await apiRes.json();

    // Log the actual response for debugging
    console.log("Api2Pdf Response:", apiData);

    // Precise check: success can be true even with credit warnings
    if (!apiData.FileUrl && !apiData.fileUrl) {
        throw new Error(`PDF failed: ${apiData.message || 'Unknown Error'}`);
    }

    const fileUrl = apiData.FileUrl || apiData.fileUrl;
    const pdfBuffer = await fetch(fileUrl).then(res => res.arrayBuffer());

    // 5. DISPATCH
    await resend.emails.send({
      from: 'Accucert <onboarding@resend.dev>',
      to: order.user_email,
      subject: `Accucert Certified Translation: ${order.full_name}`,
      html: `<p>Hello ${order.full_name}, your official certified translation is attached.</p>`,
      attachments: [{ 
        filename: `Accucert_Certified_Doc.pdf`, 
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