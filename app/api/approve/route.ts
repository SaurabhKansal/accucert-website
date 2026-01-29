export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

// VERSION 1.0.4 - DEPLOYMENT TRIGGER
export async function POST(req: Request) {
  try {
    const { orderId } = await req.json();
    
    // Metadata for build tracking
    const deploymentInfo = {
      order_id: orderId,
      timestamp: new Date().toISOString(),
      service: "Accucert_Dispatch_v1"
    };

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

    // 3. BUILD PRINT-READY HTML
    const fullHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            @page { margin: 0; size: A4; }
            body { font-family: 'Helvetica', Arial, sans-serif; margin: 0; padding: 0; -webkit-print-color-adjust: exact; }
            .cert-page { height: 1050px; padding: 70px; page-break-after: always; position: relative; }
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

          <div class="design-wrap">
            ${translationDesign}
          </div>
        </body>
      </html>
    `;

    // 4. PRINT TO PDF VIA API2PDF
    const apiRes = await fetch('https://v2.api2pdf.com/chrome/html', {
      method: 'POST',
      headers: { 
        'Authorization': process.env.API2PDF_KEY!, 
        'Content-Type': 'application/json' 
      },
      body: JSON.stringify({ 
        html: fullHtml, 
        inline: false, 
        fileName: `Certified_Doc_${orderId.slice(0,5)}.pdf` 
      })
    });
    
    const apiData = await apiRes.json();
    if (!apiData.FileUrl) throw new Error("PDF Printer Error: Check Api2Pdf Credits");

    const pdfBuffer = await fetch(apiData.FileUrl).then(res => res.arrayBuffer());

    // 5. DISPATCH
    await resend.emails.send({
      from: 'Accucert <onboarding@resend.dev>',
      to: order.user_email,
      subject: `Your Official Certified Translation: ${order.full_name}`,
      html: `<p>Hello ${order.full_name}, your official certified translation is attached.</p>`,
      attachments: [{ 
        filename: `Accucert_Certified_Doc.pdf`, 
        content: Buffer.from(pdfBuffer) 
      }],
    });

    await supabase.from('translations').update({ status: 'completed' }).eq('id', orderId);

    return NextResponse.json({ success: true, meta: deploymentInfo });

  } catch (err: any) {
    console.error("DEPLOYMENT_DEBUG:", err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}