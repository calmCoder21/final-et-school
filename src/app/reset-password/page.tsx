"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useRouter } from "next/navigation";

export default function ResetPasswordPage() {
  const router = useRouter();

  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleUpdate = async () => {
    setLoading(true);

    const { error } = await supabase.auth.updateUser({
      password,
    });

    if (error) {
      alert(error.message);
      setLoading(false);
      return;
    }

    alert("✅ Password updated successfully");
    router.push("/login");
  };

  return (
    <div className="p-10 max-w-md mx-auto space-y-4">
      <h1 className="text-xl font-bold">Set New Password</h1>

      <input
        type="password"
        placeholder="New password"
        className="border p-2 w-full"
        onChange={(e) => setPassword(e.target.value)}
      />

      <button
        onClick={handleUpdate}
        disabled={loading}
        className="bg-green-600 text-white px-4 py-2 w-full"
      >
        {loading ? "Updating..." : "Update Password"}
      </button>
    </div>
  );
}