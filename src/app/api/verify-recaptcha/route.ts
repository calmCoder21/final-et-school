import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const { token } = await req.json();

    if (!token) {
      return NextResponse.json(
        { success: false, error: "Missing token" },
        { status: 400 }
      );
    }

    const secret = process.env.RECAPTCHA_SECRET_KEY!;

    const googleRes = await fetch(
      "https://www.google.com/recaptcha/api/siteverify",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: `secret=${secret}&response=${token}`,
      }
    );

    const data = await googleRes.json();

    if (!data.success) {
      return NextResponse.json(
        { success: false, error: "reCAPTCHA failed" },
        { status: 400 }
      );
    }

    return NextResponse.json({ success: true });

  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message },
      { status: 500 }
    );
  }
}