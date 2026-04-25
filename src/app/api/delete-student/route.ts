import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { v2 as cloudinary } from "cloudinary";

// 🔥 CONFIGURE CLOUDINARY
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME!,
  api_key: process.env.CLOUDINARY_API_KEY!,
  api_secret: process.env.CLOUDINARY_API_SECRET!,
});

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { student_id } = body;

    if (!student_id) {
      return NextResponse.json(
        { error: "Missing student_id" },
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
          headers: { Authorization: `Bearer ${token}` },
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

    // 🔐 ROLE
    const { data: profile } = await supabaseUser
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (!profile) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // 🔥 ADMIN CLIENT
    const admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // 🔎 FETCH STUDENT
    const { data: student, error: studentErr } = await admin
      .from("students")
      .select("*")
      .eq("id", student_id)
      .single();

    if (studentErr || !student) {
      return NextResponse.json(
        { error: "Student not found" },
        { status: 404 }
      );
    }

    // 🔎 FETCH REGISTRATION (latest one if multiple exist)
    const { data: reg } = await admin
      .from("registrations")
      .select("*")
      .eq("student_id", student_id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    // 🔐 PERMISSION CHECK (FIXED LOGIC)
    if (profile.role === "guardian") {
      if (student.guardian_id !== user.id) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }

      // 🚫 BLOCK ONLY THESE
      const blockedStatuses = ["approved", "enrolled"];

      if (reg && blockedStatuses.includes(reg.status)) {
        return NextResponse.json(
          { error: "Cannot delete after approval" },
          { status: 403 }
        );
      }
    }

    // 🔐 ONLY admin OR owner guardian
    if (profile.role !== "guardian" && profile.role !== "admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // 🔎 GET DOCUMENTS
    const { data: docs } = await admin
      .from("documents")
      .select("public_id")
      .eq("student_id", student_id)
      .is("deleted_at", null);

    const now = new Date().toISOString();

    // 🔥 1. SOFT DELETE (ORDER MATTERS)
    await admin
      .from("students")
      .update({ deleted_at: now })
      .eq("id", student_id);

    await admin
      .from("documents")
      .update({ deleted_at: now })
      .eq("student_id", student_id);

    await admin
      .from("registrations")
      .update({ status: "deleted" })
      .eq("student_id", student_id);

    // 🔥 2. CLOUDINARY CLEANUP
    if (docs && docs.length > 0) {
      const publicIds = docs
        .map((d) => d.public_id)
        .filter(Boolean);

      if (publicIds.length > 0) {
        try {
          await Promise.all(
            publicIds.map((id) =>
              cloudinary.uploader.destroy(id)
            )
          );
        } catch (err) {
          console.error("Cloudinary deletion failed:", err);
        }
      }
    }

    // 🔥 AUDIT LOG
    const ip =
      req.headers.get("x-forwarded-for") ||
      req.headers.get("x-real-ip") ||
      "unknown";

    await admin.from("audit_logs").insert({
      user_id: user.id,
      action: "DELETE_STUDENT",
      target_id: student_id,
      old_value: student,
      new_value: null,
      ip,
    });

    return NextResponse.json({ success: true });

  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Server error" },
      { status: 500 }
    );
  }
}