import { satelliteContent } from '@/lib/auth/satellite-backend';
import { z } from 'zod';

export async function GET(_request: Request, context: { params: Promise<{ id: string; type: string }> }) {
  const { id, type } = await context.params;
  if (!z.string().uuid().safeParse(id).success || !/^(TRUE_COLOR|NDVI|EVI|NDWI|NDMI|DATA_QUALITY)(?:_PREVIEW)?$/.test(type))
    return Response.json({ error: { message: 'Invalid satellite layer.' } }, { status: 400 });
  return satelliteContent(`/satellite-scans/${id}/layers/${type}/content`);
}
