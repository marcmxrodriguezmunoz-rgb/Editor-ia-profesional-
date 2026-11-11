import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createDemo,
  createProject,
  FPS,
  projectSchema,
  sourceFrameAt,
  totalFrames,
} from '../src/domain/project';
import { applyOperations, parseLocalCommand } from '../src/domain/commands';
import { localPlan, qualityReport } from '../src/domain/agents';

test('la instrucción del segundo 25 crea contador y reloj sin salir del montaje', () => {
  const p = createDemo();
  const ops = parseLocalCommand(
    'En el segundo 25, añade un contador de 24 horas y un sonido de reloj',
    p,
  );
  assert.equal(ops.length, 2);
  const edited = applyOperations(p, ops);
  const counter = edited.events.find((e) => e.start === 25 * FPS && e.type === 'counter');
  assert.equal(counter?.duration, 150);
  assert.equal(p.events.length, 4, 'no mutar el original');
});
test('cortar un rango interior conserva el tiempo fuente y desplaza efectos', () => {
  const p = createProject('Fuente', null, 300);
  p.events = [{ id: crypto.randomUUID(), type: 'text', text: 'Después', start: 180, duration: 90 }];
  const next = applyOperations(p, [{ type: 'cut', start: 60, end: 120 }]);
  assert.equal(totalFrames(next), 240);
  assert.deepEqual(
    next.clips.map((c) => [c.sourceStart, c.duration]),
    [
      [0, 60],
      [120, 180],
    ],
  );
  assert.equal(sourceFrameAt(next, 60), 120);
  assert.equal(next.events[0].start, 120);
});
test('dos cortes secuenciales y subtítulos conservan la referencia original', () => {
  const p = createDemo();
  const next = applyOperations(p, [
    { type: 'cut', start: 60, end: 120 },
    { type: 'cut', start: 0, end: 30 },
  ]);
  assert.equal(totalFrames(next), 810);
  assert.equal(sourceFrameAt(next, 30), 120);
  assert.deepEqual(next.captions, p.captions);
});
test('un elemento eliminado por el corte desaparece y otro se acorta', () => {
  const p = createProject('Fuente', null, 300);
  p.events = [
    { id: crypto.randomUUID(), type: 'text', text: 'Fuera', start: 70, duration: 30 },
    { id: crypto.randomUUID(), type: 'zoom', start: 30, duration: 120, scale: 1.2 },
  ];
  const next = applyOperations(p, [{ type: 'cut', start: 60, end: 120 }]);
  assert.equal(next.events.length, 1);
  assert.equal(next.events[0].duration, 60);
});
test('se rechazan cortes vacíos, completos o fuera del vídeo', () => {
  for (const [start, end] of [
    [0, 0],
    [20, 10],
    [0, 300],
    [0, 400],
  ])
    assert.throws(() =>
      applyOperations(createProject('x', null, 300), [{ type: 'cut', start, end }]),
    );
});
test('la gramática admite decimales, títulos y cortes en español', () => {
  const p = createDemo();
  const zoom = applyOperations(
    p,
    parseLocalCommand('En el segundo 1,5 añade zoom 1.3x durante 2 segundos', p),
  ).events.at(-1);
  assert.equal(zoom?.start, 45);
  assert.equal(zoom?.duration, 60);
  const title = applyOperations(
    p,
    parseLocalCommand('En el segundo 1, texto «Hola mundo»', p),
  ).events.at(-1);
  assert.equal(title?.type === 'text' && title.text, 'Hola mundo');
  const cut = applyOperations(p, parseLocalCommand('Corta del segundo 2 al 4', p));
  assert.equal(totalFrames(cut), 840);
});
test('no se inventa una operación para solicitudes no admitidas', () => {
  const p = createDemo();
  assert.throws(() => parseLocalCommand('Hazlo viral', p));
  assert.throws(() => parseLocalCommand('En el segundo 31, añade contador', p));
  assert.throws(() => parseLocalCommand('En el segundo 1, añade zoom 9x', p));
});
test('la validación impide referencias remotas, eventos inválidos y subtítulos fuera de rango', () => {
  const p = createDemo();
  assert.equal(
    projectSchema.safeParse({ ...p, mediaId: 'https://example.com/video.mp4' }).success,
    false,
  );
  assert.equal(
    projectSchema.safeParse({
      ...p,
      events: [
        {
          id: crypto.randomUUID(),
          type: 'sound',
          start: 0,
          duration: 30,
          asset: 'https://evil.test',
          volume: 1,
        },
      ],
    }).success,
    false,
  );
  assert.equal(
    projectSchema.safeParse({
      ...p,
      captions: [{ text: 'x', startMs: 0, endMs: 999999, timestampMs: null, confidence: null }],
    }).success,
    false,
  );
});
test('las propuestas locales declaran sus limitaciones y pasan validación', () => {
  const p = createProject();
  const plan = localPlan(p);
  assert.equal(plan.mode, 'rules');
  assert.equal(plan.notes.length, 5);
  assert.ok(plan.warnings.length);
  assert.doesNotThrow(() => applyOperations(p, plan.operations));
  assert.ok(qualityReport(createDemo()).some((w) => w.includes('muestra')));
});

test('el supervisor avisa sobre gráficos solapados y textos demasiado breves', () => {
  const p = createProject();
  p.events = [
    {
      id: crypto.randomUUID(),
      type: 'text',
      text: 'Un texto que necesita varios segundos para leerse',
      start: 0,
      duration: 5,
    },
    { id: crypto.randomUUID(), type: 'text', text: 'Otro título', start: 1, duration: 30 },
  ];
  const warnings = qualityReport(p);
  assert.ok(warnings.some((w) => w.includes('superpuestos')));
  assert.ok(warnings.some((w) => w.includes('lectura')));
});
