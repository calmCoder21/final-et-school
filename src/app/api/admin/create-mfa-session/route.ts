import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get("authorization");

    if (!authHeader) {
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

    // 🔐 BETTER IP PARSING (handles proxies)
    const forwarded = req.headers.get("x-forwarded-for");
    const ip =
      forwarded?.split(",")[0]?.trim() ||
      req.headers.get("x-real-ip") ||
      "unknown";

    // ⏱️ 5-minute session
    const expires = new Date(Date.now() + 5 * 60 * 1000).toISOString();

    console.log("CREATE MFA SESSION:", {
      user: user.id,
      ip,
      expires,
    });

    const { data, error } = await admin
      .from("mfa_sessions")
      .insert({
        user_id: user.id,
        expires_at: expires,
        used: false,
        ip_address: ip,
      })
      .select()
      .single();

    if (error) {
      console.error("MFA SESSION ERROR:", error);
      return NextResponse.json(
        { error: error.message },
        { status: 400 }
      );
    }

    return NextResponse.json({ token: data.id });

  } catch (err: any) {
    console.error("CREATE MFA ERROR:", err);

    return NextResponse.json(
      { error: err.message || "Server error" },
      { status: 500 }
    );
  }
}