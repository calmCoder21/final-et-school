import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { registration_id } = body;

    if (!registration_id) {
      return NextResponse.json(
        { error: "Missing registration_id" },
        { status: 400 }
      );
    }

    // 🔐 1. GET TOKEN
    const authHeader = req.headers.get("authorization");

    if (!authHeader) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const token = authHeader.replace("Bearer ", "");

    // 🔐 2. USER CLIENT (WITH TOKEN)
    const supabaseUser = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        global: {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      }
    );

    const {
      data: { user },
      error: userErr,
    } = await supabaseUser.auth.getUser();

    if (!user || userErr) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!user.email) {
      return NextResponse.json(
        { error: "User email missing" },
        { status: 400 }
      );
    }

    // 🔐 3. ROLE CHECK (guardian only)
    const { data: profile, error: roleErr } = await supabaseUser
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (roleErr || profile?.role !== "guardian") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // 🔥 4. SERVICE ROLE CLIENT
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // 🔥 5. GET REGISTRATION
    const { data: reg, error: regError } = await supabase
      .from("registrations")
      .select(`
        *,
        students (
          guardian_id,
          first_name,
          last_name,
          phone_primary
        )
      `)
      .eq("id", registration_id)
      .single();

    if (regError || !reg) {
      return NextResponse.json(
        { error: "Registration not found" },
        { status: 400 }
      );
    }

    // 🔐 OWNER CHECK
    if (reg.students?.guardian_id !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // 🔒 STATUS CHECK
    if (reg.status !== "approved") {
      return NextResponse.json(
        { error: "Not eligible for payment" },
        { status: 400 }
      );
    }

    // 🔒 EXPIRY CHECK
    if (reg.expires_at && new Date(reg.expires_at) < new Date()) {
      return NextResponse.json(
        { error: "Registration expired" },
        { status: 400 }
      );
    }

    // 🔥 6. GET PRICE
    const { data: price, error: priceErr } = await supabase
      .from("pricing")
      .select("*")
      .eq("branch_id", reg.branch_id)
      .eq("grade_id", reg.grade_id)
      .eq("academic_year", reg.academic_year)
      .single();

    if (priceErr || !price) {
      return NextResponse.json(
        { error: "Price not found" },
        { status: 400 }
      );
    }

    // 🔥 7. PREPARE DATA
    const student = reg.students;

    let phone = student?.phone_primary || "";

    if (phone) {
      if (phone.startsWith("0")) {
        phone = "251" + phone.slice(1);
      }
      if (!phone.startsWith("251")) {
        phone = "251" + phone;
      }
    }

    const tx_ref = `tx-${registration_id.slice(0, 8)}-${Date.now()}`;

    // 🔥 8. INSERT PAYMENT
    const { error: insertErr } = await supabase
      .from("payments")
      .insert([
        {
          registration_id,
          tx_ref,
          amount: price.amount,
          status: "pending",
          customer_email: user.email,
        },
      ]);

    if (insertErr) {
      console.log("❌ Payment insert failed:", insertErr.message);

      return NextResponse.json(
        { error: "Failed to create payment" },
        { status: 500 }
      );
    }

    // 🔥 9. CALL CHAPA
    const chapaRes = await fetch(
      "https://api.chapa.co/v1/transaction/initialize",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.CHAPA_SECRET_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          amount: price.amount.toString(),
          currency: "ETB",
          email: user.email,
          first_name: student?.first_name || "Student",
          last_name: student?.last_name || "",
          phone_number: phone,
          tx_ref,
          callback_url: process.env.CHAPA_CALLBACK_URL,
          return_url: `${process.env.APP_URL}/dashboard`,
        }),
      }
    );

    // 🔥 RAW RESPONSE (VERY IMPORTANT)
    const rawText = await chapaRes.text();
    console.log("🧾 CHAPA RAW RESPONSE:", rawText);

    let chapaData;

    try {
      chapaData = JSON.parse(rawText);
    } catch (err) {
      return NextResponse.json(
        {
          error: "Invalid Chapa response",
          raw: rawText,
        },
        { status: 500 }
      );
    }

    // 🔥 HANDLE FAILURE WITH FULL DEBUG
    if (!chapaData?.data?.checkout_url) {
      console.log("❌ CHAPA ERROR FULL RESPONSE:", chapaData);

      return NextResponse.json(
        {
          error: "Chapa failed",
          chapa: chapaData,
        },
        { status: 500 }
      );
    }

    // ✅ SUCCESS
    return NextResponse.json({
      checkout_url: chapaData.data.checkout_url,
    });

  } catch (err: any) {
    console.error("❌ INIT PAYMENT ERROR:", err);

    return NextResponse.json(
      { error: err.message || "Server error" },
      { status: 500 }
    );
  }
}