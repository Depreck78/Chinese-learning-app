import { errorResponse, logOut } from '@/lib/server/accounts';

export async function POST(request: Request) {
  try {
    await logOut(request);
    return Response.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
