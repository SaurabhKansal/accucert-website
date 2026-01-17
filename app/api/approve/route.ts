export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { generateCertifiedPdf } from '@/lib/generateCertifiedPdf';
import { Resend } from 'resend';

export async function POST(req: Request) {
  try {
    // 1. Parse and Log the Body
    const body = await req.json();
    console.log('Incoming Request Body:', body); // Check Vercel logs for this!
    
    const { orderId } = body;

    // 2. The UUID Guard
    if (!orderId || orderId === "undefined") {
      throw new Error('Order ID is missing or undefined in the request.');
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const resendKey = process.env.RESEND_API_KEY;
    const codiaKey = process.env.CODIA_API_KEY;

    if (!supabaseUrl || !supabaseKey || !resendKey || !codiaKey) {
      throw new Error('Missing environment variables.');
    }

    const supabase = createClient(supabaseUrl, supabaseKey);
    const resend = new Resend(resendKey);

    // 3. Fetch order
    const { data: order, error: fetchError } = await supabase
      .from('translations')
      .select('*')
      .eq('id', orderId) // This is where it was crashing before
      .single();

    if (fetchError || !order) {
      throw new Error(`Order not found: ${fetchError?.message}`);
    }

    // ... (rest of your Codia and PDF logic remains the same)
    
    // Sample Codia call for context:
    const codiaResponse = await fetch('https://api.codia.ai/v1/open/image_to_design', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${codiaKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ image_url: order.original_image_url, platform: 'web', framework: 'html' })
    });
    
    const codiaData = await codiaResponse.json();
    const layoutHtml = codiaData.data?.html || codiaData.code?.html || codiaData.html;

    const pdfBuffer = await generateCertifiedPdf({
      layoutHtml,
      fullName: order.full_name,
      orderId: order.id
    });

    await resend.emails.send({
      from: 'Accucert <translations@accucert.com>',
      to: order.user_email,
      subject: `Certified Translation Ready - Order #${orderId}`,
      text: `Hello ${order.full_name}, your document is attached.`,
      attachments: [{ filename: `Certified_${orderId}.pdf`, content: pdfBuffer }],
    });

    return NextResponse.json({ success: true });

  } catch (error: any) {
    console.error('DISPATCH_ERROR:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}