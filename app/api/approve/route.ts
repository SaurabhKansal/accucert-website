export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(req: Request) {
  try {
    const { orderId } = await req.json();
    const supabase = createClient(
      (process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim(), 
      (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim()
    );

    const { data: order, error: dbErr } = await supabase
      .from('translations')
      .select('*')
      .eq('id', orderId)
      .single();

    if (dbErr || !order) throw new Error('Order not found.');

    const xaiKey = (process.env.XAI_API_KEY || "").trim();
    const api2PdfKey = (process.env.API2PDF_KEY || "").trim();

    // 1. CALL GROK-2-VISION-1212 (Correctly instructed to translate)
    const grokRes = await fetch("https://api.x.ai/v1/chat/completions", {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${xaiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: "grok-2-vision-1212", 
        messages: [{
          role: "user",
          content: [
            {
              type: "text",
              text: `You are a high-end legal document designer. Recreate the uploaded image exactly as an English version.
              - STEP 1: Translate all Spanish text found in the image into professional English. 
              - STEP 2: Use the following text as your primary translation reference: "${order.extracted_text}".
              - STEP 3: Replicate the design (colors, font sizes, bolding, and spatial layout) using Tailwind CSS and HTML.
              - OUTPUT: Return ONLY a <div> container with the recreation. No markdown backticks.`
            },
            { type: "image_url", image_url: { url: order.image_url.trim() } }
          ]
        }],
        temperature: 0.1
      })
    });

    const grokData = await grokRes.json();
    let replicatedHtml = grokData.choices?.[0]?.message?.content || "";
    replicatedHtml = replicatedHtml.replace(/```html|```/g, "").trim();

    // 2. CONSTRUCT THE PDF BODY
    const finalHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <script src="https://cdn.tailwindcss.com"></script>
          <style>
            @page { margin: 0; size: A4; }
            body { margin: 0; padding: 0; background: white; -webkit-print-color-adjust: exact !important; }
            .pdf-page { width: 210mm; height: 297mm; position: relative; overflow: hidden; page-break-after: always; }
          </style>
        </head>
        <body>
          <div class="pdf-page" style="padding: 80px; font-family: sans-serif;">
            <h1 style="color: #003461; margin: 0; font-size: 40px;">ACCUCERT</h1>
            <p style="color: #666; font-weight: bold;">Certified Translation Authority</p>
            <hr style="border: 2px solid #003461; margin: 30px 0;"/>
            <p style="text-align: right;">Date: ${new Date().toLocaleDateString()}</p>
            <h2>CERTIFICATE OF ACCURACY</h2>
            <p>Accucert certifies the English translation for <b>${order.full_name}</b>.</p>
          </div>
          <div class="pdf-page" style="padding: 15mm;">
            ${replicatedHtml}
          </div>
        </body>
      </html>
    `;

    // 3. GENERATE PDF
    const apiRes = await fetch("https://v2.api2pdf.com/chrome/pdf/html", {
      method: 'POST',
      headers: { 'Authorization': api2PdfKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        html: finalHtml, 
        inline: false, 
        options: { printBackground: true, waitForNetworkIdle: true } 
      })
    });
    
    const apiData = await apiRes.json();
    const pdfUrl = apiData.FileUrl || apiData.fileUrl;
    const pdfBuffer = await fetch(pdfUrl).then(res => res.arrayBuffer());

    // 4. DISPATCH EMAIL (Fixed TS2345 Error)
    await resend.emails.send({
      from: 'Accucert <onboarding@resend.dev>',
      to: order.user_email.toString(),
      subject: `Official Certified Translation: ${order.full_name}`,
      // Added mandatory 'html' field to fix TS error
      html: `<p>Please find your certified English translation attached below.</p>`,
      text: `Your certified translation is attached.`,
      attachments: [{ 
        filename: `Accucert_Translation.pdf`, 
        // Cast as standard Buffer
        content: Buffer.from(pdfBuffer) 
      }],
    });

    await supabase.from('translations').update({ status: 'completed' }).eq('id', orderId);
    return NextResponse.json({ success: true });

  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}