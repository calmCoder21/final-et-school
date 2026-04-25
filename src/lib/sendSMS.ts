export async function sendSMS(phone: string, message: string) {
  try {
    phone = phone.replace(/^0/, "251");
    if (!phone.startsWith("251")) {
      phone = "251" + phone;
    }

    const response = await fetch("https://smsethiopia.com/api/sms/send", {
      method: "POST",
      headers: {
        KEY: process.env.SMS_ETHIOPIA_API_KEY || "",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        msisdn: phone,
        text: message,
      }),
    });

    const raw = await response.text();
    console.log("📩 SMS RAW:", raw);

    if (!response.ok) {
      console.error("❌ SMS FAILED:", raw);
    } else {
      console.log("✅ SMS SENT");
    }
  } catch (err) {
    console.error("❌ SMS ERROR:", err);
  }
}