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

    // 1. CALL GROK-VISION-BETA (The "Total AI" Prompt)
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
                text: `You are a legal document architect. Recreate this document in English.
                - TRANSLATION: "${order.extracted_text}"
                - DESIGN: Mimic the font families (Serif/Sans), exact colors, and spatial layout.
                - LAYOUT: Use absolute positioning or flexbox to match the original line-by-line.
                - BORDERS: If there are borders or seals, recreate them using Tailwind CSS.
                - FORMAT: Return ONLY the HTML inside a single <div>. Do not use markdown code blocks (no backticks). 
                - SAFETY: Ensure all text fits within a 210mm width to avoid overflow.`
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

    // CLEANUP: Remove any accidental markdown backticks (e.g., ```html)
    replicatedHtml = replicatedHtml.replace(/```html|```/g, "").trim();

    // 2. CONSTRUCT THE PDF WITH RENDERING SAFEGUARDS
    const finalHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <script src="[https://cdn.tailwindcss.com](https://cdn.tailwindcss.com)"></script>
          <style>
            @page { margin: 0; size: A4; }
            body { margin: 0; padding: 0; background: white; -webkit-print-color-adjust: exact !important; }
            .a4-page { width: 210mm; height: 297mm; position: relative; overflow: hidden; page-break-after: always; }
            /* This ensures the AI content is centered and fits the page */
            .ai-content { width: 100%; height: 100%; padding: 15mm; box-sizing: border-box; }
          </style>
        </head>
        <body>
          <div class="a4-page" style="padding: 80px; font-family: sans-serif;">
            <h1 style="color: #003461; margin: 0; font-size: 38px;">ACCUCERT</h1>
            <p style="font-weight: bold; color: #666;">Official Document Legalisation</p>
            <hr style="border: 2.5px solid #003461; margin: 30px 0;"/>
            <p style="text-align: right;">Date: ${new Date().toLocaleDateString()}</p>
            <h2 style="margin-top: 50px;">CERTIFICATE OF ACCURACY</h2>
            <p>Certified for: <b>${order.full_name}</b></p>
            <p>Document: <b>${order.document_type}</b></p>
            <div style="margin-top: 200px; border-top: 1px solid #000; width: 250px; padding-top: 10px;">
              Director of Certification
            </div>
          </div>

          <div class="a4-page">
            <div class="ai-content">
              ${replicatedHtml}
            </div>
          </div>
        </body>
      </html>
    `;

    // 3. PRINT TO PDF (With High-Stability Settings)
    const apiRes = await fetch('[https://v2.api2pdf.com/chrome/pdf/html](https://v2.api2pdf.com/chrome/pdf/html)', {
      method: 'POST',
      headers: { 'Authorization': process.env.API2PDF_KEY!, 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        html: finalHtml, 
        inline: false, 
        options: { 
          printBackground: true, 
          waitForNetworkIdle: true, // WAITS FOR TAILWIND AND FONTS
          useLatestChrome: true 
        } 
      })
    });
    
    const apiData = await apiRes.json();
    const pdfUrl = apiData.FileUrl || apiData.fileUrl;

    if (!pdfUrl) throw new Error("PDF failed to render. Grok output might be too complex or API2PDF balance low.");

    const pdfBuffer = await fetch(pdfUrl).then(res => res.arrayBuffer());

    // 4. DISPATCH
    await resend.emails.send({
      from: 'Accucert <onboarding@resend.dev>',
      to: order.user_email,
      subject: `Official Certified Translation: ${order.full_name}`,
      text: `Your official certified translation is attached.`,
      html: `<p>Hello ${order.full_name}, your official translation is attached.</p>`,
      attachments: [{ 
        filename: `Accucert_Translation.pdf`, 
        content: Buffer.from(pdfBuffer) 
      }],
    });

    await supabase.from('translations').update({ status: 'completed' }).eq( 'id', orderId);
    return NextResponse.json({ success: true });

  } catch (err: any) {
    console.error("DISPATCH_FAILURE:", err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}