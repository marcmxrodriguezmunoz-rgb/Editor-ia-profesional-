import { bundle } from '@remotion/bundler';
import { renderMedia, selectComposition } from '@remotion/renderer';
import { readFile, unlink, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { DATA, exportDir, updateJob } from '../src/server/store';
import { projectSchema } from '../src/domain/project';
import { idSchema, origin } from '../src/server/http';
const id = idSchema.parse(process.argv[2]);
const snapshot = path.join(DATA, `${id}.json`);
const bundleDir = path.join(DATA, 'bundles', id);
try {
  updateJob(id, { status: 'rendering', progress: 0.01, pid: process.pid });
  const project = projectSchema.parse(JSON.parse(await readFile(snapshot, 'utf8')));
  const props = {
    project,
    mediaUrl: project.mediaId ? `${origin()}/api/media/${project.mediaId}` : null,
    assetBase: `${origin()}/assets`,
  };
  const serveUrl = await bundle({
    entryPoint: path.resolve('src/remotion/index.ts'),
    outDir: bundleDir,
    onProgress: (p) => updateJob(id, { progress: (p / 100) * 0.1 }),
  });
  const browserExecutable = process.env.CHROME_PATH || null;
  const composition = await selectComposition({
    serveUrl,
    id: 'EditorVertical',
    inputProps: props,
    browserExecutable,
  });
  await renderMedia({
    serveUrl,
    composition,
    inputProps: props,
    codec: 'h264',
    audioCodec: 'aac',
    pixelFormat: 'yuv420p',
    crf: 18,
    outputLocation: path.join(exportDir, `${id}.mp4`),
    browserExecutable,
    concurrency: 2,
    onProgress: ({ progress }) => updateJob(id, { progress: 0.1 + progress * 0.9 }),
  });
  updateJob(id, { status: 'done', progress: 1 });
} catch (e) {
  // Detailed local diagnostic, never sent to the browser; contains no API requests.
  await writeFile(path.join(DATA, `${id}.error.log`), String(e)).catch(() => {});
  updateJob(id, {
    status: 'failed',
    error:
      'No se pudo renderizar. Revisa FFmpeg, Chromium y el registro local .data/' +
      id +
      '.error.log.',
  });
  process.exitCode = 1;
} finally {
  await unlink(snapshot).catch(() => {});
  await rm(bundleDir, { recursive: true, force: true }).catch(() => {});
}
