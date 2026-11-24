import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { roleOf } from "@/lib/roles";

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (list) => {
          list.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          list.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    }
  );

  const { data } = await supabase.auth.getUser();
  const ok = roleOf(data.user) !== null;

  const path = request.nextUrl.pathname;
  if (path.startsWith("/login")) {
    if (ok) return NextResponse.redirect(new URL("/", request.url));
    return response;
  }
  if (!ok) return NextResponse.redirect(new URL("/login", request.url));
  return response;
}

export const config = {
  // Webhook kendi gizli token'ıyla doğrulanır, oturum istemez.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/whatsapp/webhook|api/cron/followup|manifest.webmanifest|sw.js|offline.html|icons/).*)"],
};
