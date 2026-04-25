"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function Dashboard() {
  const router = useRouter();

  const [authorized, setAuthorized] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [regs, setRegs] = useState<any[]>([]);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [guardian, setGuardian] = useState<{ name: string; photo: string | null }>({ name: "", photo: null });

  // 🎨 Advanced UX: Helper to create a nice avatar if photo is missing
  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  useEffect(() => {
    const checkAccess = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return router.push("/login");

      setToken(session.access_token);

      // 1. Fetch Profile Info
      const { data: profile } = await supabase
        .from("profiles")
        .select("role, full_name")
        .eq("id", session.user.id)
        .single();

      if (!profile || profile.role !== "guardian") return router.push("/login");

      // 2. Optimized UX: Fetch LATEST guardian photo from the students table
      const { data: latestStudent } = await supabase
        .from("students")
        .select("guardian_photo_url")
        .eq("guardian_id", session.user.id)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      setGuardian({
        name: profile.full_name || "Guardian",
        photo: latestStudent?.guardian_photo_url || null,
      });

      setAuthorized(true);
      setCheckingAuth(false);
      load(session.user.id);
    };

    checkAccess();
  }, [router]);

  const load = async (userId: string) => {
    const { data } = await supabase
      .from("registrations")
      .select(`
        id, student_id, status, expires_at, academic_year,
        students!inner(first_name, last_name, guardian_id, deleted_at, student_photo_url),
        branches(name),
        grades(name),
        streams(name)
      `)
      .eq("students.guardian_id", userId)
      .is("students.deleted_at", null)
      .neq("status", "deleted")
      .order("created_at", { ascending: false });

    setRegs(data || []);
  };

  const deleteStudent = async (studentId: string) => {
    if (!token || !confirm("Are you sure you want to delete this registration?")) return;
    setLoadingId(studentId);
    try {
      const res = await fetch("/api/delete-student", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ student_id: studentId }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      
      // Refresh after delete
      const { data: { user } } = await supabase.auth.getUser();
      if (user) load(user.id);
    } catch (err: any) {
      alert(err.message);
    }
    setLoadingId(null);
  };

  if (checkingAuth) return (
    <div className="flex items-center justify-center min-h-screen bg-gray-50">
      <div className="text-center animate-pulse">
        <div className="w-12 h-12 bg-blue-600 rounded-full mx-auto mb-4"></div>
        <p className="font-medium text-gray-500">Syncing Dashboard...</p>
      </div>
    </div>
  );

  if (!authorized) return null;

  return (
    <div className="flex min-h-screen bg-gray-50 font-sans">
      {/* 🏠 STICKY SIDEBAR */}
      <aside className="w-72 bg-white border-r h-screen sticky top-0 flex flex-col items-center p-8 space-y-8 shadow-sm">
        <div className="text-center space-y-4 w-full">
          {/* Guardian Profile Section */}
          <div className="w-28 h-28 rounded-full border-4 border-white shadow-xl overflow-hidden bg-gradient-to-tr from-blue-600 to-blue-400 mx-auto flex items-center justify-center relative">
            {guardian.photo ? (
              <img src={guardian.photo} alt="Guardian" className="w-full h-full object-cover" />
            ) : (
              <span className="text-3xl font-bold text-white tracking-tighter">
                {getInitials(guardian.name)}
              </span>
            )}
          </div>
          
          <div className="space-y-1">
            <h2 className="font-extrabold text-gray-900 text-xl tracking-tight leading-tight">{guardian.name}</h2>
            <div className="flex items-center justify-center space-x-2">
              <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
              <p className="text-[10px] text-gray-400 uppercase tracking-[0.2em] font-black">Active Account</p>
            </div>
          </div>
        </div>

        {/* Action Button */}
        <Link 
          href="/register" 
          className="w-full bg-blue-600 hover:bg-blue-700 text-white text-center py-4 rounded-2xl font-bold transition-all shadow-lg shadow-blue-200 active:scale-95 flex items-center justify-center space-x-2"
        >
          <span>+ Register Student</span>
        </Link>
        
        <div className="flex-grow w-full border-t border-gray-50 mt-4" />
        
        {/* Logout */}
        <button 
          onClick={() => supabase.auth.signOut().then(() => router.push("/login"))} 
          className="w-full text-sm text-gray-400 font-bold hover:text-red-500 transition-colors py-2"
        >
          Sign Out
        </button>
      </aside>

      {/* 🚀 MAIN CONTENT */}
      <main className="flex-1 p-12 overflow-y-auto">
        <header className="mb-10 flex justify-between items-end">
          <div>
            <h1 className="text-4xl font-black text-gray-900 tracking-tight">My Registrations</h1>
            <p className="text-gray-500 mt-1 font-medium italic">Welcome back! Here is the status of your applications.</p>
          </div>
          <div className="text-right hidden md:block">
            <p className="text-xs font-bold text-gray-400 uppercase">Current Term</p>
            <p className="font-bold text-gray-800">Academic Year 2026</p>
          </div>
        </header>

        <div className="grid gap-6">
          {regs.map((r) => {
            const expired = r.expires_at && new Date(r.expires_at) < new Date();
            
            return (
              <div key={r.id} className="bg-white rounded-3xl p-6 shadow-sm border border-gray-100 flex items-center space-x-8 hover:shadow-xl hover:translate-y-[-2px] transition-all duration-300">
                {/* Student Avatar */}
                <div className="w-24 h-24 rounded-2xl overflow-hidden bg-gray-50 border-2 border-gray-50 flex-shrink-0 shadow-inner">
                  {r.students?.student_photo_url ? (
                    <img src={r.students.student_photo_url} className="w-full h-full object-cover" alt="Student" />
                  ) : (
                    <div className="flex items-center justify-center h-full text-[10px] font-bold text-gray-300 uppercase tracking-tighter">No Photo</div>
                  )}
                </div>

                {/* Details Grid */}
                <div className="flex-grow grid grid-cols-2 lg:grid-cols-4 gap-6">
                  <div className="space-y-1">
                    <p className="text-[10px] text-gray-400 font-black uppercase tracking-widest">Student</p>
                    <p className="font-bold text-gray-900 text-lg">{r.students?.first_name} {r.students?.last_name}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-[10px] text-gray-400 font-black uppercase tracking-widest">Placement</p>
                    <p className="text-gray-700 font-semibold">{r.branches?.name} <span className="text-gray-300 mx-1">/</span> {r.grades?.name}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-[10px] text-gray-400 font-black uppercase tracking-widest">Stream</p>
                    <p className="text-gray-600 font-medium bg-gray-50 inline-block px-2 py-0.5 rounded-md">{r.streams?.name || "Standard"}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-[10px] text-gray-400 font-black uppercase tracking-widest">Application Status</p>
                    <div className="flex items-center space-x-1.5">
                      <div className={`w-2 h-2 rounded-full ${
                        r.status === 'approved' ? 'bg-blue-500' : 
                        r.status === 'enrolled' ? 'bg-green-500' : 
                        r.status === 'rejected' ? 'bg-red-500' : 'bg-orange-400'
                      }`} />
                      <span className={`text-sm font-black capitalize tracking-tight ${
                        r.status === 'approved' ? 'text-blue-600' : 
                        r.status === 'enrolled' ? 'text-green-600' : 
                        r.status === 'rejected' ? 'text-red-600' : 'text-orange-600'
                      }`}>
                        {expired && r.status === "approved" ? "Expired" : r.status}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Contextual Actions */}
                <div className="flex items-center space-x-3">
                  {r.status === "approved" && !expired && (
                    <button className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-black px-6 py-3 rounded-xl shadow-lg shadow-blue-100 transition-all active:scale-95">
                      Pay Fees
                    </button>
                  )}
                  
                  {(r.status === "pending" || r.status === "rejected") && (
                    <button
                      onClick={() => deleteStudent(r.student_id)}
                      disabled={loadingId === r.student_id}
                      className="group flex items-center justify-center w-10 h-10 rounded-xl hover:bg-red-50 transition-colors"
                      title="Delete Application"
                    >
                      {loadingId === r.student_id ? (
                        <div className="w-4 h-4 border-2 border-red-500 border-t-transparent rounded-full animate-spin"></div>
                      ) : (
                        <span className="text-red-300 group-hover:text-red-600 font-bold text-xl">×</span>
                      )}
                    </button>
                  )}

                  {r.status === "enrolled" && (
                    <div className="bg-green-50 p-2 rounded-xl">
                      <svg className="w-6 h-6 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {/* Empty State */}
          {regs.length === 0 && (
            <div className="text-center py-24 bg-white rounded-[3rem] border-4 border-dashed border-gray-100 flex flex-col items-center">
              <div className="w-20 h-20 bg-gray-50 rounded-full flex items-center justify-center mb-4 text-3xl">📝</div>
              <h3 className="text-xl font-bold text-gray-800">No students registered yet</h3>
              <p className="text-gray-400 max-w-xs mx-auto mt-2 font-medium">Click the button in the sidebar to begin your first application.</p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}