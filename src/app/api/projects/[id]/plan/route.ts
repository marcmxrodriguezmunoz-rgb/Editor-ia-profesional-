import { z } from 'zod';
import { localPlan } from '@/domain/agents';
import { getProject, saveProject, Conflict } from '@/server/store';
import { applyOperations } from '@/domain/commands';
import { OpenAIEditor } from '@/server/providers';
import { errorResponse, idSchema, jsonBody, mutationGuard } from '@/server/http';
export const runtime = 'nodejs';
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    mutationGuard(req);
    const p = getProject(idSchema.parse((await params).id));
    const body = z
      .object({
        action: z.enum(['propose', 'apply']),
        mode: z.enum(['rules', 'api']).optional(),
        revision: z.number().int(),
        operations: z.unknown().optional(),
      })
      .parse(await jsonBody(req));
    if (body.revision !== p.revision)
      throw new Conflict('La propuesta está desactualizada. Vuelve a generarla.');
    if (body.action === 'apply')
      return Response.json({
        project: saveProject(applyOperations(p, body.operations), p.revision),
      });
    return Response.json({
      plan: body.mode === 'api' ? await new OpenAIEditor().plan(p) : localPlan(p),
    });
  } catch (e) {
    return errorResponse(e);
  }
}
