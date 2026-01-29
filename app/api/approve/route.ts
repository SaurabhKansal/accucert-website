export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

// Helper to clean the Codia "Junk" while keeping the design
function formatCodiaContent(html: string) {
  return html
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ') // Fixes the crowded text issue
    .trim();
}

export async function POST(req: Request) {
  try {
    const { orderId } = await req.json();
    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
    const { data: order } = await supabase.from('translations').select('*').eq('id', orderId).single();

    if (!order) throw new Error('Order not found');

    // 1. GET THE FULL DESIGN FROM CODIA AI
    const codiaRes = await fetch('https://api.codia.ai/v1/open/image_to_design', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${process.env.CODIA_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ image_url: order.image_url, platform: 'web', framework: 'html' })
    });
    const codiaData = await codiaRes.json();
    
    // This is the "Magic" - the full design HTML from Codia
    const designHtml = formatCodiaContent(codiaData.data?.html || codiaData.code?.html || order.extracted_text);

    // 2. CONSTRUCT A "PRINT-READY" DOCUMENT
    // This uses CSS to force backgrounds to show up and keeps your letterhead professional
    const finalHtmlDocument = `
      <html>
        <head>
          <style>
            @media print { .no-print { display: none; } }
            body { font-family: 'Helvetica', Arial, sans-serif; margin: 0; padding: 0; color: #333; }
            .cert-page { padding: 80px; height: 1000px; border-bottom: 2px solid #eee; page-break-after: always; }
            .design-container { width: 100%; min-height: 1100px; background: white; }
            .header { border-bottom: 4px solid #003461; padding-bottom: 20px; margin-bottom: 40px; }
            .stamp { width: 150px; height: 150px; border: 2px solid #003461; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: #003461; font-weight: bold; font-size: 10px; text-align: center; float: right; }
          </style>
        </head>
        <body>
          <div class="cert-page">
            <div class="header">
              <h1 style="font-size: 36px; margin: 0; color: #003461;">ACCUCERT</h1>
              <p style="font-style: italic; margin: 0;">Certified Translation & Legalisation</p>
            </div>
            <div class="stamp">OFFICIAL SEAL<br>ACCUCERT<br>VERIFIED</div>
            <p>Date: ${new Date().toLocaleDateString()}</p>
            <h2>CERTIFICATE OF ACCURACY</h2>
            <p>This certifies that the attached translation for <strong>${order.full_name}</strong> is a true and accurate rendering of the original <strong>${order.document_type}</strong>.</p>
            <div style="margin-top: 50px; padding: 20px; background: #f0f4f8; border-left: 5px solid #003461;">
               Reference ID: ${orderId}<br>
               Languages: ${order.language_from} to ${order.language_to}
            </div>
            <p style="margin-top: 100px;">__________________________<br>Director of Certification</p>
          </div>

          <div class="design-container">
            ${designHtml}
          </div>
        </body>
      </html>
    `;

    // 3. DISPATCH (As a beautifully formatted Email-to-PDF)
    // We send this as the HTML body. When the user hits "Print" or you use a PDF converter, 
    // the CSS ensures the design background is preserved.
    await resend.emails.send({
      from: 'Accucert <onboarding@resend.dev>',
      to: order.user_email,
      subject: `Official Certified Translation: ${order.full_name}`,
      html: finalHtmlDocument,
    });

    await supabase.from('translations').update({ status: 'completed' }).eq('id', orderId);
    return NextResponse.json({ success: true });

  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}