"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useRouter } from "next/navigation";

export default function Settings() {
  const router = useRouter();

  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const init = async () => {
      const { data: { session } } = await supabase.auth.getSession();

      if (!session) {
        router.push("/login");
        return;
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", session.user.id)
        .single();

      if (profile?.role !== "admin") {
        router.push("/dashboard");
        return;
      }

      const token = sessionStorage.getItem("mfa_token");

      if (!token) {
        router.push("/admin/verify");
        return;
      }

      load();
      setLoading(false);
    };

    init();
  }, [router]);

  const load = async () => {
    const { data } = await supabase
      .from("pricing")
      .select(`
        id,
        amount,
        branches(name),
        grades(name)
      `);

    setData(data || []);
  };

  const updatePrice = async (id: string) => {
    const amountStr = prompt("Enter new price");
    if (!amountStr) return;

    const amount = Number(amountStr);

    if (isNaN(amount) || amount <= 0) {
      alert("Invalid amount");
      return;
    }

    const { data: session } = await supabase.auth.getSession();
    const mfaToken = sessionStorage.getItem("mfa_token");

    if (!mfaToken) {
      alert("Verification expired");
      router.push("/admin/verify");
      return;
    }

    const res = await fetch("/api/admin/update-settings", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.session?.access_token}`,
        "x-mfa-token": mfaToken,
      },
      body: JSON.stringify({ id, amount }),
    });

    const json = await res.json();

    if (!res.ok) {
      alert(json.error);

      if (json.error?.includes("expired")) {
        sessionStorage.removeItem("mfa_token");
        router.push("/admin/verify");
      }

      return;
    }

    alert("✅ Updated");
    load();
  };

  if (loading) return <div className="p-10">Loading...</div>;

  return (
    <div className="p-10 space-y-4">
      <h1 className="text-xl font-bold">Secure Settings</h1>

      {data.map((r) => (
        <div key={r.id} className="border p-3">
          <p>
            {r.branches?.name} - {r.grades?.name}
          </p>
          <p>Price: {r.amount}</p>

          <button
            onClick={() => updatePrice(r.id)}
            className="bg-blue-600 text-white px-2 py-1 mt-2"
          >
            Change Price
          </button>
        </div>
      ))}
    </div>
  );
}