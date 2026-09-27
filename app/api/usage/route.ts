import { errorResponse, readJson } from '@/lib/server/accounts';
import { recordUsage } from '@/lib/server/usage';

// Each install reports its daily study time and characters learned (see app/usage.ts).
export async function POST(request: Request) {
  try {
    await recordUsage(request, await readJson(request));
    return Response.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
