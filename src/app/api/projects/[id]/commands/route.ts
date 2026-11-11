import { z } from 'zod';
import { applyOperations, parseLocalCommand } from '@/domain/commands';
import { getProject, saveProject, Conflict } from '@/server/store';
import { OpenAIEditor } from '@/server/providers';
import { errorResponse, idSchema, jsonBody, mutationGuard } from '@/server/http';
export const runtime = 'nodejs';
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    mutationGuard(req);
    const p = getProject(idSchema.parse((await params).id));
    const body = z
      .object({
        text: z.string().min(1).max(2000),
        revision: z.number().int(),
        mode: z.enum(['local', 'api']),
      })
      .parse(await jsonBody(req));
    if (body.revision !== p.revision)
      throw new Conflict('Recarga el proyecto: hay una versión más reciente.');
    if (body.mode === 'api')
      return Response.json({ plan: await new OpenAIEditor().plan(p, body.text) });
    const operations = parseLocalCommand(body.text, p);
    return Response.json({
      project: saveProject(applyOperations(p, operations), p.revision),
      mode: 'local',
      operations,
    });
  } catch (e) {
    return errorResponse(e);
  }
}
