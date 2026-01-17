export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function POST(req: Request) {
  try {
    const { orderId } = await req.json();
    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

    // 1. Fetch Order
    const { data: order } = await supabase.from('translations').select('*').eq('id', orderId).single();
    if (!order) throw new Error('Order not found');

    // 2. Call Codia AI to get the Refined HTML
    const codiaRes = await fetch('https://api.codia.ai/v1/open/image_to_design', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.CODIA_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ image_url: order.original_image_url, platform: 'web', framework: 'html' })
    });

    const codiaData = await codiaRes.json();
    const refinedHtml = codiaData.data?.html || codiaData.code?.html || codiaData.html;

    // 3. Return the HTML directly to the Admin Dashboard
    return NextResponse.json({ success: true, refinedHtml });

  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}