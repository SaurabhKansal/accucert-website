import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";
import { runOCR } from "@/lib/ocr"; 
import Stripe from "stripe";

// REMOVED: apiVersion requirement to allow Stripe to use account default
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export const runtime = "nodejs";
export const maxDuration = 300; 

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    
    const file = formData.get("file") as File | null;
    const userEmail = (formData.get("email") as string | null) || "";
    const fullName = (formData.get("fullName") as string | null) || "";
    const phone = (formData.get("phone") as string | null) || "";
    const address = (formData.get("address") as string | null) || "";
    const serviceLevel = (formData.get("serviceLevel") as string | null) || "standard";
    const urgency = (formData.get("urgency") as string | null) || "normal";

    if (!file || !userEmail || !fullName) {
      return new Response(JSON.stringify({ error: "Missing required information" }), { status: 400 });
    }

    // 1. INITIALIZE CLIENTS
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
    const resendKey = process.env.RESEND_API_KEY?.trim();

    const supabase = createClient(supabaseUrl!, supabaseKey!);
    const resend = new Resend(resendKey);

    const buffer = Buffer.from(await file.arrayBuffer());

    // 2. UPLOAD TO STORAGE
    const fileName = `${Date.now()}-${file.name}`;
    await supabase.storage
      .from("documents")
      .upload(`uploads/${fileName}`, buffer, { contentType: file.type });

    const { data: { publicUrl } } = supabase.storage
      .from("documents")
      .getPublicUrl(`uploads/${fileName}`);

    // 3. RUN OCR
    const translatedText = await runOCR(buffer);

    // 4. CALCULATE PRICE (Customizable)
    let amount = 2500; // Base price £25.00 (in pence)
    if (serviceLevel === "certified") amount += 2000; // +£20
    if (urgency === "expedited") amount += 1500; // +£15

    // 5. CREATE STRIPE SESSION
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      line_items: [
        {
          price_data: {
            currency: "gbp",
            product_data: {
              name: `${serviceLevel.toUpperCase()} Translation - ${file.name}`,
              description: `Urgency: ${urgency}`,
            },
            unit_amount: amount,
          },
          quantity: 1,
        },
      ],
      mode: "payment",
      // Redirects to your new Success page with Suspense fix
      success_url: `${req.headers.get("origin")}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${req.headers.get("origin")}/`,
      customer_email: userEmail,
    });

    // 6. SAVE TO DB (Including Stripe ID)
    const { data, error: dbError } = await supabase
      .from("translations")
      .insert([{
        filename: file.name,
        user_email: userEmail,
        full_name: fullName,
        phone: phone,
        postal_address: address,
        service_level: serviceLevel,
        urgency: urgency,
        extracted_text: translatedText,
        status: "pending",
        payment_status: "unpaid",
        stripe_session_id: session.id,
        image_url: publicUrl,
        version_history: [] // Ensure JSONB column starts empty
      }])
      .select().single();

    if (dbError) throw dbError;

    // 7. SEND INITIAL EMAIL
    await resend.emails.send({
      from: "Accucert <onboarding@resend.dev>", 
      to: userEmail,
      subject: `Order Created: ${fullName}`,
      html: `<h3>Order Pending Payment</h3><p>Hi ${fullName}, please complete your payment to start the review process.</p>`,
    });

    // RETURN THE STRIPE URL FOR FRONT-END REDIRECT
    return new Response(JSON.stringify({ 
      success: true, 
      id: data.id, 
      stripeUrl: session.url 
    }), { status: 200 });

  } catch (err: any) {
    console.error("UPLOAD ERROR:", err.message);
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}