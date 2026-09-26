import { deleteAccount, errorResponse, readJson, updateProfile } from '@/lib/server/accounts';

export async function DELETE(request: Request) {
  try {
    await deleteAccount(request);
    return Response.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const body = (await readJson(request)) as { username?: unknown; avatar?: unknown } | null;
    return Response.json(await updateProfile(request, { username: body?.username, avatar: body?.avatar }));
  } catch (error) {
    return errorResponse(error);
  }
}
