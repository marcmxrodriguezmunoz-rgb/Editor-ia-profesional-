import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createProject } from '../src/domain/project';

test('SQLite persiste proyectos y detecta escrituras concurrentes', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'editor-store-'));
  process.env.EDITOR_DATA_DIR = dir;
  const store = await import('../src/server/store');
  try {
    const p = store.insertProject(createProject());
    assert.equal(store.getProject(p.id).name, p.name);
    const updated = store.saveProject({ ...p, name: 'Guardado' }, 0);
    assert.equal(updated.revision, 1);
    assert.throws(() => store.saveProject({ ...p, name: 'Obsoleto' }, 0), store.Conflict);
    assert.equal(store.getProject(p.id).name, 'Guardado');
    const job = store.createJob(p.id);
    assert.equal(store.getJob(job).status, 'queued');
    assert.throws(() => store.createJob(p.id), store.Conflict);
    store.updateJob(job, { status: 'done', progress: 1 });
    assert.equal(store.getJob(job).progress, 1);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
