import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    let { phone, message } = body;

    if (!phone || !message) {
      return NextResponse.json(
        { error: "Missing phone or message" },
        { status: 400 }
      );
    }

    // ✅ FIX ETHIOPIA FORMAT
    // Ensures format is 2519... or 2517...
    phone = phone.replace(/^0/, "251");
    if (!phone.startsWith("251")) {
      phone = "251" + phone;
    }

    console.log("📤 Sending SMS to:", phone);

    // ✅ SMSEthiopia requires JSON with 'msisdn' and 'text'
    const payload = {
      msisdn: phone,
      text: message,
    };

    // ✅ Endpoint must be /api/sms/send
    const response = await fetch("https://smsethiopia.com/api/sms/send", {
      method: "POST",
      headers: {
        // ✅ They use 'KEY' instead of 'Authorization'
        "KEY": process.env.SMS_ETHIOPIA_API_KEY || "", 
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const raw = await response.text();
    console.log("📩 SMS RAW RESPONSE:", raw);

    if (!response.ok) {
      return NextResponse.json(
        { error: "SMS failed", raw },
        { status: response.status }
      );
    }

    console.log("✅ SMS SENT SUCCESSFULLY");

    return NextResponse.json({ success: true, data: JSON.parse(raw) });

  } catch (err: any) {
    console.error("❌ SMS ERROR:", err);

    return NextResponse.json(
      { error: err.message || "Internal Server Error" },
      { status: 500 }
    );
  }
}