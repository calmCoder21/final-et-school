"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useRouter } from "next/navigation";

export default function FinancePage() {
  const router = useRouter();

  const [authorized, setAuthorized] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);

  const [payments, setPayments] = useState<any[]>([]);

  // 🔐 AUTH GUARD
  useEffect(() => {
    const checkAccess = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.push("/login");
        return;
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single();

      if (!profile || profile.role !== "finance") {
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

    loadPayments();
  }, [authorized]);

  const loadPayments = async () => {
    const { data } = await supabase
      .from("payments")
      .select(`
        id,
        amount,
        status,
        chapa_ref_id,
        paid_at,
        created_at,
        registrations(
          students(first_name, last_name),
          branches(name),
          grades(name)
        )
      `)
      .order("created_at", { ascending: false });

    setPayments(data || []);
  };

  if (checkingAuth) {
    return <div className="p-10">Checking access...</div>;
  }

  if (!authorized) return null;

  return (
    <div className="p-10">
      <h1 className="text-xl font-bold mb-5">Finance Dashboard</h1>

      <table className="w-full border">
        <thead>
          <tr className="border">
            <th className="p-2">Student</th>
            <th className="p-2">Branch</th>
            <th className="p-2">Grade</th>
            <th className="p-2">Amount</th>
            <th className="p-2">Status</th>
            <th className="p-2">Chapa Ref</th>
            <th className="p-2">Paid At</th>
          </tr>
        </thead>

        <tbody>
          {payments.map((p) => (
            <tr key={p.id} className="border text-center">
              <td className="p-2">
                {p.registrations?.students?.first_name}{" "}
                {p.registrations?.students?.last_name}
              </td>

              <td className="p-2">
                {p.registrations?.branches?.name}
              </td>

              <td className="p-2">
                {p.registrations?.grades?.name}
              </td>

              <td className="p-2">{p.amount} ETB</td>

              <td className="p-2">{p.status}</td>

              <td className="p-2">{p.chapa_ref_id}</td>

              <td className="p-2">
                {p.paid_at
                  ? new Date(p.paid_at).toLocaleString()
                  : "-"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}