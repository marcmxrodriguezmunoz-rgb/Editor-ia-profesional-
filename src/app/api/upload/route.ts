import { createWriteStream } from 'node:fs';
import { unlink } from 'node:fs/promises';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import path from 'node:path';
import { createProject, projectSchema } from '@/domain/project';
import { addMedia, insertProject, mediaDir } from '@/server/store';
import { normalize, probe } from '@/server/media';
import { errorResponse, mutationGuard } from '@/server/http';
export const runtime = 'nodejs';
const MAX_UPLOAD = 250 * 1024 * 1024;
export async function POST(req: Request) {
  const id = crypto.randomUUID(),
    input = path.join(mediaDir, `${id}.input`),
    output = path.join(mediaDir, `${id}.mp4`);
  try {
    mutationGuard(req);
    if (!['video/mp4', 'video/quicktime'].includes(req.headers.get('content-type') || ''))
      throw new Error('Solo MP4 y MOV.');
    if (Number(req.headers.get('content-length')) > MAX_UPLOAD)
      throw new Error('Máximo 250 MB por vídeo.');
    if (!req.body) throw new Error('Falta el vídeo');
    let received = 0;
    const limit = new Transform({
      transform(chunk, _enc, cb) {
        received += chunk.length;
        cb(received > MAX_UPLOAD ? new Error('Máximo 250 MB por vídeo.') : null, chunk);
      },
    });
    await pipeline(
      Readable.fromWeb(req.body as never),
      limit,
      createWriteStream(input, { flags: 'wx' }),
    );
    await probe(input);
    await normalize(input, output);
    const info = await probe(output);
    const name =
      decodeURIComponent(req.headers.get('x-file-name') || 'Nuevo vídeo')
        .replace(/\.[^.]+$/, '')
        .slice(0, 100)
        .trim() || 'Nuevo vídeo';
    const project = projectSchema.parse(createProject(name, id, info.frames));
    addMedia(id, `${id}.mp4`, info.frames);
    return Response.json(insertProject(project), { status: 201 });
  } catch (e) {
    await unlink(output).catch(() => {});
    return errorResponse(e);
  } finally {
    await unlink(input).catch(() => {});
  }
}
