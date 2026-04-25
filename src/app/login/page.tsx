"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    setLoading(true);

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) throw error;

      if (!data.user) throw new Error("Login failed");

      // 🔥 ensure session is ready
      await supabase.auth.getSession();

      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", data.user.id)
        .maybeSingle();

      if (!profile) {
        throw new Error("Profile not found");
      }

      if (profile.role === "admin") router.push("/admin");
      else if (profile.role === "finance") router.push("/finance");
      else router.push("/dashboard");

    } catch (err: any) {
      alert(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogle = async () => {
    setLoading(true);

    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: "https://final-et-school.vercel.app/auth/callback", // 🔥 MUST MATCH YOUR DOMAIN
      },
    });

    if (error) {
      alert(error.message);
      setLoading(false);
    }
  };

  return (
    <div className="p-10 max-w-md mx-auto space-y-4">
      <h1 className="text-2xl font-bold">Login</h1>

      <button
        onClick={handleGoogle}
        className="bg-red-600 text-white px-4 py-2 w-full"
      >
        Continue with Google
      </button>

      <div className="text-center text-gray-500">OR</div>

      <input
        type="email"
        placeholder="Email"
        className="border p-2 w-full"
        onChange={(e) => setEmail(e.target.value)}
      />

      <input
        type="password"
        placeholder="Password"
        className="border p-2 w-full"
        onChange={(e) => setPassword(e.target.value)}
      />

      <p
        className="text-sm text-blue-600 cursor-pointer text-right"
        onClick={() => router.push("/forgot-password")}
      >
        Forgot password?
      </p>

      <button
        onClick={handleLogin}
        disabled={loading}
        className="bg-black text-white px-4 py-2 w-full"
      >
        {loading ? "Signing in..." : "Login"}
      </button>
    </div>
  );
}
