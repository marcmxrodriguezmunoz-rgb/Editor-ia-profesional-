import { spawn } from 'node:child_process';
import path from 'node:path';
import { writeFile } from 'node:fs/promises';
import { z } from 'zod';
import { createJob, DATA, getProject, updateJob, Conflict } from '@/server/store';
import { errorResponse, idSchema, jsonBody, mutationGuard } from '@/server/http';
export const runtime = 'nodejs';
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  let jobId: string | undefined;
  try {
    mutationGuard(req);
    const p = getProject(idSchema.parse((await params).id));
    const { revision } = z.object({ revision: z.number().int() }).parse(await jsonBody(req));
    if (revision !== p.revision)
      throw new Conflict('Guarda o recarga el proyecto antes de exportar.');
    jobId = createJob(p.id);
    // Immutable snapshot: subsequent editing cannot affect this export.
    await writeFile(path.join(DATA, `${jobId}.json`), JSON.stringify(p), { flag: 'wx' });
    const child = spawn(
      process.execPath,
      ['--import', 'tsx', path.resolve('scripts/render.ts'), jobId],
      { cwd: process.cwd(), detached: true, stdio: 'ignore', env: process.env },
    );
    child.on('error', () =>
      updateJob(jobId!, { status: 'failed', error: 'No se pudo iniciar el renderizador.' }),
    );
    updateJob(jobId, { pid: child.pid ?? null });
    child.unref();
    return Response.json({ id: jobId }, { status: 202 });
  } catch (e) {
    if (jobId) updateJob(jobId, { status: 'failed', error: 'No se pudo iniciar la exportación.' });
    return errorResponse(e);
  }
}
