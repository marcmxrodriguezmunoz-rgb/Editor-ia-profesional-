import { z, ZodError } from 'zod';
import { Conflict } from './store';
export const idSchema = z.string().uuid();
export const origin = () => process.env.APP_ORIGIN || 'http://127.0.0.1:3000';
export function mutationGuard(request: Request) {
  const supplied = request.headers.get('origin');
  if (supplied && supplied !== origin()) throw new Error('Origen no permitido. Revisa APP_ORIGIN.');
  if (request.headers.get('sec-fetch-site') === 'cross-site')
    throw new Error('Solicitud externa no permitida.');
}
export async function jsonBody(request: Request) {
  const chunks: Uint8Array[] = [];
  let length = 0;
  if (!request.body) throw new Error('Falta el cuerpo de la solicitud');
  const reader = request.body.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.length;
      if (length > 4 * 1024 * 1024) throw new Error('JSON demasiado grande (máximo 4 MB)');
      chunks.push(value);
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  return JSON.parse(Buffer.concat(chunks).toString());
}
export function errorResponse(e: unknown) {
  if (e instanceof Conflict) return Response.json({ error: e.message }, { status: 409 });
  if (e instanceof ZodError)
    return Response.json(
      {
        error: e.issues
          .map((i) => i.message)
          .slice(0, 4)
          .join('; '),
      },
      { status: 400 },
    );
  return Response.json(
    { error: e instanceof Error ? e.message : 'Error inesperado' },
    { status: 400 },
  );
}
