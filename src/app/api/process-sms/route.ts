import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sendSMS } from "@/lib/sendSMS";

export async function GET() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // 🔥 Get pending messages (limit to avoid overload)
  const { data: jobs } = await supabase
    .from("sms_queue")
    .select("*")
    .in("status", ["pending", "failed"])
    .lt("attempts", 5)
    .limit(10);

  for (const job of jobs || []) {
    try {
      await sendSMS(job.phone, job.message);

      // ✅ mark as sent
      await supabase
        .from("sms_queue")
        .update({
          status: "sent",
          attempts: job.attempts + 1,
        })
        .eq("id", job.id);

    } catch (err: any) {
      // ❌ mark as failed
      await supabase
        .from("sms_queue")
        .update({
          status: "failed",
          attempts: job.attempts + 1,
          last_error: err.message,
        })
        .eq("id", job.id);
    }
  }

  return NextResponse.json({ message: "Processed SMS queue" });
}