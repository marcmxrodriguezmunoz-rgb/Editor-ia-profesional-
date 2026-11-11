import path from 'node:path';
import { getMedia, mediaDir } from '@/server/store';
import { fileResponse } from '@/server/files';
import { errorResponse, idSchema } from '@/server/http';
export const runtime = 'nodejs';
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const media = getMedia(idSchema.parse((await params).id));
    return fileResponse(path.join(mediaDir, media.filename), req, 'video/mp4');
  } catch (e) {
    return errorResponse(e);
  }
}
