import { errorResponse, readJson, register } from '@/lib/server/accounts';

export async function POST(request: Request) {
  try {
    const body = (await readJson(request)) as { username?: unknown; password?: unknown } | null;
    return Response.json(await register(body?.username, body?.password));
  } catch (error) {
    return errorResponse(error);
  }
}
