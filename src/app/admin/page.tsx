"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useRouter } from "next/navigation";

export default function AdminPage() {
  const router = useRouter();

  const [authorized, setAuthorized] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);

  const [registrations, setRegistrations] = useState<any[]>([]);
  const [documents, setDocuments] = useState<any[]>([]);
  const [selectedStudent, setSelectedStudent] = useState<any>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);

  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);

  const [token, setToken] = useState<string | null>(null);

  // 🔐 AUTH
  useEffect(() => {
    const checkAccess = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      const user = session?.user;

      if (!user || !session) {
        router.push("/login");
        return;
      }

      setToken(session.access_token);

      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single();

      if (!profile || profile.role !== "admin") {
        router.push("/dashboard");
        return;
      }

      setAuthorized(true);
      setCheckingAuth(false);
    };

    checkAccess();
  }, [router]);

  useEffect(() => {
    if (!authorized) return;
    loadRegistrations();
  }, [authorized]);

  const loadRegistrations = async () => {
    const { data } = await supabase
      .from("registrations")
      .select(`
        id,
        student_id,
        status,
        rejection_reason,
        academic_year,
        students!inner(first_name, last_name, phone_primary, deleted_at),
        branches(name),
        grades(name)
      `)
      .is("students.deleted_at", null)
      .neq("status", "deleted")
      .order("created_at", { ascending: false });

    setRegistrations(data || []);
  };

  // ✅ APPROVE (UNCHANGED)
  const approve = async (r: any) => {
    if (!token) return alert("No auth token");

    setLoadingId(r.id);

    try {
      const res = await fetch("/api/admin/approve", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          registration_id: r.id,
        }),
      });

      const data = await res.json();
      if (!res.ok) return alert(data.error);

      alert("✅ Approved successfully");
      loadRegistrations();

      const phone = r.students?.phone_primary;

      if (phone) {
        const message =
          "Your registration has been approved. Please complete payment within 48 hours.";

        try {
          await fetch("/api/send-sms", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ phone, message }),
          });
        } catch {
          await supabase.from("sms_queue").insert([
            { phone, message, attempts: 0, status: "pending" },
          ]);
        }
      }
    } catch {
      alert("Something went wrong");
    }

    setLoadingId(null);
  };

  // 🔥 NEW: REJECT
  const reject = async (r: any) => {
    if (!token) return alert("No auth token");

    const reason = prompt("Enter rejection reason:");
    if (!reason || reason.trim() === "") {
      return alert("Rejection reason is required");
    }

    setLoadingId(r.id);

    try {
      const res = await fetch("/api/admin/reject", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          registration_id: r.id,
          reason,
        }),
      });

      const data = await res.json();
      if (!res.ok) return alert(data.error);

      alert("❌ Registration rejected");
      loadRegistrations();

      const phone = r.students?.phone_primary;

      if (phone) {
        const message = `Your registration was rejected. Reason: ${reason}`;

        try {
          await fetch("/api/send-sms", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ phone, message }),
          });
        } catch {
          await supabase.from("sms_queue").insert([
            { phone, message, attempts: 0, status: "pending" },
          ]);
        }
      }
    } catch {
      alert("Reject failed");
    }

    setLoadingId(null);
  };

  // 🔥 DELETE (UNCHANGED)
  const deleteStudent = async (studentId: string) => {
    if (!token) return alert("No auth token");

    if (!confirm("Are you sure you want to delete this student?")) return;

    setLoadingId(studentId);

    try {
      const res = await fetch("/api/delete-student", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ student_id: studentId }),
      });

      const data = await res.json();
      if (!res.ok) return alert(data.error);

      alert("🗑️ Student deleted");
      loadRegistrations();
      setSelectedStudent(null);
    } catch {
      alert("Delete failed");
    }

    setLoadingId(null);
  };

  const loadDocuments = async (studentId: string) => {
    const { data } = await supabase
      .from("documents")
      .select("*")
      .eq("student_id", studentId)
      .is("deleted_at", null);

    setDocuments(data || []);
  };

  const openViewer = async (student: any, studentId: string) => {
    setSelectedStudent(student);
    await loadDocuments(studentId);
  };

  const getDoc = (type: string) =>
    documents.find((d) => d.type === type)?.file_url;

  const openFullscreen = (url: string) => {
    setPreviewUrl(url);
    setZoom(1);
  };

  if (checkingAuth) return <div className="p-10">Checking access...</div>;
  if (!authorized) return null;

  return (
    <div className="p-10 space-y-6">
      <h1 className="text-xl font-bold">Admin Panel</h1>

      <table className="w-full border">
        <thead>
          <tr className="border bg-gray-100">
            <th className="p-2">Student</th>
            <th className="p-2">Branch</th>
            <th className="p-2">Grade</th>
            <th className="p-2">Status</th>
            <th className="p-2">Actions</th>
          </tr>
        </thead>

        <tbody>
          {registrations.map((r) => (
            <tr key={r.id} className="border text-center">
              <td className="p-2">
                {r.students?.first_name} {r.students?.last_name}
              </td>
              <td className="p-2">{r.branches?.name}</td>
              <td className="p-2">{r.grades?.name}</td>
              <td className="p-2">
                {r.status}
                {r.status === "rejected" && r.rejection_reason && (
                  <p className="text-xs text-red-600">
                    {r.rejection_reason}
                  </p>
                )}
              </td>

              <td className="p-2 space-x-2">
                <button
                  onClick={() => openViewer(r.students, r.student_id)}
                  className="bg-gray-600 text-white px-2 py-1"
                >
                  View Docs
                </button>

                {r.status === "pending" && (
                  <>
                    <button
                      onClick={() => approve(r)}
                      disabled={loadingId === r.id}
                      className="bg-green-600 text-white px-2 py-1"
                    >
                      {loadingId === r.id ? "Processing..." : "Approve"}
                    </button>

                    <button
                      onClick={() => reject(r)}
                      disabled={loadingId === r.id}
                      className="bg-yellow-600 text-white px-2 py-1"
                    >
                      Reject
                    </button>
                  </>
                )}

                <button
                  onClick={() => deleteStudent(r.student_id)}
                  disabled={loadingId === r.student_id}
                  className="bg-red-600 text-white px-2 py-1"
                >
                  Delete
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* KEEP REST EXACTLY SAME */}
      {selectedStudent && (
        <div className="border-2 border-blue-500 p-5 mt-5 space-y-4 bg-white">
          <div className="flex justify-between items-center">
            <h2 className="text-lg font-bold">
              Documents: {selectedStudent.first_name}{" "}
              {selectedStudent.last_name}
            </h2>

            <button
              onClick={() => setSelectedStudent(null)}
              className="bg-red-500 text-white px-4 py-1"
            >
              Close Sidebar
            </button>
          </div>

          <div className="grid grid-cols-3 gap-4">
            {[
              "student_photo",
              "guardian_photo",
              "id_front",
              "id_back",
              "certificate",
              "exam_result",
            ].map((type) => {
              const url = getDoc(type);
              if (!url) return null;

              return (
                <div key={type} className="border p-2 text-center">
                  <p className="capitalize text-sm mb-1">
                    {type.replace("_", " ")}
                  </p>

                  <img
                    src={url}
                    className="w-full h-32 object-cover cursor-pointer hover:opacity-80 border"
                    onClick={() => openFullscreen(url)}
                    alt={type}
                  />

                  <button
                    onClick={() => openFullscreen(url)}
                    className="text-xs text-blue-600 underline mt-1"
                  >
                    Full Preview
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {previewUrl && (
        <div className="fixed inset-0 z-50 bg-black bg-opacity-90 flex flex-col items-center justify-center p-4">
          <div className="absolute top-5 right-5 space-x-4">
            <button
              onClick={() => setZoom((z) => z + 0.5)}
              className="bg-white text-black px-4 py-2 font-bold"
            >
              Zoom In (+)
            </button>

            <button
              onClick={() => setZoom((z) => Math.max(0.5, z - 0.5))}
              className="bg-white text-black px-4 py-2 font-bold"
            >
              Zoom Out (-)
            </button>

            <button
              onClick={() => setPreviewUrl(null)}
              className="bg-red-600 text-white px-6 py-2 font-bold"
            >
              EXIT PREVIEW
            </button>
          </div>

          <div className="w-full h-full overflow-auto flex items-center justify-center cursor-move">
            <img
              src={previewUrl}
              style={{
                transform: `scale(${zoom})`,
                transition: "transform 0.2s",
              }}
              className="max-w-none shadow-2xl"
              alt="Preview"
            />
          </div>

          <p className="text-white mt-2">
            Use Scroll or Buttons to Zoom. Drag to pan.
          </p>
        </div>
      )}
    </div>
  );
}