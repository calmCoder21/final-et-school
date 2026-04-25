"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import ReCAPTCHA from "react-google-recaptcha";

export default function SignupPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);

  const [loading, setLoading] = useState(false);

  const handleSignup = async () => {
    setLoading(true);

    try {
      // 🚨 REQUIRE CAPTCHA
      if (!captchaToken) {
        throw new Error("Please complete CAPTCHA");
      }

      // ✅ VERIFY CAPTCHA (backend)
      const verify = await fetch("/api/verify-recaptcha", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ token: captchaToken }),
      });

      const verifyData = await verify.json();

      if (!verify.ok) {
        throw new Error(verifyData.error || "Captcha failed");
      }

      // ✅ SIGNUP
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: fullName,
          },
        },
      });

      if (error) throw error;

      if (!data.user) {
        alert("Check your email to confirm your account.");
        return;
      }

      alert("✅ Signup successful! You can now login.");

    } catch (err: any) {
      alert(err.message);
    } finally {
      setLoading(false);
    }
  };

  // 🔥 GOOGLE SIGNUP (UNCHANGED)
  const handleGoogle = async () => {
    setLoading(true);

    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: "http://localhost:3000/auth/callback",
      },
    });

    if (error) {
      alert(error.message);
      setLoading(false);
    }
  };

  return (
    <div className="p-10 max-w-md mx-auto space-y-4">
      <h1 className="text-2xl font-bold">Guardian Signup</h1>

      {/* 🔥 GOOGLE BUTTON */}
      <button
        onClick={handleGoogle}
        className="bg-red-600 text-white px-4 py-2 w-full"
      >
        Continue with Google
      </button>

      <div className="text-center text-gray-500">OR</div>

      <input
        type="text"
        placeholder="Full Name"
        className="border p-2 w-full"
        onChange={(e) => setFullName(e.target.value)}
      />

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

      {/* 🔥 CAPTCHA */}
      <ReCAPTCHA
        sitekey={process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY!}
        onChange={(token) => setCaptchaToken(token)}
      />

      <button
        onClick={handleSignup}
        disabled={loading}
        className="bg-black text-white px-4 py-2 w-full"
      >
        {loading ? "Creating..." : "Sign Up"}
      </button>
    </div>
  );
}