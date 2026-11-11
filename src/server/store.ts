import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { projectSchema, type Project } from '../domain/project';

export const DATA = path.resolve(
  /* turbopackIgnore: true */ process.env.EDITOR_DATA_DIR || '.data',
);
mkdirSync(DATA, { recursive: true });
export const mediaDir = path.join(DATA, 'media');
export const exportDir = path.join(DATA, 'exports');
mkdirSync(mediaDir, { recursive: true });
mkdirSync(exportDir, { recursive: true });
const db = new DatabaseSync(path.join(DATA, 'editor.sqlite'));
db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
CREATE TABLE IF NOT EXISTS projects(id TEXT PRIMARY KEY, document TEXT NOT NULL, revision INTEGER NOT NULL, updated TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS media(id TEXT PRIMARY KEY, filename TEXT NOT NULL, frames INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS jobs(id TEXT PRIMARY KEY, project_id TEXT NOT NULL, status TEXT NOT NULL, progress REAL NOT NULL DEFAULT 0, error TEXT, pid INTEGER, created TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE UNIQUE INDEX IF NOT EXISTS one_active_export ON jobs(project_id) WHERE status IN ('queued','rendering');`);
export class Conflict extends Error {}
export function listProjects() {
  return db
    .prepare('SELECT document FROM projects ORDER BY updated DESC, rowid DESC')
    .all()
    .map((r) => JSON.parse(r.document as string) as Project);
}
export function getProject(id: string): Project {
  const row = db.prepare('SELECT document FROM projects WHERE id=?').get(id);
  if (!row) throw new Error('Proyecto no encontrado');
  return projectSchema.parse(JSON.parse(row.document as string));
}
export function insertProject(input: Project) {
  const p = projectSchema.parse(input);
  db.prepare('INSERT INTO projects(id,document,revision) VALUES(?,?,?)').run(
    p.id,
    JSON.stringify(p),
    p.revision,
  );
  return p;
}
export function saveProject(input: Project, expected: number) {
  const p = projectSchema.parse({ ...input, revision: expected + 1 });
  const r = db
    .prepare(
      'UPDATE projects SET document=?,revision=?,updated=CURRENT_TIMESTAMP WHERE id=? AND revision=?',
    )
    .run(JSON.stringify(p), p.revision, p.id, expected);
  if (!r.changes) throw new Conflict('El proyecto cambió. Recárgalo antes de guardar.');
  return p;
}
export function addMedia(id: string, filename: string, frames: number) {
  db.prepare('INSERT INTO media VALUES(?,?,?)').run(id, filename, frames);
}
export function getMedia(id: string) {
  const row = db.prepare('SELECT * FROM media WHERE id=?').get(id);
  if (!row) throw new Error('Vídeo no encontrado');
  return row as { id: string; filename: string; frames: number };
}
export type Job = {
  id: string;
  project_id: string;
  status: 'queued' | 'rendering' | 'done' | 'failed';
  progress: number;
  error: string | null;
  pid: number | null;
};
export function getJob(id: string): Job {
  const row = db.prepare('SELECT * FROM jobs WHERE id=?').get(id) as Job | undefined;
  if (!row) throw new Error('Exportación no encontrada');
  if ((row.status === 'rendering' || row.status === 'queued') && row.pid) {
    try {
      process.kill(row.pid, 0);
    } catch {
      updateJob(id, {
        status: 'failed',
        error: 'El proceso de exportación se interrumpió. Vuelve a exportar.',
      });
      return { ...row, status: 'failed', error: 'El proceso de exportación se interrumpió.' };
    }
  }
  return row;
}
export function createJob(projectId: string) {
  const active = db
    .prepare("SELECT id FROM jobs WHERE project_id=? AND status IN ('queued','rendering')")
    .get(projectId);
  if (active) {
    const job = getJob(active.id as string);
    if (job.status === 'queued' || job.status === 'rendering')
      throw new Conflict('Ya hay una exportación activa para este proyecto.');
  }
  const id = crypto.randomUUID();
  db.prepare("INSERT INTO jobs(id,project_id,status) VALUES(?,?,'queued')").run(id, projectId);
  return id;
}
export function updateJob(
  id: string,
  patch: Partial<Pick<Job, 'status' | 'progress' | 'error' | 'pid'>>,
) {
  const entries = Object.entries(patch);
  db.prepare(`UPDATE jobs SET ${entries.map(([k]) => `${k}=?`).join(',')} WHERE id=?`).run(
    ...entries.map(([, v]) => v ?? null),
    id,
  );
}
