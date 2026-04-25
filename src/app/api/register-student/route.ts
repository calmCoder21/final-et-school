import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { v2 as cloudinary } from "cloudinary";

// 🔥 CONFIG
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME!,
  api_key: process.env.CLOUDINARY_API_KEY!,
  api_secret: process.env.CLOUDINARY_API_SECRET!,
});

const verifyCaptcha = async (token: string) => {
  const secret = process.env.RECAPTCHA_SECRET_KEY;
  const res = await fetch("https://www.google.com/recaptcha/api/siteverify", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `secret=${secret}&response=${token}`,
  });
  const data = await res.json();
  if (!data.success) throw new Error("Captcha verification failed");
};

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const captchaToken = formData.get("captchaToken") as string;

    if (!captchaToken) return NextResponse.json({ error: "Captcha missing" }, { status: 400 });
    await verifyCaptcha(captchaToken);

    const student = JSON.parse(formData.get("student") as string);
    const registration = JSON.parse(formData.get("registration") as string);

    const authHeader = req.headers.get("authorization");
    if (!authHeader) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const token = authHeader.replace("Bearer ", "");

    const admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { data: { user } } = await admin.auth.getUser(token);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    // 1. CREATE STUDENT RECORD (To get the ID)
    const { data: newStudent, error: studentErr } = await admin
      .from("students")
      .insert({
        ...student,
        guardian_id: user.id,
      })
      .select()
      .single();

    if (studentErr || !newStudent) throw new Error("Failed to create student record");
    const student_id = newStudent.id;

    // Helper wrapper for cloudinary
    const uploadFile = (file: File | null, type: string) =>
      new Promise<any>(async (resolve, reject) => {
        if (!file) return resolve(null);
        const buffer = Buffer.from(await file.arrayBuffer());
        const stream = cloudinary.uploader.upload_stream(
          { folder: `students/${student_id}`, public_id: `${type}_${Date.now()}` },
          (err, result) => {
            if (err) return reject(err);
            resolve(result);
          }
        );
        stream.end(buffer);
      });

    // 2. UPLOAD ALL FILES
    const [sPhoto, gPhoto, idF, idB, cert, exam] = await Promise.all([
      uploadFile(formData.get("student_photo") as File, "student_photo"),
      uploadFile(formData.get("guardian_photo") as File, "guardian_photo"),
      uploadFile(formData.get("id_front") as File, "id_front"),
      uploadFile(formData.get("id_back") as File, "id_back"),
      uploadFile(formData.get("certificate") as File, "certificate"),
      uploadFile(formData.get("exam_result") as File, "exam_result"),
    ]);

    // 3. UPDATE STUDENT TABLE (Using your correct column names)
    const { error: updateErr } = await admin
      .from("students")
      .update({
        student_photo_url: sPhoto?.secure_url || null, // ✅ Corrected name
        guardian_photo_url: gPhoto?.secure_url || null, // ✅ Corrected name
      })
      .eq("id", student_id);

    if (updateErr) console.error("Update Error:", updateErr);

    // 4. ARCHIVE IN DOCUMENTS TABLE
    const docs: any[] = [];
    const pushDoc = (res: any, type: string) => {
      if (res) docs.push({ student_id, type, file_url: res.secure_url, public_id: res.public_id });
    };

    pushDoc(sPhoto, "student_photo");
    pushDoc(gPhoto, "guardian_photo");
    pushDoc(idF, "id_front");
    pushDoc(idB, "id_back");
    pushDoc(cert, "certificate");
    pushDoc(exam, "exam_result");

    if (docs.length > 0) await admin.from("documents").insert(docs);

    // 5. REGISTRATION
    await admin.from("registrations").insert({ ...registration, student_id });

    return NextResponse.json({ success: true, student_id });

  } catch (err: any) {
    console.error("ATOMIC ERROR:", err);
    return NextResponse.json({ error: err.message || "Server error" }, { status: 500 });
  }
}