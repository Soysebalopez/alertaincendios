// WHI-587 — auth gate for the internal dashboard.
//
// Only requests to /dashboard/* require auth; everything else is public.
// Additionally we check that the authenticated email matches a small allowlist
// (defense in depth — even if Supabase signup is open, only the owner can
// reach the dashboard).
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const ALLOWED_EMAILS = new Set(["soysebalopez@gmail.com"]);

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Public routes
  if (!pathname.startsWith("/dashboard")) {
    return NextResponse.next();
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  if (!user.email || !ALLOWED_EMAILS.has(user.email.toLowerCase())) {
    // Logged in but not in the allowlist — sign out and bounce to /login
    await supabase.auth.signOut();
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("error", "forbidden");
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  // Only run middleware on dashboard routes
  matcher: ["/dashboard/:path*"],
};
