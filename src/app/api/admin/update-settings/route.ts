import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get("authorization");
    const mfaToken = req.headers.get("x-mfa-token");

    if (!authHeader || !mfaToken) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const token = authHeader.replace("Bearer ", "");

    const supabaseUser = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        global: {
          headers: { Authorization: `Bearer ${token}` },
        },
      }
    );

    const { data: { user }, error: userErr } =
      await supabaseUser.auth.getUser();

    if (!user || userErr) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // 🔐 GET CLIENT IP
    const currentIp =
      req.headers.get("x-forwarded-for") ||
      req.headers.get("x-real-ip") ||
      "unknown";

    // 🔐 FETCH MFA SESSION
    const { data: session, error: sessionErr } = await admin
      .from("mfa_sessions")
      .select("*")
      .eq("id", mfaToken)
      .maybeSingle();

    if (sessionErr || !session) {
      return NextResponse.json(
        { error: "Invalid MFA session" },
        { status: 403 }
      );
    }

    // 🔐 OWNER CHECK
    if (session.user_id !== user.id) {
      return NextResponse.json(
        { error: "Invalid session owner" },
        { status: 403 }
      );
    }

    // 🔐 IP BINDING CHECK
    if (session.ip_address && session.ip_address !== currentIp) {
      return NextResponse.json(
        { error: "Session context mismatch" },
        { status: 403 }
      );
    }

    // 🔁 USED CHECK
    if (session.used) {
      return NextResponse.json(
        { error: "MFA session already used" },
        { status: 403 }
      );
    }

    // ⏱️ EXPIRY CHECK
    const expiresAt = new Date(session.expires_at);
    const now = new Date();

    if (isNaN(expiresAt.getTime())) {
      return NextResponse.json(
        { error: "Invalid expiration format" },
        { status: 500 }
      );
    }

    if (expiresAt.getTime() < now.getTime()) {
      return NextResponse.json(
        { error: "MFA session expired" },
        { status: 403 }
      );
    }

    // 🔐 ROLE CHECK
    const { data: profile } = await supabaseUser
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (profile?.role !== "admin") {
      return NextResponse.json(
        { error: "Forbidden: Admin only" },
        { status: 403 }
      );
    }

    // 🔐 VALIDATE INPUT
    const body = await req.json();
    const amount = Number(body.amount);

    if (!body.id || isNaN(amount) || amount <= 0 || amount > 1000000) {
      return NextResponse.json(
        { error: "Invalid input" },
        { status: 400 }
      );
    }

    // 🔥 MARK SESSION USED (ANTI-REPLAY)
    await admin
      .from("mfa_sessions")
      .update({ used: true })
      .eq("id", session.id);

    // 🔥 UPDATE DATA
    const { error: updateError } = await admin
      .from("pricing")
      .update({ amount })
      .eq("id", body.id);

    if (updateError) {
      return NextResponse.json({ error: updateError.message });
    }

    // 🔍 OPTIONAL: fetch old value for logging
const { data: oldRow } = await admin
  .from("pricing")
  .select("amount")
  .eq("id", body.id)
  .single();

// 🧾 AUDIT LOG
await admin.from("audit_logs").insert({
  user_id: user.id,
  action: "UPDATE_PRICE",
  target_id: body.id,
  old_value: oldRow ? { amount: oldRow.amount } : null,
  new_value: { amount },
  ip: currentIp,
});

    return NextResponse.json({ success: true });

  } catch (err: any) {
    console.error("API ERROR:", err);

    return NextResponse.json(
      { error: err.message || "Server error" },
      { status: 500 }
    );
  }
}