import { type Project, styles } from './project';
import { operationsSchema, type Operation, applyOperations } from './commands';

export const agentRoles = [
  {
    id: 'director',
    name: 'Director creativo',
    task: 'Narrativa, estilo, ritmo y apertura. No inventes lo que ocurre visualmente.',
  },
  { id: 'editor', name: 'Editor de vídeo', task: 'Cortes y zooms que apoyen el discurso.' },
  {
    id: 'motion',
    name: 'Motion graphics',
    task: 'Textos y contadores legibles dentro de zona segura.',
  },
  {
    id: 'sound',
    name: 'Diseñador de sonido',
    task: 'Efectos tick, pop o whoosh discretos; no hay biblioteca musical.',
  },
  {
    id: 'quality',
    name: 'Supervisor de calidad',
    task: 'Revisar sincronización, rangos y continuidad. Evitar saturación visual.',
  },
] as const;
export type Plan = {
  mode: 'rules' | 'api';
  notes: string[];
  operations: Operation[];
  warnings: string[];
};
export function qualityReport(p: Project): string[] {
  const warnings: string[] = [];
  if (!p.mediaId) warnings.push('Composición de demostración: aún no hay vídeo subido.');
  if (!p.captions.length) warnings.push('Sin transcripción: no se ha analizado el discurso.');
  if (p.captionOrigin === 'demo') warnings.push('Los subtítulos de muestra no proceden de audio.');
  if (p.captions.some((c) => c.endMs - c.startMs < 70))
    warnings.push('Hay palabras con menos de 70 ms de visibilidad.');
  if (p.events.filter((e) => e.type === 'sound').length > 10)
    warnings.push('Revisar la densidad de efectos de sonido.');
  const graphics = p.events.filter((e) => e.type === 'text' || e.type === 'counter');
  if (
    graphics.some((a, i) =>
      graphics
        .slice(i + 1)
        .some(
          (b) =>
            a.type === b.type && a.start < b.start + b.duration && b.start < a.start + a.duration,
        ),
    )
  )
    warnings.push('Hay gráficos del mismo tipo superpuestos. Revisa su legibilidad.');
  if (p.events.some((e) => e.type === 'text' && e.duration / 30 < e.text.length / 20))
    warnings.push('Hay textos con poco tiempo de lectura.');
  if (p.captions.some((c, i) => i > 0 && c.startMs < p.captions[i - 1].startMs))
    warnings.push('Las palabras importadas no están en orden temporal. Revisa sus marcas.');
  return warnings;
}
export function localPlan(p: Project): Plan {
  const ops: Operation[] = [];
  if (!p.events.length) {
    ops.push({
      type: 'add',
      event: {
        id: crypto.randomUUID(),
        type: 'text',
        start: 0,
        duration: Math.min(90, p.clips[0].duration),
        text: p.name,
      },
    });
  }
  return {
    mode: 'rules',
    notes: agentRoles.map(
      (a) =>
        `${a.name}: ${a.id === 'director' ? styles[p.style].description : a.id === 'editor' ? 'Conservar el montaje; sin análisis audiovisual automático.' : a.id === 'motion' ? 'Título inicial si la línea de tiempo está vacía.' : a.id === 'sound' ? 'Conservar el audio original; sin selección musical automática.' : 'Comprobar los avisos antes de exportar.'}`,
    ),
    operations: ops,
    warnings: qualityReport(p),
  };
}
export function validatePlan(p: Project, ops: unknown) {
  const parsed = operationsSchema.parse(ops);
  applyOperations(p, parsed);
  return parsed;
}
