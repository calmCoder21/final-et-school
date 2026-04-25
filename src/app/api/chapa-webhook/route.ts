import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sendSMS } from "@/lib/sendSMS";

async function handleWebhook(rawData: any) {
  console.log("📩 WEBHOOK RECEIVED:", rawData);

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // 🔥 ALWAYS LOG RAW
  await supabase.from("payment_logs").insert([
    {
      payload: rawData,
    },
  ]);

  // 🔐 1. SAFE trx_ref extraction
  const trx_ref =
    rawData?.tx_ref ||
    rawData?.data?.tx_ref ||
    rawData?.trx_ref ||
    rawData?.data?.trx_ref;

  if (!trx_ref) {
    console.log("❌ No trx_ref found in webhook");
    return NextResponse.json({ message: "Ignored" });
  }

  console.log("🔎 USING trx_ref:", trx_ref);

  // 🔐 2. VERIFY WITH CHAPA (SOURCE OF TRUTH)
  let verifyData;

  try {
    const verifyRes = await fetch(
      `https://api.chapa.co/v1/transaction/verify/${trx_ref}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${process.env.CHAPA_SECRET_KEY}`,
        },
      }
    );

    verifyData = await verifyRes.json();

    console.log("🔍 CHAPA VERIFY:", verifyData);

    if (
      verifyData.status !== "success" ||
      verifyData.data?.status !== "success"
    ) {
      console.log("❌ Payment NOT verified");
      return NextResponse.json({ error: "Invalid payment" });
    }
  } catch (err) {
    console.log("❌ Verification failed:", err);
    return NextResponse.json({ error: "Verification failed" });
  }

  const chapa = verifyData.data;

  // 🔥 3. FIND PAYMENT
  const { data: payment, error } = await supabase
    .from("payments")
    .select("*")
    .eq("tx_ref", trx_ref)
    .single();

  if (error || !payment) {
    console.log("❌ Payment not found");
    return NextResponse.json({ error: "Payment not found" });
  }

  // 🔥 4. PREVENT DUPLICATE
  if (payment.status === "paid") {
    console.log("⚠️ Duplicate webhook ignored");
    return NextResponse.json({ message: "Already processed" });
  }

  // 🔐 5. STRICT VALIDATION

  if (Number(chapa.amount) !== Number(payment.amount)) {
    console.log("❌ Amount mismatch", chapa.amount, payment.amount);
    return NextResponse.json({ error: "Amount mismatch" });
  }

  if (chapa.currency !== "ETB") {
    console.log("❌ Currency mismatch", chapa.currency);
    return NextResponse.json({ error: "Currency mismatch" });
  }

  if (chapa.tx_ref !== payment.tx_ref) {
    console.log("❌ tx_ref mismatch");
    return NextResponse.json({ error: "tx_ref mismatch" });
  }

  const chapaEmail =
    chapa.email ||
    chapa.customer?.email ||
    "";

  const storedEmail = payment.customer_email;

  if (!chapaEmail || !storedEmail) {
    console.log("❌ Missing email");
    return NextResponse.json({ error: "Email validation failed" });
  }

  if (chapaEmail.toLowerCase() !== storedEmail.toLowerCase()) {
    console.log("❌ Email mismatch", chapaEmail, storedEmail);
    return NextResponse.json({ error: "Email mismatch" });
  }

  // 🔥 6. UPDATE DATABASE
  const now = new Date().toISOString();

  const { error: payErr } = await supabase
    .from("payments")
    .update({
      status: "paid",
      chapa_ref_id: chapa.reference,
      paid_at: now,
    })
    .eq("tx_ref", trx_ref);

  if (payErr) {
    console.log("❌ Payment update failed:", payErr.message);
    return NextResponse.json({ error: "Payment update failed" });
  }

  const { error: regErr } = await supabase
    .from("registrations")
    .update({
      status: "enrolled",
      paid_at: now,
    })
    .eq("id", payment.registration_id);

  if (regErr) {
    console.log("❌ Registration update failed:", regErr.message);
    return NextResponse.json({ error: "Registration update failed" });
  }

  // 🔥 7. SEND SMS
  const { data: reg } = await supabase
    .from("registrations")
    .select("student_id")
    .eq("id", payment.registration_id)
    .single();

  const { data: student } = await supabase
    .from("students")
    .select("phone_primary")
    .eq("id", reg?.student_id)
    .single();

  let phone = student?.phone_primary;

  if (phone) {
    phone = phone.replace(/^0/, "251");
  }

  if (phone) {
    try {
      await sendSMS(
        phone,
        "Your payment was successful. Enrollment is complete."
      );
    } catch {
      await supabase.from("sms_queue").insert([
        {
          phone,
          message:
            "Your payment was successful. Enrollment is complete.",
          attempts: 0,
          status: "pending",
        },
      ]);
    }
  }

  console.log("✅ PAYMENT COMPLETED:", payment.registration_id);

  return NextResponse.json({ message: "Success" });
}

// ✅ POST
export async function POST(req: Request) {
  const body = await req.json();
  return handleWebhook(body);
}

// ❌ Ignore GET safely (do NOT process)
export async function GET() {
  return NextResponse.json({ message: "Ignored" });
}