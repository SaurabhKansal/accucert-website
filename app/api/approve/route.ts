import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js'; // Assuming you use Supabase
import { generateCertifiedPdf } from '@/lib/generateCertifiedPdf';
import { Resend } from 'resend';

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(req: Request) {
  try {
    const { orderId } = await req.json();

    // 1. Get the original document image URL from Supabase
    const { data: order, error: fetchError } = await supabase
      .from('translations')
      .select('*')
      .eq('id', orderId)
      .single();

    if (fetchError || !order) throw new Error('Order not found');

    // 2. Call Codia AI to get the refined HTML layout
    const codiaResponse = await fetch('https://api.codia.ai/v1/open/image_to_design', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.CODIA_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ 
        image_url: order.original_image_url,
        platform: 'web',
        framework: 'html' 
      })
    });

    if (!codiaResponse.ok) throw new Error('Codia AI processing failed');
    const { code } = await codiaResponse.json();

    // 3. Generate the Final PDF using the Codia HTML
    const pdfBuffer = await generateCertifiedPdf({
      layoutHtml: code.html,
      fullName: order.full_name,
      orderId: order.id
    });

    // 4. Send the Final PDF via Resend
    await resend.emails.send({
      from: 'Accucert <translations@accucert.com>',
      to: order.user_email,
      subject: 'Your Certified Translation is Ready!',
      text: 'Please find your certified translation attached.',
      attachments: [
        {
          filename: `Certified_Translation_${orderId}.pdf`,
          content: pdfBuffer,
        },
      ],
    });

    return NextResponse.json({ success: true, message: 'Dispatched successfully' });

  } catch (error: any) {
    console.error('DISPATCH_ERROR:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}