import { errorResponse, profileFor, readJson, storedProgress, storeProgress, userFor } from '@/lib/server/accounts';
import { mergeProgress, readProgress } from '../../progress';

// The device sends its progress; the server merges it with the account's copy, keeps the
// result and sends it back, so every device converges on the newest change to each item.
export async function POST(request: Request) {
  try {
    const { userId } = await userFor(request);
    const body = (await readJson(request)) as { progress?: unknown } | null;
    const stored = await storedProgress(userId);
    const merged = mergeProgress(readProgress(stored), readProgress(body?.progress));
    await storeProgress(userId, merged);
    // The profile rides along so a new username or avatar reaches the other devices too.
    return Response.json({ progress: merged, profile: await profileFor(userId) });
  } catch (error) {
    return errorResponse(error);
  }
}
