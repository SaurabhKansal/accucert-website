export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { generateCertifiedPdf } from '@/lib/generateCertifiedPdf';
import { Resend } from 'resend';

export async function POST(req: Request) {
  try {
    const { orderId } = await req.json();

    // 1. Map to your EXACT Vercel Environment Variable names
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL; // Matched to your screenshot
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const resendKey = process.env.RESEND_API_KEY;
    const codiaKey = process.env.CODIA_API_KEY;

    // Safety check to prevent silent failures
    if (!supabaseUrl || !supabaseKey || !resendKey || !codiaKey) {
      const missing = [];
      if (!supabaseUrl) missing.push('NEXT_PUBLIC_SUPABASE_URL');
      if (!supabaseKey) missing.push('SUPABASE_SERVICE_ROLE_KEY');
      if (!resendKey) missing.push('RESEND_API_KEY');
      if (!codiaKey) missing.push('CODIA_API_KEY');
      
      throw new Error(`Missing keys in Vercel: ${missing.join(', ')}`);
    }

    const supabase = createClient(supabaseUrl, supabaseKey);
    const resend = new Resend(resendKey);

    // 2. Fetch order data
    const { data: order, error: fetchError } = await supabase
      .from('translations')
      .select('*')
      .eq('id', orderId)
      .single();

    if (fetchError || !order) {
      throw new Error(`Order not found: ${fetchError?.message}`);
    }

    // 3. Call Codia AI for high-fidelity HTML reconstruction
    const codiaResponse = await fetch('https://api.codia.ai/v1/open/image_to_design', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${codiaKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ 
        image_url: order.original_image_url,
        platform: 'web',
        framework: 'html' 
      })
    });

    if (!codiaResponse.ok) {
      const errorText = await codiaResponse.text();
      throw new Error(`Codia AI Error: ${errorText}`);
    }
    
    const codiaData = await codiaResponse.json();
    
    // Codia returns code in a nested 'data' or 'code' object depending on the endpoint
    const layoutHtml = codiaData.data?.html || codiaData.code?.html || codiaData.html;

    if (!layoutHtml) throw new Error('Codia AI response missing HTML content');

    // 4. Convert the refined HTML into a Certified PDF
    const pdfBuffer = await generateCertifiedPdf({
      layoutHtml: layoutHtml,
      fullName: order.full_name,
      orderId: order.id
    });

    // 5. Dispatch via Resend
    const { error: mailError } = await resend.emails.send({
      from: 'Accucert <translations@accucert.com>',
      to: order.user_email,
      subject: `Certified Translation Ready - Order #${orderId}`,
      text: `Hello ${order.full_name}, your certified document is attached.`,
      attachments: [
        {
          filename: `Certified_Translation_${orderId}.pdf`,
          content: pdfBuffer,
        },
      ],
    });

    if (mailError) throw new Error(`Email dispatch failed: ${mailError.message}`);

    return NextResponse.json({ success: true, message: 'Dispatched successfully!' });

  } catch (error: any) {
    console.error('CRITICAL_DISPATCH_ERROR:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}