import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { Database } from '../types';

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

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
          supabaseResponse = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // IMPORTANT: Do NOT remove this. This is required for Next.js Middleware to work
  // with Supabase Auth.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Route protection and redirection
  const url = request.nextUrl.clone();
  const isDashboard = url.pathname.startsWith('/dashboard');
  const isCalendar = url.pathname.startsWith('/calendar');
  const isLogin = url.pathname.startsWith('/login');

  if (!user && (isDashboard || isCalendar)) {
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }

  if (user && isLogin) {
    url.pathname = '/dashboard';
    return NextResponse.redirect(url);
  }

  if (url.pathname === '/') {
    url.pathname = user ? '/dashboard' : '/login';
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
