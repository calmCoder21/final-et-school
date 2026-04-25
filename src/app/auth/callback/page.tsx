"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

export default function Callback() {
  const router = useRouter();

  useEffect(() => {
    const handle = async () => {
      try {
        // 🔥 CRITICAL FIX: resolve session from URL
        const { error } =
          await supabase.auth.exchangeCodeForSession(window.location.href);

        if (error) {
          console.error("Auth error:", error.message);
          router.push("/login");
          return;
        }

        // ✅ NOW session will exist
        const { data } = await supabase.auth.getSession();

        if (!data.session) {
          router.push("/login");
          return;
        }

        const user = data.session.user;

        // 🔥 PROFILE CHECK (your original logic)
        const { data: profile } = await supabase
          .from("profiles")
          .select("role")
          .eq("id", user.id)
          .maybeSingle();

        if (!profile) {
          await supabase.from("profiles").insert({
            id: user.id,
            role: "guardian",
            full_name: user.user_metadata?.name || "Unknown",
          });

          router.push("/dashboard");
          return;
        }

        if (profile.role === "admin") router.push("/admin");
        else if (profile.role === "finance") router.push("/finance");
        else router.push("/dashboard");

      } catch (err) {
        console.error("Callback crash:", err);
        router.push("/login");
      }
    };

    handle();
  }, [router]);

  return <div className="p-10">Signing you in...</div>;
}
