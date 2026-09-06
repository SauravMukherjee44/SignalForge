import { destroySession } from '@/lib/auth';

export async function POST(request: Request) {
  return Response.json(
    { redirectTo: '/' },
    { headers: { 'Set-Cookie': await destroySession(request) } },
  );
}
