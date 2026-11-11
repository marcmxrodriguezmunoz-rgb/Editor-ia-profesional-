import { test, expect } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
const dir = path.resolve('.data/fixtures');

test.beforeAll(() => {
  mkdirSync(dir, { recursive: true });
  execFileSync('ffmpeg', [
    '-v',
    'error',
    '-y',
    '-f',
    'lavfi',
    '-i',
    'testsrc2=size=320x480:rate=30',
    '-f',
    'lavfi',
    '-i',
    'sine=frequency=440:sample_rate=44100',
    '-t',
    '4',
    '-c:v',
    'libx264',
    '-pix_fmt',
    'yuv420p',
    '-c:a',
    'aac',
    path.join(dir, 'source.mp4'),
  ]);
  execFileSync('ffmpeg', [
    '-v',
    'error',
    '-y',
    '-i',
    path.join(dir, 'source.mp4'),
    '-c',
    'copy',
    path.join(dir, 'source.mov'),
  ]);
});

test('montaje local: instrucción del ejemplo, edición, guardado, recarga y rechazo explícito', async ({
  page,
  request,
}) => {
  const response = await request.post('/api/projects', { data: { demo: true } });
  const demo = await response.json();
  await page.goto('/');
  await page.getByLabel('Proyecto', { exact: true }).selectOption(demo.id);
  const field = page.getByLabel('Instrucción de edición');
  await field.fill('En el segundo 25, añade un contador de 24 horas y un sonido de reloj');
  await page.getByRole('button', { name: 'Aplicar ↗', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Instrucción local aplicada');
  const saved = await (await request.get(`/api/projects/${demo.id}`)).json();
  expect(
    saved.events.some(
      (e: { type: string; start: number }) => e.type === 'counter' && e.start === 750,
    ),
  ).toBeTruthy();
  await page.getByLabel('Nombre del proyecto').fill('Montaje verificado');
  await page.getByRole('button', { name: 'Guardar', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Proyecto guardado');
  await page.reload();
  await expect(page.getByLabel('Nombre del proyecto')).toHaveValue('Montaje verificado');
  await field.fill('Hazlo viral');
  await page.getByRole('button', { name: 'Aplicar ↗', exact: true }).click();
  await expect(page.getByRole('main').getByRole('alert')).toContainText('Indica el segundo');
  await page.screenshot({ path: 'test-results/editor-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole('button', { name: 'Exportar MP4' })).toBeVisible();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
  ).toBeTruthy();
  await page.screenshot({ path: 'test-results/editor-mobile.png', fullPage: true });
});

test('MP4: subir, importar palabras, cortar, añadir gráficos/audio y exportar un MP4 vertical real', async ({
  page,
  request,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Subir vídeo en bruto' })).toBeEnabled();
  await page.locator('input[type=file]').first().setInputFiles(path.join(dir, 'source.mp4'));
  await expect(page.getByRole('status')).toContainText('Vídeo listo', { timeout: 60000 });
  const id = await page.getByLabel('Proyecto', { exact: true }).inputValue();
  await page.getByRole('button', { name: 'Subtítulos', exact: true }).click();
  await page
    .locator('input[type=file]')
    .nth(1)
    .setInputFiles({
      name: 'words.json',
      mimeType: 'application/json',
      buffer: Buffer.from(
        JSON.stringify([
          { text: ' Hola', startMs: 100, endMs: 900, timestampMs: 500, confidence: null },
          { text: ' mundo', startMs: 2100, endMs: 2900, timestampMs: 2500, confidence: null },
        ]),
      ),
    });
  await expect(page.getByRole('status')).toContainText('Subtítulos importados');
  const field = page.getByLabel('Instrucción de edición');
  for (const instruction of [
    'En el segundo 0, añade un contador de 24 horas y un sonido de reloj',
    'En el segundo 0, añade zoom 1.3x',
    'En el segundo 0, texto «Prueba real»',
    'Corta del segundo 1 al 2',
  ]) {
    await field.fill(instruction);
    await page.getByRole('button', { name: 'Aplicar ↗', exact: true }).click();
    await expect(page.getByRole('status')).toContainText('Instrucción local aplicada');
  }
  await page.getByLabel('Posición de reproducción').fill('20');
  await page.screenshot({ path: 'test-results/source-preview.png', fullPage: true });
  await page.getByRole('button', { name: 'Exportar MP4' }).click();
  const download = page.getByRole('link', { name: 'Descargar MP4' });
  await expect(download).toBeVisible({ timeout: 150000 });
  const href = await download.getAttribute('href');
  const result = await request.get(href!);
  expect(result.status()).toBe(200);
  const output = path.join(dir, 'rendered.mp4');
  writeFileSync(output, await result.body());
  const info = JSON.parse(
    execFileSync(
      'ffprobe',
      ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', output],
      { encoding: 'utf8' },
    ),
  );
  const video = info.streams.find((s: { codec_type: string }) => s.codec_type === 'video');
  expect(video.width).toBe(1080);
  expect(video.height).toBe(1920);
  expect(video.codec_name).toBe('h264');
  expect(info.streams.some((s: { codec_type: string }) => s.codec_type === 'audio')).toBeTruthy();
  expect(Number(info.format.duration)).toBeGreaterThanOrEqual(2.95);
  expect(Number(info.format.duration)).toBeLessThan(3.15);
  const project = await (await request.get(`/api/projects/${id}`)).json();
  expect(project.captionOrigin).toBe('imported');
  expect(project.clips.length).toBe(2);
  expect(errors).toEqual([]);
});

test('MOV, lectura por rangos y límites de subida', async ({ request }) => {
  const response = await request.post('/api/upload', {
    headers: { 'Content-Type': 'video/quicktime', 'X-File-Name': 'source.mov' },
    data: readFileSync(path.join(dir, 'source.mov')),
  });
  expect(response.status()).toBe(201);
  const p = await response.json();
  const ranged = await request.get(`/api/media/${p.mediaId}`, { headers: { Range: 'bytes=0-99' } });
  expect(ranged.status()).toBe(206);
  expect((await ranged.body()).length).toBe(100);
  const invalid = await request.get(`/api/media/${p.mediaId}`, {
    headers: { Range: 'bytes=999999999-' },
  });
  expect(invalid.status()).toBe(416);
  expect(
    (
      await request.post('/api/upload', {
        headers: { 'Content-Type': 'text/plain' },
        data: 'no video',
      })
    ).status(),
  ).toBe(400);
  const bad = await request.post('/api/upload', {
    headers: { 'Content-Type': 'video/mp4' },
    data: 'no video',
  });
  expect(bad.status()).toBe(400);
  expect(
    (
      await request.post('/api/projects', {
        headers: { Origin: 'https://evil.example' },
        data: { demo: true },
      })
    ).status(),
  ).toBe(400);
});
