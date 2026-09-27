import { errorResponse } from '@/lib/server/accounts';
import { requireAdmin, usageStats } from '@/lib/server/usage';

// Usage statistics for the owner's dashboard (app/admin). Only admin accounts may read them.
export async function GET(request: Request) {
  try {
    await requireAdmin(request);
    return Response.json(await usageStats(), { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return errorResponse(error);
  }
}
