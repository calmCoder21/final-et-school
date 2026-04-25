"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);

  const handleReset = async () => {
    setLoading(true);

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: "http://localhost:3000/reset-password",
    });

    // 🔥 ALWAYS SAME MESSAGE (SECURITY)
    alert("If this email exists, a reset link has been sent.");

    if (error) {
      console.error(error.message);
    }

    setLoading(false);
  };

  return (
    <div className="p-10 max-w-md mx-auto space-y-4">
      <h1 className="text-xl font-bold">Reset Password</h1>

      <input
        type="email"
        placeholder="Enter your email"
        className="border p-2 w-full"
        onChange={(e) => setEmail(e.target.value)}
      />

      <button
        onClick={handleReset}
        disabled={loading}
        className="bg-black text-white px-4 py-2 w-full"
      >
        {loading ? "Sending..." : "Send Reset Link"}
      </button>
    </div>
  );
}