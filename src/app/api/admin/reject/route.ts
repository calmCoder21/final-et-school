import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function POST(req: Request) {
  try {
    const { registration_id, reason } = await req.json();

    if (!registration_id || !reason) {
      return NextResponse.json(
        { error: "Missing registration_id or reason" },
        { status: 400 }
      );
    }

    // 🔐 AUTH HEADER
    const authHeader = req.headers.get("authorization");

    if (!authHeader) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const token = authHeader.replace("Bearer ", "");

    // 🔐 USER CLIENT
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

    // 🔐 VERIFY USER
    const {
      data: { user },
      error: userErr,
    } = await supabaseUser.auth.getUser();

    if (!user || userErr) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 🔐 ROLE CHECK
    const { data: profile, error: roleErr } = await supabaseUser
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (roleErr || profile?.role !== "admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // 🔥 ADMIN CLIENT
    const adminClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // 🔥 CALL RPC
    const { error } = await adminClient.rpc(
      "reject_registration_secure",
      {
        reg_id: registration_id,
        reason: reason,
      }
    );

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ success: true });

  } catch (err: any) {
    console.error("REJECT ERROR:", err);
    return NextResponse.json(
      { error: err.message || "Server error" },
      { status: 500 }
    );
  }
}