import { z } from 'zod';
import { getProject, saveProject, Conflict } from '@/server/store';
import { OpenAITranscriber } from '@/server/providers';
import { errorResponse, idSchema, jsonBody, mutationGuard } from '@/server/http';
export const runtime = 'nodejs';
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    mutationGuard(req);
    const p = getProject(idSchema.parse((await params).id));
    const body = z.object({ revision: z.number().int() }).parse(await jsonBody(req));
    if (body.revision !== p.revision)
      throw new Conflict('Recarga el proyecto antes de transcribir.');
    const captions = await new OpenAITranscriber().transcribe(p);
    return Response.json(saveProject({ ...p, captions, captionOrigin: 'api' }, p.revision));
  } catch (e) {
    return errorResponse(e);
  }
}
