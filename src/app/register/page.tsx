"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import ReCAPTCHA from "react-google-recaptcha";
import { useRouter } from "next/navigation";

export default function RegisterPage() {
  const router = useRouter();

  const [authorized, setAuthorized] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);

  const [branches, setBranches] = useState<any[]>([]);
  const [grades, setGrades] = useState<any[]>([]);

  type Stream = {
    id: string;
    name: string;
  };

  const [streams, setStreams] = useState<Stream[]>([]);

  const [branch, setBranch] = useState("");
  const [grade, setGrade] = useState("");
  const [stream, setStream] = useState("");
  const [gradeName, setGradeName] = useState("");

  const [firstName, setFirstName] = useState("");
  const [middleName, setMiddleName] = useState("");
  const [lastName, setLastName] = useState("");
  const [dob, setDob] = useState("");
  const [phone1, setPhone1] = useState("");
  const [phone2, setPhone2] = useState("");
  const [studentType, setStudentType] = useState("new");

  const [studentPhoto, setStudentPhoto] = useState<File | null>(null);
  const [guardianPhoto, setGuardianPhoto] = useState<File | null>(null);
  const [idFront, setIdFront] = useState<File | null>(null);
  const [idBack, setIdBack] = useState<File | null>(null);
  const [certificate, setCertificate] = useState<File | null>(null);
  const [examResult, setExamResult] = useState<File | null>(null);

  const [captchaToken, setCaptchaToken] = useState<string | null>(null);

  const [loading, setLoading] = useState(false);

  // 1. 🔐 AUTH CHECK
  useEffect(() => {
    const checkAuth = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        router.push("/login");
        return;
      }

      const user = session.user;

      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single();

      if (!profile || profile.role !== "guardian") {
        router.push("/login");
        return;
      }

      setAuthorized(true);
      setCheckingAuth(false);
    };

    checkAuth();
  }, [router]);

  // 2. LOAD BRANCHES
  useEffect(() => {
    if (!authorized) return; 
    supabase.from("branches").select("*").then(({ data }) => {
      setBranches(data || []);
    });
  }, [authorized]);

  // 3. LOAD GRADES
  useEffect(() => {
    if (!branch || !authorized) return;

    supabase
      .from("branch_grades")
      .select("grades(id,name)")
      .eq("branch_id", branch)
      .then(({ data }) => {
        setGrades(data?.map((d: any) => d.grades) || []);
      });
  }, [branch, authorized]);

  // 4. LOAD STREAMS
  useEffect(() => {
    if (!grade || !authorized) return;

    const load = async () => {
      const { data: g } = await supabase
        .from("grades")
        .select("name")
        .eq("id", grade)
        .single();

      setGradeName(g?.name || "");

      if (g?.name === "Grade 11" || g?.name === "Grade 12") {
        const { data } = await supabase
          .from("grade_streams")
          .select("streams(id,name)")
          .eq("grade_id", grade);

        setStreams(data?.map((d: any) => d.streams) || []);
      } else {
        setStreams([]);
        setStream("");
      }
    };

    load();
  }, [grade, authorized]);

  // 🔥 SUBMIT LOGIC (FIXED)
  const handleSubmit = async () => {
    setLoading(true);
    try {
      if (!captchaToken) throw new Error("Please complete CAPTCHA");

      // Verification is now handled only once inside /api/register-student
      
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not logged in");

      if (!studentPhoto || !guardianPhoto) throw new Error("Photos are required");

      const studentPayload = {
        first_name: firstName,
        middle_name: middleName,
        last_name: lastName,
        date_of_birth: dob,
        phone_primary: phone1,
        phone_secondary: phone2,
        student_type: studentType,
      };

      const registrationPayload = {
        branch_id: branch,
        grade_id: grade,
        stream_id: stream || null,
        academic_year: "2018 E.C",
      };

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Session expired.");

      const formData = new FormData();
      formData.append("student", JSON.stringify(studentPayload));
      formData.append("registration", JSON.stringify(registrationPayload));
      formData.append("captchaToken", captchaToken);

      if (studentPhoto) formData.append("student_photo", studentPhoto);
      if (guardianPhoto) formData.append("guardian_photo", guardianPhoto);
      if (idFront) formData.append("id_front", idFront);
      if (idBack) formData.append("id_back", idBack);
      if (certificate) formData.append("certificate", certificate);
      if (examResult) formData.append("exam_result", examResult);

      const res = await fetch("/api/register-student", {
        method: "POST",
        headers: { Authorization: `Bearer ${session.access_token}` },
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      alert("✅ Registration successful");
      window.location.reload();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setLoading(false);
    }
  };

  // ⛔ CONDITIONAL RETURNS
  if (checkingAuth) return <div className="p-10">Checking access...</div>;
  if (!authorized) return null;

  return (
    <div className="p-10 space-y-3 max-w-md">
      <h1 className="text-xl font-bold">Register Student</h1>

      <input placeholder="First Name" onChange={(e) => setFirstName(e.target.value)} className="border p-2 w-full" />
      <input placeholder="Middle Name" onChange={(e) => setMiddleName(e.target.value)} className="border p-2 w-full" />
      <input placeholder="Last Name" onChange={(e) => setLastName(e.target.value)} className="border p-2 w-full" />
      <input type="date" onChange={(e) => setDob(e.target.value)} className="border p-2 w-full" />

      <input placeholder="Phone 1" onChange={(e) => setPhone1(e.target.value)} className="border p-2 w-full" />
      <input placeholder="Phone 2" onChange={(e) => setPhone2(e.target.value)} className="border p-2 w-full" />

      <select onChange={(e) => setStudentType(e.target.value)} className="border p-2 w-full">
        <option value="new">New Student</option>
        <option value="transfer">Transfer</option>
      </select>

      <select onChange={(e) => setBranch(e.target.value)} className="border p-2 w-full">
        <option value="">Select Branch</option>
        {branches.map((b) => (
          <option key={b.id} value={b.id}>{b.name}</option>
        ))}
      </select>

      <select onChange={(e) => setGrade(e.target.value)} className="border p-2 w-full">
        <option value="">Select Grade</option>
        {grades.map((g) => (
          <option key={g.id} value={g.id}>{g.name}</option>
        ))}
      </select>

      {streams.length > 0 && (
        <select onChange={(e) => setStream(e.target.value)} className="border p-2 w-full">
          <option value="">Select Stream</option>
          {streams.map((s: any) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
      )}

      <div className="space-y-2">
        <p className="text-sm font-semibold">Student Photo</p>
        <input type="file" onChange={(e) => setStudentPhoto(e.target.files?.[0] || null)} />
        
        <p className="text-sm font-semibold">Guardian Photo</p>
        <input type="file" onChange={(e) => setGuardianPhoto(e.target.files?.[0] || null)} />

        {studentType === "transfer" && (
          <>
            <p className="text-sm font-semibold text-blue-600">ID Front</p>
            <input type="file" onChange={(e) => setIdFront(e.target.files?.[0] || null)} />
            <p className="text-sm font-semibold text-blue-600">ID Back</p>
            <input type="file" onChange={(e) => setIdBack(e.target.files?.[0] || null)} />
            <p className="text-sm font-semibold text-blue-600">Certificate</p>
            <input type="file" onChange={(e) => setCertificate(e.target.files?.[0] || null)} />
          </>
        )}

        {(gradeName === "Grade 7" || gradeName === "Grade 9") && (
          <>
            <p className="text-sm font-semibold text-red-600">Exam Result</p>
            <input type="file" onChange={(e) => setExamResult(e.target.files?.[0] || null)} />
          </>
        )}
      </div>

      <div className="py-4">
        <ReCAPTCHA
          sitekey={process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY!}
          onChange={(token) => setCaptchaToken(token)}
        />
      </div>

      <button onClick={handleSubmit} disabled={loading} className="bg-green-600 text-white p-2 w-full rounded font-bold">
        {loading ? "Submitting..." : "Submit Registration"}
      </button>
    </div>
  );
}