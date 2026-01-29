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

    if (dbErr || !order) throw new Error('Order record not found in database.');

    // --- SANITIZE ALL INPUTS ---
    const xaiKey = (process.env.XAI_API_KEY || "").trim();
    const api2PdfKey = (process.env.API2PDF_KEY || "").trim();
    const imageUrl = (order.image_url || "").trim();

    if (!xaiKey) throw new Error("XAI_API_KEY is missing in Vercel settings.");

    // 1. CALL GROK-2-VISION-1212
    const grokRes = await fetch("https://api.x.ai/v1/chat/completions", {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${xaiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: "grok-2-vision-1212", 
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `You are a legal document architect. Recreate this document in English.
                - TRANSLATION TEXT: "${order.extracted_text}"
                - INSTRUCTIONS: Mimic the original font colors, font sizes, and spatial layout exactly.
                - LAYOUT: Use Tailwind CSS and absolute positioning to ensure line-by-line matching.
                - OUTPUT: Return ONLY the raw HTML <div> code. Do not use markdown backticks or explanations.`
              },
              {
                type: "image_url",
                image_url: { url: imageUrl }
              }
            ]
          }
        ],
        temperature: 0.1 // Keeps the layout strict and predictable
      })
    });

    if (!grokRes.ok) {
      const errorText = await grokRes.text();
      throw new Error(`Grok API Error: ${grokRes.status} - ${errorText}`);
    }

    const grokData = await grokRes.json();
    let aiHtml = grokData.choices?.[0]?.message?.content || "";

    // --- SCRUB MARKDOWN (Crucial for preventing blank PDFs) ---
    // This removes ```html or ``` if Grok accidentally includes them.
    aiHtml = aiHtml.replace(/```html|```/g, "").trim();

    // 2. CONSTRUCT THE PDF BODY (A4 Precision)
    const finalHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <script src="https://cdn.tailwindcss.com"></script>
          <style>
            @page { margin: 0; size: A4; }
            body { margin: 0; padding: 0; background: white; -webkit-print-color-adjust: exact !important; }
            .a4-page { width: 210mm; height: 297mm; position: relative; overflow: hidden; page-break-after: always; }
          </style>
        </head>
        <body>
          <div class="a4-page" style="padding: 80px; font-family: sans-serif;">
            <h1 style="color: #003461; margin: 0; font-size: 40px;">ACCUCERT</h1>
            <p style="color: #666; font-weight: bold;">Official Translation Certification</p>
            <hr style="border: 2px solid #003461; margin: 30px 0;"/>
            <p style="text-align: right;">Date: ${new Date().toLocaleDateString()}</p>
            <h2 style="margin-top: 50px;">CERTIFICATE OF ACCURACY</h2>
            <p>Accucert certifies the translation for <b>${order.full_name}</b> is accurate.</p>
            <div style="margin-top: 200px; border-top: 1px solid #000; width: 220px; padding-top: 10px;">
              Director of Certification
            </div>
          </div>

          <div class="a4-page" style="padding: 15mm;">
            ${aiHtml}
          </div>
        </body>
      </html>
    `;

    // 3. GENERATE PDF VIA API2PDF
    const apiRes = await fetch("https://v2.api2pdf.com/chrome/pdf/html", {
      method: 'POST',
      headers: { 
        'Authorization': api2PdfKey, 
        'Content-Type': 'application/json' 
      },
      body: JSON.stringify({ 
        html: finalHtml, 
        inline: false, 
        options: { 
          printBackground: true, 
          waitForNetworkIdle: true, // Ensures Tailwind loads before printing
          useLatestChrome: true 
        } 
      })
    });
    
    const apiData = await apiRes.json();
    const pdfUrl = apiData.FileUrl || apiData.fileUrl;

    if (!pdfUrl) throw new Error("PDF failed to generate. Check Api2Pdf balance.");

    const pdfBuffer = await fetch(pdfUrl).then(res => res.arrayBuffer());

    // 4. DISPATCH EMAIL
    await resend.emails.send({
      from: 'Accucert <onboarding@resend.dev>',
      to: order.user_email.toString(),
      subject: `Official Certified Translation: ${order.full_name}`,
      text: `Your certified translation is attached.`,
      attachments: [{ 
        filename: `Accucert_Translation.pdf`, 
        content: Buffer.from(pdfBuffer) 
      }],
    });

    // 5. UPDATE DATABASE
    await supabase.from('translations').update({ status: 'completed' }).eq('id', orderId);

    return NextResponse.json({ success: true });

  } catch (err: any) {
    console.error("DISPATCH_CRITICAL_ERROR:", err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}