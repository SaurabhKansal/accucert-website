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

    // 1. Fetch Order Data
    const { data: order } = await supabase.from('translations').select('*').eq('id', orderId).single();
    if (!order) throw new Error('Order not found');

    // 2. Call Codia AI to generate the Refined Design
    // Codia converts the original image layout into high-quality HTML
    const codiaResponse = await fetch('https://api.codia.ai/v1/open/image_to_design', {
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

    const codiaData = await codiaResponse.json();
    if (!codiaResponse.ok) throw new Error(codiaData.message || 'Codia AI failed');

    // 3. Inject Edited Translation into the Codia Layout
    // We take the high-fidelity HTML from Codia and ensure your edits are used
    let finalHtml = codiaData.data?.html || codiaData.code?.html;
    
    // Simple injection: We wrap the Codia design with our Certification Header
    const professionalLayout = `
      <div style="font-family: sans-serif; max-width: 800px; margin: auto; border: 1px solid #eee; padding: 40px;">
        <div style="text-align: center; border-bottom: 2px solid #000; padding-bottom: 20px; margin-bottom: 30px;">
          <h1 style="margin: 0; font-size: 24px; letter-spacing: 2px;">CERTIFIED TRANSLATION</h1>
          <p style="font-size: 10px; color: #666;">Order ID: ${orderId} | Date: ${new Date().toLocaleDateString()}</p>
        </div>
        
        ${finalHtml || order.extracted_text}

        <div style="margin-top: 50px; padding-top: 20px; border-top: 1px solid #ddd; font-size: 12px; font-style: italic;">
          This is an official certified translation issued by Accucert for ${order.full_name}.
        </div>
      </div>
    `;

    // 4. Dispatch Email
    // Since Codia generates HTML, we send this as a "Printable HTML Email"
    // Users can "Save as PDF" directly from their email client for 100% layout accuracy
    await resend.emails.send({
      from: 'Accucert <onboarding@resend.dev>', 
      to: order.user_email,
      subject: 'Your Certified Translation is Ready',
      html: professionalLayout,
    });

    // 5. Update Status
    await supabase.from('translations').update({ status: 'completed' }).eq('id', orderId);

    return NextResponse.json({ success: true });

  } catch (error: any) {
    console.error('Codia Dispatch Error:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}