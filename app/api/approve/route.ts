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

    const { data: order, error: dbErr } = await supabase
      .from('translations')
      .select('*')
      .eq('id', orderId)
      .single();

    if (dbErr || !order) throw new Error('Order not found.');

    // 1. CALL GROK-VISION-BETA
    // This model performs visual reasoning to match fonts and layout precisely.
    const grokRes = await fetch('https://api.x.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.XAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: "grok-vision-beta",
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `You are a high-end legal document designer. Recreate the uploaded image exactly in English HTML and Tailwind CSS.
                - Translation Content: "${order.extracted_text}"
                - MANDATORY: Match the exact font colors, sizes, and line breaks from the image.
                - MANDATORY: If the image has a border, seals, or specific spacing, replicate it in CSS.
                - Style Requirement: Use standard legal Serif fonts.
                - Technical Requirement: Return ONLY raw HTML/Tailwind inside a <div> container. No markdown markers.`
              },
              {
                type: "image_url",
                image_url: { url: order.image_url }
              }
            ]
          }
        ]
      })
    });

    const grokData = await grokRes.json();
    const replicatedDesign = grokData.choices?.[0]?.message?.content || "";

    // 2. CONSTRUCT THE DUAL-PAGE PDF
    // Page 1: Accucert Official Certification | Page 2: Grok's Visual Replication
    const finalHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <script src="https://cdn.tailwindcss.com"></script>
          <style>
            @page { margin: 0; size: A4; }
            body { margin: 0; padding: 0; font-family: 'Times New Roman', serif; }
            .a4-page { width: 210mm; height: 297mm; page-break-after: always; position: relative; overflow: hidden; }
            .cover-letter { padding: 80px; background: white; height: 100%; box-sizing: border-box; }
            .design-layer { padding: 20mm; height: 100%; width: 100%; box-sizing: border-box; }
          </style>
        </head>
        <body>
          <div class="a4-page">
            <div class="cover-letter">
              <h1 style="color: #003461; margin: 0; font-size: 38px;">ACCUCERT</h1>
              <p style="color: #666; font-weight: bold;">Certified Translation Services</p>
              <hr style="border: 2px solid #003461; margin: 30px 0;"/>
              <p style="text-align: right;">Date: ${new Date().toLocaleDateString()}</p>
              <h2 style="margin-top: 50px;">CERTIFICATE OF ACCURACY</h2>
              <p>This document is certified to be an accurate rendering of the original <b>${order.document_type}</b> for <b>${order.full_name}</b>.</p>
              <p style="margin-top: 200px;">__________________________<br/>Director of Certification</p>
            </div>
          </div>

          <div class="a4-page">
             <div class="design-layer">
                ${replicatedDesign}
             </div>
          </div>
        </body>
      </html>
    `;

    // 3. PRINT TO PDF
    const apiRes = await fetch('https://v2.api2pdf.com/chrome/pdf/html', {
      method: 'POST',
      headers: { 'Authorization': process.env.API2PDF_KEY!, 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        html: finalHtml, 
        inline: false, 
        options: { 
          printBackground: true, 
          waitForNetworkIdle: true 
        } 
      })
    });
    
    const apiData = await apiRes.json();
    const pdfUrl = apiData.FileUrl || apiData.fileUrl || apiData.pdf;

    if (!pdfUrl) throw new Error("PDF failed. Check Api2Pdf logs.");

    const pdfBuffer = await fetch(pdfUrl).then(res => res.arrayBuffer());

    // 4. DISPATCH EMAIL
    await resend.emails.send({
      from: 'Accucert <onboarding@resend.dev>',
      to: order.user_email.toString(),
      subject: `Official Certified Translation: ${order.full_name}`,
      text: `Your certified translation for the ${order.document_type} is attached.`,
      html: `<p>Hello ${order.full_name}, your official translation is attached as a PDF.</p>`,
      attachments: [{ 
        filename: `Accucert_Certified_Doc.pdf`, 
        content: Buffer.from(pdfBuffer) 
      }],
    });

    // 5. UPDATE STATUS
    await supabase.from('translations').update({ status: 'completed' }).eq('id', orderId);

    return NextResponse.json({ success: true });

  } catch (err: any) {
    console.error("DISPATCH_CRITICAL_FAILURE:", err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}