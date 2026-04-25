import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function POST(req: Request) {
  try {
    const { registration_id } = await req.json();

    // 🔐 GET TOKEN
    const authHeader = req.headers.get("authorization");

    if (!authHeader) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const token = authHeader.replace("Bearer ", "");

    // 🔐 USER CLIENT (WITH TOKEN)
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

    // 🔐 ROLE CHECK
    const { data: profile, error: roleErr } = await supabaseUser
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (roleErr || profile?.role !== "admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // 🔥 SERVICE ROLE (SAFE NOW)
    const adminClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { error } = await adminClient.rpc(
      "approve_registration_secure",
      { reg_id: registration_id }
    );

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ success: true });

  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Server error" },
      { status: 500 }
    );
  }
}