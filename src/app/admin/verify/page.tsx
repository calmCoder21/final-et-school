"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useRouter } from "next/navigation";

export default function VerifyPage() {
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  // 🔒 AUTH + ROLE GUARD STATES
  const [authorized, setAuthorized] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);

  // 🔐 LOCK MANUAL URL ACCESS
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

  const verify = async () => {
    if (code.length < 6) return;

    setLoading(true);

    try {
      // 🔥 1. Get factor
      const factors = await supabase.auth.mfa.listFactors();
      const factor = factors.data?.totp?.[0];

      if (!factor) {
        alert("MFA not setup");
        return;
      }

      // 🔥 2. Challenge
      const challenge = await supabase.auth.mfa.challenge({
        factorId: factor.id,
      });

      if (!challenge.data) {
        alert("Challenge failed");
        return;
      }

      // 🔥 3. Verify
      const res = await supabase.auth.mfa.verify({
        factorId: factor.id,
        challengeId: challenge.data.id,
        code,
      });

      if (res.error) {
        alert("Invalid code");
        return;
      }

      // 🔥 4. Get fresh session
      const { data: sessionData, error: sessionError } =
        await supabase.auth.getSession();

      if (sessionError || !sessionData.session) {
        alert("Session error. Please login again.");
        router.push("/login");
        return;
      }

      const accessToken = sessionData.session.access_token;

      // 🔥 5. CLEAR OLD TOKEN
      sessionStorage.removeItem("mfa_token");

      // 🔥 6. CREATE NEW MFA SESSION
      const createRes = await fetch("/api/admin/create-mfa-session", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      const json = await createRes.json();

      if (!createRes.ok) {
        alert(json.error || "Failed to create secure session");
        return;
      }

      // 🔥 7. STORE NEW TOKEN
      sessionStorage.setItem("mfa_token", json.token);

      // 🔥 8. GO TO SETTINGS
      router.push("/admin/settings");
    } catch (err) {
      console.error(err);
      alert("Verification failed");
    } finally {
      setLoading(false);
    }
  };

  // 🔒 PREVENT RENDERING IF NOT AUTH
  if (checkingAuth) {
    return <div className="p-10">Checking access...</div>;
  }

  if (!authorized) return null;

  return (
    <div className="p-10 space-y-4">
      <h1 className="text-xl font-bold">Verify Identity</h1>

      <input
        placeholder="6-digit code"
        maxLength={6}
        onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
        className="border p-2"
      />

      <button
        onClick={verify}
        disabled={loading}
        className="bg-green-600 text-white p-2"
      >
        {loading ? "Verifying..." : "Verify"}
      </button>
    </div>
  );
}