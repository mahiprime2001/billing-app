import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import fs from 'fs';
import path from 'path';

const sessionFilePath = path.join(process.cwd(), 'app/data/logs/session.json');

const readSession = () => {
  try {
    const sessionData = fs.readFileSync(sessionFilePath, 'utf-8');
    return JSON.parse(sessionData);
  } catch (error) {
    return null;
  }
};

export function middleware(request: NextRequest) {
  const session = readSession();
  const token = request.headers.get('authorization')?.split(' ')[1];

  if (request.nextUrl.pathname.startsWith('/api/auth/login')) {
    return NextResponse.next();
  }

  if (!session || !token || session.token !== `session_${token}`) {
    return NextResponse.redirect(new URL('/api/auth/login', request.url));
  }

  const expiresAt = new Date(session.expiresAt);
  if (expiresAt < new Date()) {
    return NextResponse.redirect(new URL('/api/auth/login', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/api/:path*'],
};
