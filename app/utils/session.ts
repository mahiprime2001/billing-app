import { cookies } from 'next/headers';
import { decrypt } from './cipher';

const SESSION_COOKIE_NAME = 'session';

export const getSession = async () => {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get(SESSION_COOKIE_NAME);
  if (!sessionCookie) {
    return null;
  }
  try {
    const sessionData = decrypt(sessionCookie.value);
    return JSON.parse(sessionData);
  } catch (error) {
    return null;
  }
};
