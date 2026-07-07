import { type NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';

export async function middleware(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - api/line-webhook (LINE webhook API route, accessed by LINE servers)
     * - Image/icon extensions
     */
    '/((?!_next/static|_next/image|favicon.ico|api/line-webhook|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
