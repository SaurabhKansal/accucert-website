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

    // 1. GET THE DESIGN AS AN IMAGE (The Foolproof Part)
    // We call Codia but ask for a high-res image instead of HTML
    const codiaRes = await fetch('https://api.codia.ai/v1/open/image_to_design', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${process.env.CODIA_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        image_url: order.image_url, 
        platform: 'web', 
        framework: 'html', // We use this to get the structured data
        render_image: true // Tells Codia to provide a snapshot URL
      })
    });
    
    const codiaData = await codiaRes.json();
    // Use the rendered image URL from Codia, or fall back to the original image if AI fails
    const finalDesignImage = codiaData.data?.image_url || order.image_url;

    // 2. BUILD THE PDF WRAPPER (Certification Letter + Full Page Image)
    const finalHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            @page { margin: 0; size: A4; }
            body { margin: 0; padding: 0; }
            .cert-page { height: 297mm; padding: 80px; page-break-after: always; font-family: sans-serif; box-sizing: border-box; }
            .design-page { width: 210mm; height: 297mm; display: flex; align-items: center; justify-content: center; overflow: hidden; }
            .certificate-img { width: 100%; height: 100%; object-fit: contain; }
          </style>
        </head>
        <body>
          <div class="cert-page">
            <h1 style="color: #003461; margin: 0; font-size: 34px;">ACCUCERT</h1>
            <p style="font-style: italic; color: #666;">Official Certification of Accuracy</p>
            <hr style="border: 1px solid #003461; margin: 20px 0;" />
            <p style="text-align: right;">Date: ${new Date().toLocaleDateString()}</p>
            <h2 style="margin-top: 50px;">CERTIFICATE OF TRANSLATION</h2>
            <p>This document is certified to be an accurate translation for <b>${order.full_name}</b>.</p>
            <div style="margin-top: 200px;">
              <div style="border-top: 1px solid #000; width: 220px; padding-top: 10px;">Director of Certification</div>
            </div>
          </div>

          <div class="design-page">
            <img src="${finalDesignImage}" class="certificate-img" />
          </div>
        </body>
      </html>
    `;

    // 3. PRINT TO PDF VIA API2PDF (Capturing the image perfectly)
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

    // 4. DISPATCH
    await resend.emails.send({
      from: 'Accucert <onboarding@resend.dev>',
      to: order.user_email.toString(),
      subject: `Official Certified Translation: ${order.full_name}`,
      text: `Hello ${order.full_name}, your certified translation is attached.`,
      html: `<p>Hello ${order.full_name}, please find your official certified translation attached as a PDF.</p>`,
      attachments: [{ 
        filename: `Accucert_Certified_Doc.pdf`, 
        content: Buffer.from(pdfBuffer) 
      }],
    });

    await supabase.from('translations').update({ status: 'completed' }).eq('id', orderId);
    return NextResponse.json({ success: true });

  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}