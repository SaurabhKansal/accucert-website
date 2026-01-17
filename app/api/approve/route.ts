export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { generateCertifiedPdf } from '@/lib/generateCertifiedPdf';
import { Resend } from 'resend';

export async function POST(req: Request) {
  try {
    const { orderId } = await req.json();

    // 1. Initialize Clients inside the POST function to avoid build-time errors
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const resendKey = process.env.RESEND_API_KEY;
    const codiaKey = process.env.CODIA_API_KEY;

    if (!supabaseUrl || !supabaseKey || !resendKey || !codiaKey) {
      throw new Error('Missing environment variables. Check Vercel Dashboard Settings.');
    }

    const supabase = createClient(supabaseUrl, supabaseKey);
    const resend = new Resend(resendKey);

    // 2. Get the original document data from Supabase
    const { data: order, error: fetchError } = await supabase
      .from('translations')
      .select('*')
      .eq('id', orderId)
      .single();

    if (fetchError || !order) {
      throw new Error(`Order not found or database error: ${fetchError?.message}`);
    }

    // 3. Call Codia AI to get the refined HTML layout
    const codiaResponse = await fetch('https://api.codia.ai/v1/open/image_to_design', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${codiaKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ 
        image_url: order.original_image_url, // Ensure this URL is publicly accessible to Codia
        platform: 'web',
        framework: 'html' 
      })
    });

    if (!codiaResponse.ok) {
      const errorText = await codiaResponse.text();
      throw new Error(`Codia AI failed: ${errorText}`);
    }
    
    const codiaData = await codiaResponse.json();
    // Use 'code.html' or 'data.html' based on Codia's specific response structure
    const layoutHtml = codiaData.code?.html || codiaData.html;

    if (!layoutHtml) throw new Error('Codia AI did not return valid HTML');

    // 4. Generate the Final PDF using the Codia HTML
    const pdfBuffer = await generateCertifiedPdf({
      layoutHtml: layoutHtml,
      fullName: order.full_name,
      orderId: order.id
    });

    // 5. Send the Final PDF via Resend
    const { error: mailError } = await resend.emails.send({
      from: 'Accucert <translations@accucert.com>',
      to: order.user_email,
      subject: 'Your Certified Translation is Ready!',
      text: `Hello ${order.full_name}, please find your certified translation attached for Order #${orderId}.`,
      attachments: [
        {
          filename: `Certified_Translation_${orderId}.pdf`,
          content: pdfBuffer,
        },
      ],
    });

    if (mailError) throw new Error(`Email failed to send: ${mailError.message}`);

    return NextResponse.json({ 
      success: true, 
      message: 'Document refined and dispatched successfully' 
    });

  } catch (error: any) {
    console.error('DISPATCH_CRITICAL_ERROR:', error);
    return NextResponse.json(
      { error: error.message || 'Internal Server Error' }, 
      { status: 500 }
    );
  }
}