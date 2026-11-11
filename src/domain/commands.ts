import { z } from 'zod';
import { FPS, type Project, eventSchema, projectSchema, totalFrames } from './project';

export const operationSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('add'), event: eventSchema }),
  z.object({
    type: z.literal('cut'),
    start: z.number().int().nonnegative(),
    end: z.number().int().positive(),
  }),
]);
export const operationsSchema = z.array(operationSchema).min(1).max(20);
export type Operation = z.infer<typeof operationSchema>;
export function applyOperations(project: Project, input: unknown): Project {
  const operations = operationsSchema.parse(input);
  const p = structuredClone(project);
  for (const op of operations) {
    if (op.type === 'add') {
      p.events.push(op.event);
      continue;
    }
    const n = totalFrames(p);
    if (op.end <= op.start || op.end > n || op.end - op.start >= n)
      throw new Error(
        'El corte debe dejar al menos un fotograma y estar dentro de la composición.',
      );
    let offset = 0;
    p.clips = p.clips.flatMap((c) => {
      const from = offset,
        to = offset + c.duration;
      offset = to;
      if (to <= op.start || from >= op.end) return [c];
      const result = [];
      if (from < op.start)
        result.push({ ...c, id: crypto.randomUUID(), duration: op.start - from });
      if (to > op.end)
        result.push({
          ...c,
          id: crypto.randomUUID(),
          sourceStart: c.sourceStart + op.end - from,
          duration: to - op.end,
        });
      return result;
    });
    const map = (t: number) => t - Math.max(0, Math.min(t - op.start, op.end - op.start));
    p.events = p.events.flatMap((e) => {
      const start = map(e.start),
        end = map(e.start + e.duration);
      return end > start ? [{ ...e, start, duration: end - start }] : [];
    });
  }
  return projectSchema.parse(p);
}

/** Deliberately narrow offline grammar. Unsupported requests never pretend to use AI. */
export function parseLocalCommand(text: string, p: Project): Operation[] {
  const q = text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  const cut = q.match(
    /(?:corta|elimina|quita)(?:\s+desde)?\s+(?:del?\s+)?(?:segundo\s+)?(\d+(?:[.,]\d+)?)\s*(?:al?|hasta|y|-)\s*(?:el\s+)?(?:segundo\s+)?(\d+(?:[.,]\d+)?)/,
  );
  if (cut)
    return [
      {
        type: 'cut',
        start: Math.round(Number(cut[1].replace(',', '.')) * FPS),
        end: Math.round(Number(cut[2].replace(',', '.')) * FPS),
      },
    ];
  const at = q.match(/(?:segundo|en el|en)\s+(\d+(?:[.,]\d+)?)/);
  if (!at)
    throw new Error(
      'Indica el segundo. Ejemplo: «En el segundo 5, añade un contador de 24 horas y un sonido de reloj».',
    );
  const start = Math.round(Number(at[1].replace(',', '.')) * FPS);
  if (start >= totalFrames(p)) throw new Error('El segundo indicado queda fuera del vídeo.');
  const length = q.match(/durante\s+(\d+(?:[.,]\d+)?)\s*seg/);
  const duration = Math.min(
    totalFrames(p) - start,
    Math.round((length ? Number(length[1].replace(',', '.')) : 5) * FPS),
  );
  if (duration < 1) throw new Error('La duración debe ser positiva.');
  const base = () => ({ id: crypto.randomUUID(), start, duration });
  const ops: Operation[] = [];
  if (/contador/.test(q))
    ops.push({
      type: 'add',
      event: {
        ...base(),
        type: 'counter',
        hours: Number(q.match(/contador\s+(?:de\s+)?(\d+)\s*horas?/)?.[1] ?? 24),
      },
    });
  if (/zoom/.test(q))
    ops.push({
      type: 'add',
      event: {
        ...base(),
        type: 'zoom',
        scale: Number(q.match(/zoom\s+(\d+(?:[.,]\d+)?)\s*x/)?.[1]?.replace(',', '.') ?? 1.2),
      },
    });
  const title = text.match(/[«"“]([^»"”]+)[»"”]/);
  if (/texto|titulo/.test(q) && title)
    ops.push({ type: 'add', event: { ...base(), type: 'text', text: title[1] } });
  if (/sonido|reloj|tick|pop|whoosh/.test(q))
    ops.push({
      type: 'add',
      event: {
        ...base(),
        duration: Math.min(duration, FPS),
        type: 'sound',
        asset: /pop/.test(q) ? 'pop' : /whoosh/.test(q) ? 'whoosh' : 'tick',
        volume: 0.5,
      },
    });
  if (!ops.length)
    throw new Error(
      'Instrucción local no compatible. Usa contador, zoom, texto entre comillas, sonido o «Corta del segundo 2 al 4».',
    );
  return operationsSchema.parse(ops);
}
