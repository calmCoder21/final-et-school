"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

export default function Callback() {
  const router = useRouter();

  useEffect(() => {
    const handle = async () => {
      const { data } = await supabase.auth.getSession();

      if (!data.session) {
        router.push("/login");
        return;
      }

      const user = data.session.user;

      // 🔥 check profile
      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .maybeSingle();

      if (!profile) {
        // ⚠️ fallback (in case trigger still fails)
        await supabase.from("profiles").insert({
          id: user.id,
          role: "guardian",
          full_name: user.user_metadata?.name || "Unknown",
        });

        router.push("/dashboard");
        return;
      }

      if (profile.role === "admin") {
        router.push("/admin");
      } else if (profile.role === "finance") {
        router.push("/finance");
      } else {
        router.push("/dashboard");
      }
    };

    handle();
  }, [router]);

  return <div className="p-10">Signing you in...</div>;
}