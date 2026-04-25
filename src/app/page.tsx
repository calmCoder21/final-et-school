"use client";

import { useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";

export default function Home() {
  useEffect(() => {
    const testConnection = async () => {
      const { data, error } = await supabase.from("branches").select("*");

      if (error) {
        console.error("Error:", error);
      } else {
        console.log("Branches:", data);
      }
    };

    testConnection();
  }, []);

  return (
    <div className="p-10">
      <h1 className="text-2xl font-bold">
        Supabase Connected ✅
      </h1>
    </div>
  );
}