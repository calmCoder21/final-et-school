"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useRouter } from "next/navigation";

export default function EnrollMFA() {
  const [qr, setQr] = useState("");
  const [factorId, setFactorId] = useState("");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  // 🔒 AUTH + ROLE GUARD STATES
  const [authorized, setAuthorized] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);

  // 🔐 LOCK MANUAL URL ACCESS + CHECK EXISTING FACTOR
  useEffect(() => {
    const checkAccessAndFactors = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      const user = session?.user;

      if (!user || !session) {
        router.push("/login");
        return;
      }

      // Check Admin Role
      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single();

      if (!profile || profile.role !== "admin") {
        router.push("/dashboard");
        return;
      }

      // If Admin, check existing factors (your original logic)
      const res = await supabase.auth.mfa.listFactors();
      const existing = res.data?.totp?.[0];

      if (existing) {
        setFactorId(existing.id);
        if (existing.status === "verified") {
          alert("MFA already enabled");
        }
      }

      setAuthorized(true);
      setCheckingAuth(false);
    };

    checkAccessAndFactors();
  }, [router]);

  const start = async () => {
    setLoading(true);

    try {
      let id = factorId;

      if (!id) {
        const { data, error } = await supabase.auth.mfa.enroll({
          factorType: "totp",
          issuer: "SchoolSystem",
        });

        if (error) {
          alert(error.message);
          setLoading(false);
          return;
        }

        id = data.id;
        setFactorId(id);
        setQr(data.totp.qr_code);
      } else {
        alert("Factor already exists. Just verify your code.");
      }
    } finally {
      setLoading(false);
    }
  };

  const confirm = async () => {
    if (!factorId) return alert("No factor found");

    const challenge = await supabase.auth.mfa.challenge({
      factorId,
    });

    if (!challenge.data) return alert("Challenge failed");

    const verify = await supabase.auth.mfa.verify({
      factorId,
      challengeId: challenge.data.id,
      code,
    });

    if (verify.error) {
      alert("Invalid code");
    } else {
      alert("✅ MFA successfully enabled!");
    }
  };

  // 🔒 PREVENT RENDERING IF NOT AUTH
  if (checkingAuth) {
    return <div className="p-10">Checking access...</div>;
  }

  if (!authorized) return null;

  return (
    <div className="p-10 space-y-4">
      <h1 className="text-xl font-bold">Enable MFA</h1>

      <button
        onClick={start}
        disabled={loading}
        className="bg-black text-white p-2"
      >
        {loading ? "Loading..." : "Generate QR"}
      </button>

      {qr && (
        <>
          <div dangerouslySetInnerHTML={{ __html: qr }} />

          <input
            placeholder="Enter 6-digit code"
            onChange={(e) => setCode(e.target.value)}
            className="border p-2"
          />

          <button
            onClick={confirm}
            className="bg-blue-600 text-white p-2"
          >
            Confirm
          </button>
        </>
      )}
    </div>
  );
}