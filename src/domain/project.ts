import { z } from 'zod';
import type { Caption as RemotionCaption } from '@remotion/captions';

export const FPS = 30;
export const MAX_FRAMES = 30 * 60 * FPS;
const frame = z.number().int().min(0).max(MAX_FRAMES);
const duration = z.number().int().min(1).max(MAX_FRAMES);
const timed = { id: z.string().uuid(), start: frame, duration };
export const eventSchema = z.discriminatedUnion('type', [
  z.object({ ...timed, type: z.literal('text'), text: z.string().trim().min(1).max(140) }),
  z.object({ ...timed, type: z.literal('counter'), hours: z.number().min(1).max(999) }),
  z.object({ ...timed, type: z.literal('zoom'), scale: z.number().min(1).max(2.5) }),
  z.object({
    ...timed,
    type: z.literal('sound'),
    asset: z.enum(['tick', 'pop', 'whoosh']),
    volume: z.number().min(0).max(1),
  }),
]);
export const captionSchema = z
  .object({
    text: z.string().min(1).max(80),
    startMs: z.number().min(0),
    endMs: z.number().positive(),
    timestampMs: z.number().nullable(),
    confidence: z.number().min(0).max(1).nullable(),
  })
  .refine((c) => c.endMs > c.startMs, 'Cada palabra debe terminar después de empezar');
export const styles = {
  educational: {
    name: 'Educativa',
    accent: '#b9f866',
    description: 'Claridad, textos legibles y énfasis puntual.',
  },
  challenge: {
    name: 'Reto de 24 horas',
    accent: '#ffbb69',
    description: 'Contadores y ritmo dinámico.',
  },
  business: {
    name: 'Emprendimiento',
    accent: '#86b9ff',
    description: 'Mensajes directos y cifras destacadas.',
  },
  cinematic: {
    name: 'Lifestyle / cine',
    accent: '#d4b5ff',
    description: 'Movimiento suave y tipografía contenida.',
  },
} as const;
export const projectSchema = z
  .object({
    version: z.literal(1),
    id: z.string().uuid(),
    name: z.string().trim().min(1).max(100),
    revision: z.number().int().nonnegative(),
    style: z.enum(['educational', 'challenge', 'business', 'cinematic']),
    mediaId: z.string().uuid().nullable(),
    sourceFrames: duration,
    clips: z
      .array(z.object({ id: z.string().uuid(), sourceStart: frame, duration }))
      .min(1)
      .max(500),
    captions: z.array(captionSchema).max(30000),
    captionOrigin: z.enum(['none', 'demo', 'imported', 'api']),
    events: z.array(eventSchema).max(500),
    preferences: z.object({ captionsEnabled: z.boolean(), sourceVolume: z.number().min(0).max(1) }),
    rules: z.array(z.string().max(300)).max(30),
  })
  .superRefine((p, ctx) => {
    const total = p.clips.reduce((s, c) => s + c.duration, 0);
    if (total > p.sourceFrames)
      ctx.addIssue({ code: 'custom', message: 'La composición excede la fuente' });
    for (const c of p.clips)
      if (c.sourceStart + c.duration > p.sourceFrames)
        ctx.addIssue({ code: 'custom', message: 'Clip fuera de la fuente' });
    for (const e of p.events)
      if (e.start + e.duration > total)
        ctx.addIssue({ code: 'custom', message: 'Elemento fuera de la composición' });
    for (const c of p.captions)
      if (c.endMs > (p.sourceFrames / FPS) * 1000 + 34)
        ctx.addIssue({ code: 'custom', message: 'Subtítulo fuera de la fuente' });
    const ids = [...p.clips, ...p.events].map((e) => e.id);
    if (new Set(ids).size !== ids.length)
      ctx.addIssue({ code: 'custom', message: 'Identificadores duplicados' });
  });
export type Project = z.infer<typeof projectSchema>;
export type TimelineEvent = z.infer<typeof eventSchema>;
export type Caption = RemotionCaption;
export const totalFrames = (p: Project) => p.clips.reduce((s, c) => s + c.duration, 0);
export function sourceFrameAt(p: Project, output: number) {
  let offset = 0;
  for (const clip of p.clips) {
    if (output < offset + clip.duration) return clip.sourceStart + Math.max(0, output - offset);
    offset += clip.duration;
  }
  return p.sourceFrames - 1;
}
export function createProject(
  name = 'Mi primer montaje',
  mediaId: string | null = null,
  sourceFrames = 30 * FPS,
): Project {
  return {
    version: 1,
    id: crypto.randomUUID(),
    name,
    revision: 0,
    style: 'educational',
    mediaId,
    sourceFrames,
    clips: [{ id: crypto.randomUUID(), sourceStart: 0, duration: sourceFrames }],
    captions: [],
    captionOrigin: 'none',
    events: [],
    preferences: { captionsEnabled: true, sourceVolume: 0.8 },
    rules: ['Mantener los textos dentro de la zona segura vertical.'],
  };
}
export function createDemo(): Project {
  const p = createProject('Un reto. Una historia.');
  p.captionOrigin = 'demo';
  p.captions = 'Cada gran historia empieza con una idea y veinticuatro horas para hacerla realidad'
    .split(' ')
    .map((text, i) => ({
      text: ' ' + text,
      startMs: 1000 + i * 500,
      endMs: 1500 + i * 500,
      timestampMs: 1250 + i * 500,
      confidence: null,
    }));
  p.events = [
    { id: crypto.randomUUID(), type: 'text', start: 0, duration: 90, text: '¿Y si empiezas hoy?' },
    { id: crypto.randomUUID(), type: 'counter', start: 90, duration: 180, hours: 24 },
    {
      id: crypto.randomUUID(),
      type: 'sound',
      start: 90,
      duration: 30,
      asset: 'tick',
      volume: 0.45,
    },
    { id: crypto.randomUUID(), type: 'zoom', start: 60, duration: 150, scale: 1.15 },
  ];
  return p;
}
