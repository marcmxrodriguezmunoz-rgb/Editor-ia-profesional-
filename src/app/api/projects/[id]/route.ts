import { getProject, getMedia, saveProject } from '@/server/store';
import { projectSchema } from '@/domain/project';
import { errorResponse, idSchema, jsonBody, mutationGuard } from '@/server/http';
export const runtime = 'nodejs';
type Context = { params: Promise<{ id: string }> };
export async function GET(_req: Request, { params }: Context) {
  try {
    return Response.json(getProject(idSchema.parse((await params).id)));
  } catch (e) {
    return errorResponse(e);
  }
}
export async function PUT(req: Request, { params }: Context) {
  try {
    mutationGuard(req);
    const id = idSchema.parse((await params).id);
    const p = projectSchema.parse(await jsonBody(req));
    if (p.id !== id) throw new Error('Identificador incompatible');
    const previous = getProject(id);
    if (p.mediaId !== previous.mediaId || p.sourceFrames !== previous.sourceFrames)
      throw new Error('No se puede sustituir la fuente mediante guardado.');
    if (p.mediaId) getMedia(p.mediaId);
    return Response.json(saveProject(p, p.revision));
  } catch (e) {
    return errorResponse(e);
  }
}
