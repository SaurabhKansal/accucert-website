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

    if (fetchError || !order) throw new Error('Order not found in Database');

    // CHECK BOTH POSSIBLE COLUMN NAMES
    const imageUrl = order.original_image_url || order.image_url;

    if (!imageUrl) {
      console.error('Order Data Debug:', order); // Log full row to Vercel
      throw new Error(`No image URL found. Checked columns: original_image_url, image_url. Found: ${JSON.stringify(Object.keys(order))}`);
    }

    // Call Codia AI
    const codiaRes = await fetch('https://api.codia.ai/v1/open/image_to_design', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.CODIA_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ 
        image_url: imageUrl, 
        platform: 'web', 
        framework: 'html' 
      })
    });

    if (!codiaRes.ok) {
      const errorDetail = await codiaRes.text();
      throw new Error(`Codia API Error (${codiaRes.status}): ${errorDetail}`);
    }

    const codiaData = await codiaRes.json();
    const refinedHtml = codiaData.data?.html || codiaData.code?.html || codiaData.html || codiaData.data?.code?.html;

    if (!refinedHtml) throw new Error('Codia AI did not return HTML code');

    return NextResponse.json({ success: true, refinedHtml });

  } catch (error: any) {
    console.error('API_APPROVE_ERROR:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}