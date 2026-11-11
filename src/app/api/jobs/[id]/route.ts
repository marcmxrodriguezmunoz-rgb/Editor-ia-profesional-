import path from 'node:path';
import { exportDir, getJob } from '@/server/store';
import { fileResponse } from '@/server/files';
import { errorResponse, idSchema } from '@/server/http';
export const runtime = 'nodejs';
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const id = idSchema.parse((await params).id),
      job = getJob(id);
    if (new URL(req.url).searchParams.has('download')) {
      if (job.status !== 'done') throw new Error('La exportación aún no está lista.');
      return fileResponse(
        path.join(exportDir, `${id}.mp4`),
        req,
        'video/mp4',
        'editor-ia-1080x1920.mp4',
      );
    }
    return Response.json(job, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    return errorResponse(e);
  }
}
