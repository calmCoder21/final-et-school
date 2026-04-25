"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useRouter } from "next/navigation";

export default function AuditLogsPage() {
  const router = useRouter();

  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // 🔐 ADD THESE (same idea as admin page)
  const [authorized, setAuthorized] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);

  useEffect(() => {
    const init = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      const user = session?.user;

      if (!user || !session) {
        router.push("/login");
        return;
      }

      const { data: profile, error } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single();

      if (error || profile?.role !== "admin") {
        router.push("/dashboard");
        return;
      }

      // ✅ ONLY AFTER PASSING AUTH
      setAuthorized(true);
      setCheckingAuth(false);
    };

    init();
  }, [router]);

  // 🔥 LOAD ONLY AFTER AUTH (this was missing)
  useEffect(() => {
    if (!authorized) return;

    const loadLogs = async () => {
      const { data, error } = await supabase
        .from("audit_logs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50);

      if (error) {
        console.error("LOG FETCH ERROR:", error);
        return;
      }

      setLogs(data || []);
      setLoading(false);
    };

    loadLogs();
  }, [authorized]);

  // 🔐 BLOCK RENDER DURING AUTH CHECK
  if (checkingAuth) {
    return <div className="p-10">Checking access...</div>;
  }

  // 🔐 HARD BLOCK (same behavior as admin page)
  if (!authorized) return null;

  if (loading) {
    return <div className="p-10">Loading...</div>;
  }

  return (
    <div className="p-10 space-y-4">
      <h1 className="text-xl font-bold">Audit Logs</h1>

      {logs.length === 0 && (
        <p className="text-gray-500">No logs found</p>
      )}

      <div className="space-y-3">
        {logs.map((log) => (
          <div key={log.id} className="border p-4 rounded">

            {/* Header */}
            <div className="flex justify-between text-sm text-gray-600">
              <span>{log.user_id}</span>
              <span>
                {new Date(log.created_at).toLocaleString()}
              </span>
            </div>

            {/* Action */}
            <p className="font-semibold mt-2">
              {log.action}
            </p>

            {/* Target */}
            <p className="text-sm text-gray-500">
              Target: {log.target_id}
            </p>

            {/* Change */}
            <div className="mt-2 text-sm break-all">
              <span className="text-red-500">
                {JSON.stringify(log.old_value)}
              </span>
              {" → "}
              <span className="text-green-600">
                {JSON.stringify(log.new_value)}
              </span>
            </div>

            {/* IP */}
            <p className="text-xs text-gray-400 mt-2">
              IP: {log.ip}
            </p>

          </div>
        ))}
      </div>
    </div>
  );
}