import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

export async function middleware(req: NextRequest) {
  const res = NextResponse.next();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name) {
          return req.cookies.get(name)?.value;
        },
        set(name, value, options) {
          res.cookies.set({ name, value, ...options });
        },
        remove(name, options) {
          res.cookies.set({ name, value: "", ...options });
        },
      },
    }
  );

  const pathname = req.nextUrl.pathname;

  // ✅ VERY IMPORTANT: allow callback route
  if (pathname.startsWith("/auth/callback")) {
    return res;
  }

  // ✅ use session (NOT getUser)
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const user = session?.user;

  const isAdminRoute = pathname.startsWith("/admin");
  const isFinanceRoute = pathname.startsWith("/finance");
  const isDashboardRoute = pathname.startsWith("/dashboard");

  if (!user) {
    if (isAdminRoute || isFinanceRoute || isDashboardRoute) {
      return NextResponse.redirect(new URL("/login", req.url));
    }
    return res;
  }

  // 🔥 role check
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  const role = profile?.role;

  if (isAdminRoute && role !== "admin") {
    return NextResponse.redirect(new URL("/dashboard", req.url));
  }

  if (isFinanceRoute && role !== "finance") {
    return NextResponse.redirect(new URL("/dashboard", req.url));
  }

  if (isDashboardRoute && !["guardian", "admin", "finance"].includes(role)) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  return res;
}

export const config = {
  matcher: ["/admin/:path*", "/finance/:path*", "/dashboard/:path*"],
};
