import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getSession } from './app/utils/session';

export async function middleware(request: NextRequest) {
  const session = await getSession();

  if (request.nextUrl.pathname.startsWith('/api/auth/login')) {
    return NextResponse.next();
  }

  if (!session) {
    return NextResponse.redirect(new URL('/api/auth/login', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/api/:path*'],
};
