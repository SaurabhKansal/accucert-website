import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import Stripe from "stripe";
import { headers } from "next/headers";

// REMOVED: apiVersion requirement to stay consistent with the upload route
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY! // Bypass RLS to update payment status
);

export async function POST(req: Request) {
  const body = await req.text();
  const signature = (await headers()).get("Stripe-Signature") as string;

  let event: Stripe.Event;

  try {
    // Verify the event came from Stripe using your Webhook Secret
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch (err: any) {
    console.error(`Webhook Signature Error: ${err.message}`);
    return new Response(`Webhook Error: ${err.message}`, { status: 400 });
  }

  // Handle successful payments
  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;

    // Update the database: Mark as 'paid' where the stripe_session_id matches
    const { error } = await supabase
      .from("translations")
      .update({ payment_status: "paid" })
      .eq("stripe_session_id", session.id);

    if (error) {
      console.error("Supabase Update Error:", error.message);
      return new Response("Database update failed", { status: 500 });
    }

    console.log(`✅ Payment successful and recorded for Session: ${session.id}`);
  }

  return NextResponse.json({ received: true });
}