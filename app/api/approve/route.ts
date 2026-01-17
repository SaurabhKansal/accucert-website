export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const orderId = body.orderId || body.requestId;

    if (!orderId) throw new Error('Order ID is missing');

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!, 
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { data: order, error: fetchError } = await supabase
      .from('translations')
      .select('*')
      .eq('id', orderId)
      .single();

    if (fetchError || !order) throw new Error('Order not found');

    // Call Codia AI for high-fidelity design
    const codiaRes = await fetch('https://api.codia.ai/v1/open/image_to_design', {
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

    const codiaData = await codiaRes.json();
    const refinedHtml = codiaData.data?.html || codiaData.code?.html || codiaData.html;

    if (!refinedHtml) throw new Error('Codia AI failed to return HTML');

    // Return HTML to frontend for browser-based printing
    return NextResponse.json({ success: true, refinedHtml });

  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}