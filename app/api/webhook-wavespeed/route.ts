import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function POST(req: Request) {
  const { searchParams } = new URL(req.url);
  const orderId = searchParams.get('orderId');
  const body = await req.json();

  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

  if (body.status === 'completed' && body.outputs?.[0]) {
    const newUrl = body.outputs[0];

    // Get current data to append if multi-page
    const { data: order } = await supabase.from('translations').select('translated_url').eq('id', orderId).single();
    const existingUrls = order?.translated_url ? order.translated_url.split(',') : [];
    
    // Append the new page
    const updatedUrls = [...existingUrls, newUrl].join(',');

    await supabase.from('translations').update({ 
      translated_url: updatedUrls,
      processing_status: 'ready' 
    }).eq('id', orderId);
  }

  return NextResponse.json({ received: true });
}