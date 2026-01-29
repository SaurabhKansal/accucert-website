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

    if (dbErr || !order) throw new Error('Order not found in database.');

    // 1. CALL GROK-VISION-BETA
    const grokRes = await fetch('[https://api.x.ai/v1/chat/completions](https://api.x.ai/v1/chat/completions)', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.XAI_API_KEY?.trim()}`,
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
                text: `Task: Recreate this document in English.
                - TRANSLATION: "${order.extracted_text}"
                - STYLE: Mimic all colors, fonts, and the spatial layout exactly.
                - LAYOUT: Use absolute positioning in CSS so it matches the image 1:1.
                - OUTPUT: Provide ONLY the raw HTML code starting with <div>. Do not include markdown tags, backticks, or explanations.`
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
    let replicatedHtml = grokData.choices?.[0]?.message?.content || "";

    // CLEANUP: Extract only the HTML if Grok includes markdown or backticks
    if (replicatedHtml.includes('```')) {
      replicatedHtml = replicatedHtml.split('```')[1].replace('html', '').trim();
    }

    // 2. CONSTRUCT THE DOCUMENT (Strict sizing to prevent overflow)
    const finalHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <script src="[https://cdn.tailwindcss.com](https://cdn.tailwindcss.com)"></script>
          <style>
            @page { margin: 0; size: A4; }
            body { margin: 0; padding: 0; -webkit-print-color-adjust: exact !important; }
            .pdf-container { width: 210mm; height: 297mm; position: relative; overflow: hidden; page-break-after: always; }
          </style>
        </head>
        <body>
          <div class="pdf-container" style="padding: 80px; font-family: sans-serif; background: white;">
            <h1 style="color: #003461; margin: 0; font-size: 42px;">ACCUCERT</h1>
            <p style="color: #666; font-weight: bold; letter-spacing: 1px;">Official Certification Authority</p>
            <hr style="border: 2px solid #003461; margin: 30px 0;"/>
            <p style="text-align: right;">Date: ${new Date().toLocaleDateString()}</p>
            <h2 style="margin-top: 60px; font-size: 24px;">CERTIFICATE OF ACCURACY</h2>
            <p>This is to certify that the attached document is a true English translation for <b>${order.full_name}</b>.</p>
            <div style="margin-top: 200px; border-top: 1px solid #000; width: 250px; padding-top: 10px;">
              Authorized Signature
            </div>
          </div>

          <div class="pdf-container">
            ${replicatedHtml}
          </div>
        </body>
      </html>
    `;

    // 3. PRINT TO PDF (Using the sanitized URL)
    const apiEndpoint = "[https://v2.api2pdf.com/chrome/pdf/html](https://v2.api2pdf.com/chrome/pdf/html)";
    const apiRes = await fetch(apiEndpoint, {
      method: 'POST',
      headers: { 
        'Authorization': process.env.API2PDF_KEY!.trim(), 
        'Content-Type': 'application/json' 
      },
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

    if (!pdfUrl) {
      console.error("API2PDF Error:", apiData);
      throw new Error(`PDF URL missing. API Response: ${JSON.stringify(apiData)}`);
    }

    const pdfBuffer = await fetch(pdfUrl).then(res => res.arrayBuffer());

    // 4. DISPATCH
    await resend.emails.send({
      from: 'Accucert <onboarding@resend.dev>',
      to: order.user_email.toString(),
      subject: `Official Certified Translation: ${order.full_name}`,
      text: `Your certified translation is attached.`,
      html: `<p>Hello ${order.full_name}, your official translation is attached.</p>`,
      attachments: [{ 
        filename: `Accucert_Translation.pdf`, 
        content: Buffer.from(pdfBuffer) 
      }],
    });

    await supabase.from('translations').update({ status: 'completed' }).eq('id', orderId);
    return NextResponse.json({ success: true });

  } catch (err: any) {
    console.error("DISPATCH_CRITICAL_FAILURE:", err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}