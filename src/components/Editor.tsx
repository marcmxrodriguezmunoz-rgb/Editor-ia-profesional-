'use client';
import { useEffect, useRef, useState } from 'react';
import { Player, type PlayerRef } from '@remotion/player';
import { z } from 'zod';
import { VideoComposition } from '@/remotion/VideoComposition';
import {
  FPS,
  captionSchema,
  projectSchema,
  totalFrames,
  styles,
  type Project,
  type TimelineEvent,
} from '@/domain/project';
import { type Plan, qualityReport } from '@/domain/agents';
import { assetLibrary } from '@/domain/assets';

type Job = { id: string; status: string; progress: number; error: string | null };
async function api<T>(url: string, body?: unknown, method = 'POST'): Promise<T> {
  const response = await fetch(
    url,
    body === undefined
      ? { cache: 'no-store' }
      : { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) },
  );
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'No se pudo completar la solicitud');
  return result;
}
const time = (f: number) =>
  `${Math.floor(f / FPS / 60)
    .toString()
    .padStart(2, '0')}:${((f / FPS) % 60).toFixed(1).padStart(4, '0')}`;
const labels = { text: 'Texto', counter: 'Contador', zoom: 'Zoom', sound: 'Sonido' };
export default function Editor() {
  const [project, setProject] = useState<Project | null>(null),
    [projects, setProjects] = useState<Project[]>([]);
  const [dirty, setDirty] = useState(false),
    [busy, setBusy] = useState(''),
    [message, setMessage] = useState(''),
    [error, setError] = useState('');
  const [instruction, setInstruction] = useState(''),
    [mode, setMode] = useState<'local' | 'api'>('local');
  const [plan, setPlan] = useState<(Plan & { revision: number }) | null>(null),
    [job, setJob] = useState<Job | null>(null);
  const [frame, setFrame] = useState(0),
    [selected, setSelected] = useState(''),
    [tab, setTab] = useState<'edit' | 'captions' | 'assets'>('edit');
  const [captionPage, setCaptionPage] = useState(0),
    [history, setHistory] = useState<Project[]>([]),
    [future, setFuture] = useState<Project[]>([]);
  const player = useRef<PlayerRef>(null),
    videoInput = useRef<HTMLInputElement>(null),
    captionsInput = useRef<HTMLInputElement>(null),
    initialized = useRef(false);
  async function refresh() {
    setProjects(await api<Project[]>('/api/projects'));
  }
  function load(p: Project) {
    setProject(p);
    setDirty(false);
    setHistory([]);
    setFuture([]);
    setPlan(null);
    setJob(null);
    setFrame(0);
    setSelected('');
    setCaptionPage(0);
  }
  async function task(label: string, fn: () => Promise<void>) {
    setBusy(label);
    setError('');
    setMessage('');
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error inesperado');
    } finally {
      setBusy('');
    }
  }
  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    void task('Abriendo estudio', async () => {
      const list = await api<Project[]>('/api/projects');
      const p = list[0] || (await api<Project>('/api/projects', { demo: true }));
      load(p);
      await refresh();
    });
  }, []);
  useEffect(() => {
    const ref = player.current;
    if (!ref) return;
    const update = ({ detail }: { detail: { frame: number } }) => setFrame(detail.frame);
    ref.addEventListener('frameupdate', update);
    return () => ref.removeEventListener('frameupdate', update);
  }, [project?.id]);
  useEffect(() => {
    if (!job || !['queued', 'rendering'].includes(job.status)) return;
    const timer = setInterval(() => {
      void api<Job>(`/api/jobs/${job.id}`)
        .then(setJob)
        .catch((e) => setError(e.message));
    }, 1500);
    return () => clearInterval(timer);
  }, [job?.id, job?.status]);
  function edit(next: Project) {
    if (!project) return;
    setHistory((h) => [...h.slice(-29), project]);
    setFuture([]);
    setProject(next);
    setDirty(true);
    setPlan(null);
  }
  function undo() {
    if (!project || !history.length) return;
    const previous = history[history.length - 1];
    setFuture((f) => [project, ...f]);
    setHistory((h) => h.slice(0, -1));
    setProject({ ...previous, revision: project.revision });
    setDirty(true);
    setPlan(null);
  }
  function redo() {
    if (!project || !future.length) return;
    setHistory((h) => [...h, project]);
    setProject({ ...future[0], revision: project.revision });
    setFuture((f) => f.slice(1));
    setDirty(true);
    setPlan(null);
  }
  async function persist(): Promise<Project> {
    if (!project) throw new Error('No hay proyecto');
    const p = projectSchema.parse(project);
    if (!dirty) return p;
    const saved = await api<Project>(`/api/projects/${p.id}`, p, 'PUT');
    setProject(saved);
    setDirty(false);
    await refresh();
    return saved;
  }
  async function upload(file: File) {
    await task('Subiendo y preparando vídeo con FFmpeg…', async () => {
      if (file.size > 250 * 1024 * 1024) throw new Error('Máximo 250 MB.');
      const ext = file.name.toLowerCase().split('.').pop();
      if (!['mov', 'mp4'].includes(ext || '')) throw new Error('Selecciona un MP4 o MOV.');
      if (dirty) await persist();
      const response = await fetch('/api/upload', {
        method: 'POST',
        headers: {
          'Content-Type': ext === 'mov' ? 'video/quicktime' : 'video/mp4',
          'X-File-Name': encodeURIComponent(file.name),
        },
        body: file,
      });
      const p = await response.json();
      if (!response.ok) throw new Error(p.error);
      load(p);
      await refresh();
      setMessage('Vídeo listo. Puedes editarlo o generar la transcripción.');
    });
  }
  function add(type: TimelineEvent['type'], asset: 'tick' | 'pop' | 'whoosh' = 'tick') {
    if (!project) return;
    const start = Math.min(frame, totalFrames(project) - 1),
      duration = Math.min(type === 'sound' ? FPS : 5 * FPS, totalFrames(project) - start),
      base = { id: crypto.randomUUID(), start, duration };
    const event: TimelineEvent =
      type === 'text'
        ? { ...base, type, text: 'Tu próxima gran idea' }
        : type === 'counter'
          ? { ...base, type, hours: 24 }
          : type === 'zoom'
            ? { ...base, type, scale: 1.2 }
            : { ...base, type, asset, volume: 0.5 };
    edit({ ...project, events: [...project.events, event] });
    setSelected(event.id);
    setTab('edit');
  }
  function patchEvent(patch: Partial<TimelineEvent>) {
    if (project)
      edit({
        ...project,
        events: project.events.map((e) =>
          e.id === selected ? ({ ...e, ...patch } as TimelineEvent) : e,
        ),
      });
  }
  async function command() {
    await task('Interpretando instrucción…', async () => {
      const p = await persist();
      const result = await api<{ project?: Project; plan?: Plan }>(
        `/api/projects/${p.id}/commands`,
        { text: instruction, revision: p.revision, mode },
      );
      if (result.project) {
        setHistory((h) => [...h, p]);
        setFuture([]);
        setProject(result.project);
        setDirty(false);
        setPlan(null);
        await refresh();
        setMessage('Instrucción local aplicada. Revisa la vista previa.');
      }
      if (result.plan) setPlan({ ...result.plan, revision: p.revision });
    });
  }
  const lastValid = useRef<Project | null>(null);
  const parsed = projectSchema.safeParse(project);
  if (parsed.success) lastValid.current = parsed.data;
  const preview = parsed.success ? parsed.data : lastValid.current;
  const n = preview ? totalFrames(preview) : 1;
  const event = project?.events.find((e) => e.id === selected);
  const warnings = project ? qualityReport(project) : [];
  return (
    <div className="studio">
      <header className="topbar">
        <a className="brand" href="/" aria-label="Editor IA Profesional">
          <span className="brand-mark">
            e<span>✦</span>
          </span>
          <span>
            EDITOR <b>IA</b>
            <small>PROFESIONAL</small>
          </span>
        </a>
        <div className="project-heading">
          <span className="live-dot" /> <strong>{project?.name || 'Tu estudio creativo'}</strong>
          <span className="badge">V0.1 LOCAL</span>
        </div>
        <div className="top-actions">
          <span className="save-state">{dirty ? '● Cambios sin guardar' : '✓ Guardado'}</span>
          <button
            disabled={!project || !!busy || !dirty}
            onClick={() =>
              void task('Guardando', async () => {
                await persist();
                setMessage('Proyecto guardado.');
              })
            }
          >
            Guardar
          </button>
          <button
            className="primary"
            disabled={!project || !!busy || job?.status === 'rendering' || job?.status === 'queued'}
            onClick={() =>
              void task('Iniciando exportación', async () => {
                const p = await persist();
                const result = await api<{ id: string }>(`/api/projects/${p.id}/export`, {
                  revision: p.revision,
                });
                setJob({ id: result.id, status: 'queued', progress: 0, error: null });
              })
            }
          >
            ↗ Exportar MP4
          </button>
        </div>
      </header>
      <div className="workspace">
        <aside className="sidebar">
          <div className="section-kicker">TU ESPACIO DE TRABAJO</div>
          <h1>De idea a historia.</h1>
          <p className="muted">
            Tú tienes la visión.
            <br />
            Dale forma en la línea de tiempo.
          </p>
          <button className="upload" disabled={!!busy} onClick={() => videoInput.current?.click()}>
            <span>＋</span>
            <strong>Subir vídeo en bruto</strong>
            <small>MP4 o MOV · Hasta 250 MB</small>
          </button>
          <input
            ref={videoInput}
            hidden
            type="file"
            accept=".mp4,.mov,video/mp4,video/quicktime"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void upload(f);
              e.target.value = '';
            }}
          />
          <label className="field">
            Proyecto
            <select
              aria-label="Proyecto"
              disabled={!!busy || dirty}
              value={project?.id || ''}
              onChange={(e) =>
                void task('Cargando', async () =>
                  load(await api<Project>(`/api/projects/${e.target.value}`)),
                )
              }
            >
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <button
            className="text-button"
            disabled={!!busy}
            onClick={() =>
              void task('Creando demo', async () => {
                if (dirty) await persist();
                load(await api<Project>('/api/projects', { demo: true }));
                await refresh();
              })
            }
          >
            ＋ Nueva demostración
          </button>
          <div className="divider" />
          <div className="section-kicker">DIRECCIÓN CREATIVA</div>
          <fieldset disabled={!project || !!busy}>
            <label className="field">
              Perfil de edición
              <select
                aria-label="Perfil de edición"
                value={project?.style || 'educational'}
                onChange={(e) =>
                  project && edit({ ...project, style: e.target.value as Project['style'] })
                }
              >
                {Object.entries(styles).map(([id, s]) => (
                  <option key={id} value={id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
            <p className="hint">{project && styles[project.style].description}</p>
            <button
              className="wide"
              onClick={() =>
                void task('Preparando propuesta', async () => {
                  const p = await persist();
                  const r = await api<{ plan: Plan }>(`/api/projects/${p.id}/plan`, {
                    action: 'propose',
                    mode: mode === 'api' ? 'api' : 'rules',
                    revision: p.revision,
                  });
                  setPlan({ ...r.plan, revision: p.revision });
                })
              }
            >
              ✦ Proponer montaje
            </button>
          </fieldset>
          <div className="sidebar-footer">
            <span className="live-dot" /> Almacenamiento local
            <small>
              Tu vídeo permanece en este equipo.
              <br />
              Solo se envía audio o texto si usas la API.
            </small>
          </div>
        </aside>
        <main className="main">
          <div className="preview-heading">
            <div>
              <span className="section-kicker">MONTAJE</span>
              <h2>
                Tu historia, en movimiento<span>✦</span>
              </h2>
            </div>
            <span className="format">
              9:16 <i /> 1080 × 1920 <i /> 30 FPS
            </span>
          </div>
          {(busy || error || message) && (
            <div role={error ? 'alert' : 'status'} className={`notice ${error ? 'error' : ''}`}>
              {busy || error || message}
            </div>
          )}
          {project && !parsed.success && (
            <div className="notice error" role="alert">
              Ajuste pendiente de corregir: {parsed.error.issues[0]?.message}. La vista previa
              conserva la última versión válida.
            </div>
          )}
          <div className="preview-stage">
            <div className="stage-label">
              <span className="live-dot" /> VISTA PREVIA EN VIVO
              <small>{project?.mediaId ? 'VÍDEO FUENTE' : 'COMPOSICIÓN DE DEMOSTRACIÓN'}</small>
            </div>
            {preview && (
              <Player
                key={preview.id}
                ref={player}
                component={VideoComposition}
                inputProps={{
                  project: preview,
                  mediaUrl: preview.mediaId ? `/api/media/${preview.mediaId}` : null,
                  assetBase: '/assets',
                }}
                durationInFrames={n}
                fps={FPS}
                compositionWidth={1080}
                compositionHeight={1920}
                controls
                style={{
                  height: 460,
                  maxWidth: '100%',
                  aspectRatio: '9 / 16',
                  borderRadius: 12,
                  overflow: 'hidden',
                  boxShadow: '0 20px 90px #0007',
                }}
              />
            )}
            <div className="stage-note">
              <span>
                HECHO PARA CAPTAR
                <br />
                LA ATENCIÓN.
              </span>
              <p>Vídeo · Motion · Sonido</p>
              <small>Vista previa con Remotion</small>
            </div>
          </div>
          <section className="timeline">
            <div className="timeline-toolbar">
              <div>
                <strong>Línea de tiempo</strong>
                <span className="timecode">
                  {time(frame)} <span>/ {time(n)}</span>
                </span>
              </div>
              <div>
                <button
                  title="Deshacer"
                  aria-label="Deshacer"
                  disabled={!!busy || !history.length}
                  onClick={undo}
                >
                  ↶
                </button>
                <button
                  title="Rehacer"
                  aria-label="Rehacer"
                  disabled={!!busy || !future.length}
                  onClick={redo}
                >
                  ↷
                </button>
                <span className="badge">{project?.clips.length || 0} CLIPS</span>
              </div>
            </div>
            <input
              className="scrubber"
              aria-label="Posición de reproducción"
              type="range"
              min={0}
              max={Math.max(0, n - 1)}
              value={Math.min(frame, n - 1)}
              onChange={(e) => {
                setFrame(Number(e.target.value));
                player.current?.seekTo(Number(e.target.value));
              }}
            />
            <div className="ruler">
              <span>00:00</span>
              <span>{time(n / 4)}</span>
              <span>{time(n / 2)}</span>
              <span>{time(n * 0.75)}</span>
              <span>{time(n)}</span>
            </div>
            <div className="track">
              <span className="track-name">▣ Vídeo</span>
              <div className="track-content">
                {project?.clips.map((c, i) => (
                  <button
                    key={c.id}
                    className={`clip ${selected === c.id ? 'chosen' : ''}`}
                    style={{ width: `${(c.duration / n) * 100}%` }}
                    onClick={() => {
                      setSelected(c.id);
                      setTab('edit');
                    }}
                    title={`Clip ${i + 1}: ${time(c.duration)}`}
                  >
                    {i + 1} · {time(c.duration)}
                  </button>
                ))}
              </div>
            </div>
            {(['text', 'counter', 'zoom', 'sound'] as const).map((type) => (
              <div className="track" key={type}>
                <span className="track-name">
                  {type === 'sound' ? '♫' : '◈'} {labels[type]}
                </span>
                <div className={`track-content overlay-track ${type}`}>
                  {project?.events
                    .filter((e) => e.type === type)
                    .map((e) => (
                      <button
                        key={e.id}
                        title={`${labels[e.type]} · ${time(e.start)}`}
                        style={{
                          left: `${(e.start / n) * 100}%`,
                          width: `${(e.duration / n) * 100}%`,
                        }}
                        className={selected === e.id ? 'chosen' : ''}
                        onClick={() => {
                          setSelected(e.id);
                          player.current?.seekTo(e.start);
                          setTab('edit');
                        }}
                      >
                        {e.type === 'text'
                          ? e.text
                          : e.type === 'sound'
                            ? e.asset
                            : e.type === 'counter'
                              ? `${e.hours}h`
                              : `${e.scale}×`}
                      </button>
                    ))}
                </div>
              </div>
            ))}
            <div className="timeline-bottom">
              <span>Selecciona un clip o elemento para editarlo</span>
              <span>Los tiempos de efectos se refieren al montaje final.</span>
            </div>
          </section>
        </main>
        <aside className="inspector">
          <div className="tabs">
            {(['edit', 'captions', 'assets'] as const).map((t) => (
              <button key={t} className={tab === t ? 'active' : ''} onClick={() => setTab(t)}>
                {t === 'edit' ? 'Editar' : t === 'captions' ? 'Subtítulos' : 'Recursos'}
              </button>
            ))}
          </div>
          <fieldset disabled={!project || !!busy}>
            {tab === 'edit' && (
              <>
                <div className="section-kicker">COMPÓN A TU MANERA</div>
                <h3>Cada detalle cuenta.</h3>
                <div className="add-grid">
                  <button onClick={() => add('text')}>
                    Tt <span>Texto</span>
                  </button>
                  <button onClick={() => add('counter')}>
                    ◴ <span>Contador</span>
                  </button>
                  <button onClick={() => add('zoom')}>
                    ⌕ <span>Zoom</span>
                  </button>
                  <button onClick={() => add('sound')}>
                    ♫ <span>Sonido</span>
                  </button>
                </div>
                <p className="hint">Se añade en la posición de reproducción.</p>
                {project && (
                  <label className="field">
                    Nombre del proyecto
                    <input
                      aria-label="Nombre del proyecto"
                      value={project.name}
                      maxLength={100}
                      onChange={(e) => edit({ ...project, name: e.target.value })}
                    />
                  </label>
                )}
                {event && (
                  <div className="selection">
                    <h4>{labels[event.type]} seleccionado</h4>
                    <label className="field">
                      Inicio (segundos)
                      <input
                        aria-label="Inicio del elemento"
                        type="number"
                        min={0}
                        step={1 / FPS}
                        value={event.start / FPS}
                        onChange={(e) =>
                          patchEvent({ start: Math.round(Number(e.target.value) * FPS) })
                        }
                      />
                    </label>
                    <label className="field">
                      Duración (segundos)
                      <input
                        aria-label="Duración del elemento"
                        type="number"
                        min={1 / FPS}
                        step={1 / FPS}
                        value={event.duration / FPS}
                        onChange={(e) =>
                          patchEvent({ duration: Math.round(Number(e.target.value) * FPS) })
                        }
                      />
                    </label>
                    {event.type === 'text' && (
                      <label className="field">
                        Texto
                        <input
                          aria-label="Texto del elemento"
                          maxLength={140}
                          value={event.text}
                          onChange={(e) => patchEvent({ text: e.target.value })}
                        />
                      </label>
                    )}
                    {event.type === 'counter' && (
                      <label className="field">
                        Horas iniciales
                        <input
                          type="number"
                          min={1}
                          max={999}
                          value={event.hours}
                          onChange={(e) => patchEvent({ hours: Number(e.target.value) })}
                        />
                      </label>
                    )}
                    {event.type === 'zoom' && (
                      <label className="field">
                        Escala (1–2,5)
                        <input
                          type="number"
                          min={1}
                          max={2.5}
                          step={0.05}
                          value={event.scale}
                          onChange={(e) => patchEvent({ scale: Number(e.target.value) })}
                        />
                      </label>
                    )}
                    {event.type === 'sound' && (
                      <>
                        <label className="field">
                          Efecto
                          <select
                            value={event.asset}
                            onChange={(e) => patchEvent({ asset: e.target.value as 'tick' })}
                          >
                            <option value="tick">Reloj</option>
                            <option value="pop">Pop</option>
                            <option value="whoosh">Whoosh</option>
                          </select>
                        </label>
                        <label className="field">
                          Volumen
                          <input
                            type="range"
                            min={0}
                            max={1}
                            step={0.05}
                            value={event.volume}
                            onChange={(e) => patchEvent({ volume: Number(e.target.value) })}
                          />
                        </label>
                      </>
                    )}
                    <button
                      className="danger"
                      onClick={() => {
                        edit({
                          ...project!,
                          events: project!.events.filter((e) => e.id !== selected),
                        });
                        setSelected('');
                      }}
                    >
                      Eliminar elemento
                    </button>
                  </div>
                )}
                {project?.clips
                  .filter((c) => c.id === selected)
                  .map((c) => (
                    <div className="selection" key={c.id}>
                      <h4>Recortar clip fuente</h4>
                      <label className="field">
                        Entrada en la fuente (s)
                        <input
                          type="number"
                          min={0}
                          step={1 / FPS}
                          value={c.sourceStart / FPS}
                          onChange={(e) =>
                            edit({
                              ...project,
                              clips: project.clips.map((x) =>
                                x.id === c.id
                                  ? { ...x, sourceStart: Math.round(Number(e.target.value) * FPS) }
                                  : x,
                              ),
                            })
                          }
                        />
                      </label>
                      <label className="field">
                        Duración (s)
                        <input
                          type="number"
                          min={1 / FPS}
                          step={1 / FPS}
                          value={c.duration / FPS}
                          onChange={(e) =>
                            edit({
                              ...project,
                              clips: project.clips.map((x) =>
                                x.id === c.id
                                  ? { ...x, duration: Math.round(Number(e.target.value) * FPS) }
                                  : x,
                              ),
                            })
                          }
                        />
                      </label>
                      <p className="hint">
                        Los subtítulos siguen a la fuente. Ajusta los efectos de salida si reduces
                        la duración.
                      </p>
                    </div>
                  ))}
                {project && (
                  <>
                    <label className="field">
                      Audio original
                      <input
                        aria-label="Volumen original"
                        type="range"
                        min={0}
                        max={1}
                        step={0.05}
                        value={project.preferences.sourceVolume}
                        onChange={(e) =>
                          edit({
                            ...project,
                            preferences: {
                              ...project.preferences,
                              sourceVolume: Number(e.target.value),
                            },
                          })
                        }
                      />
                    </label>
                    <label className="field">
                      Reglas de edición (una por línea)
                      <textarea
                        value={project.rules.join('\n')}
                        onChange={(e) =>
                          edit({ ...project, rules: e.target.value.split('\n').slice(0, 30) })
                        }
                      />
                    </label>
                  </>
                )}
              </>
            )}
            {tab === 'captions' && project && (
              <>
                <div className="section-kicker">PALABRA A PALABRA</div>
                <h3>Haz que se entienda.</h3>
                <p className="hint">
                  Marcas de tiempo relativas al vídeo fuente. Origen: <b>{project.captionOrigin}</b>
                  .
                </p>
                <label className="check">
                  <input
                    type="checkbox"
                    checked={project.preferences.captionsEnabled}
                    onChange={(e) =>
                      edit({
                        ...project,
                        preferences: { ...project.preferences, captionsEnabled: e.target.checked },
                      })
                    }
                  />{' '}
                  Mostrar subtítulos
                </label>
                <button
                  className="wide"
                  disabled={!project.mediaId}
                  onClick={() =>
                    void task('Transcribiendo audio mediante API…', async () => {
                      const p = await persist();
                      const saved = await api<Project>(`/api/projects/${p.id}/transcribe`, {
                        revision: p.revision,
                      });
                      setHistory((h) => [...h, p]);
                      setFuture([]);
                      setProject(saved);
                      setDirty(false);
                      setPlan(null);
                      await refresh();
                      setMessage(
                        'Transcripción por palabra generada. Revisa las marcas de tiempo.',
                      );
                    })
                  }
                >
                  ✦ Transcribir mediante API
                </button>
                <p className="hint">Envía el audio a OpenAI. Requiere clave y puede tener coste.</p>
                <button className="wide" onClick={() => captionsInput.current?.click()}>
                  Importar palabras JSON
                </button>
                <input
                  ref={captionsInput}
                  hidden
                  type="file"
                  accept=".json,application/json"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f)
                      void task('Importando', async () => {
                        if (f.size > 4 * 1024 * 1024) throw new Error('Máximo 4 MB');
                        const captions = z.array(captionSchema).parse(JSON.parse(await f.text()));
                        edit(
                          projectSchema.parse({ ...project, captions, captionOrigin: 'imported' }),
                        );
                        setMessage('Subtítulos importados. Guarda para persistir.');
                      });
                    e.target.value = '';
                  }}
                />
                <p className="hint">
                  {project.captions.length} palabras · JSON compatible con Remotion Caption.
                </p>
                {project.captions.slice(captionPage * 20, captionPage * 20 + 20).map((c, i) => {
                  const index = captionPage * 20 + i;
                  return (
                    <div className="caption-row" key={index}>
                      <input
                        aria-label={`Palabra ${index + 1}`}
                        value={c.text}
                        onChange={(e) =>
                          edit({
                            ...project,
                            captions: project.captions.map((w, j) =>
                              j === index ? { ...w, text: e.target.value } : w,
                            ),
                          })
                        }
                      />
                      <div>
                        {(['startMs', 'endMs'] as const).map((k) => (
                          <input
                            key={k}
                            aria-label={`${k} palabra ${index + 1}`}
                            type="number"
                            step={0.01}
                            min={0}
                            value={c[k] / 1000}
                            onChange={(e) =>
                              edit({
                                ...project,
                                captions: project.captions.map((w, j) =>
                                  j === index ? { ...w, [k]: Number(e.target.value) * 1000 } : w,
                                ),
                              })
                            }
                          />
                        ))}
                      </div>
                    </div>
                  );
                })}
                <div className="pagination">
                  <button disabled={captionPage === 0} onClick={() => setCaptionPage((p) => p - 1)}>
                    ←
                  </button>
                  <span>Página {captionPage + 1}</span>
                  <button
                    disabled={(captionPage + 1) * 20 >= project.captions.length}
                    onClick={() => setCaptionPage((p) => p + 1)}
                  >
                    →
                  </button>
                </div>
              </>
            )}
            {tab === 'assets' && (
              <>
                <div className="section-kicker">BIBLIOTECA LOCAL</div>
                <h3>Un poco de magia.</h3>
                <p className="hint">
                  Recursos originales. Sonidos CC0; animaciones generadas con código.
                </p>
                {assetLibrary.map((a) => (
                  <div className="asset-card" key={a.id}>
                    <strong>{a.name}</strong>
                    <small>
                      {a.kind} · {a.license}
                    </small>
                    {a.kind === 'sound' && <audio controls preload="none" src={a.path!} />}
                    <button
                      onClick={() =>
                        add(
                          a.kind === 'sound'
                            ? 'sound'
                            : a.id === 'title'
                              ? 'text'
                              : a.id === 'counter'
                                ? 'counter'
                                : 'zoom',
                          a.kind === 'sound' ? a.id : 'tick',
                        )
                      }
                    >
                      ＋ Añadir
                    </button>
                  </div>
                ))}
              </>
            )}
          </fieldset>
          {warnings.length > 0 && (
            <details className="quality">
              <summary>◉ Revisión · {warnings.length} avisos</summary>
              {warnings.map((w) => (
                <p key={w}>{w}</p>
              ))}
            </details>
          )}
          {project?.mediaId && (
            <details className="quality">
              <summary>Vídeo original</summary>
              <video
                controls
                preload="metadata"
                src={`/api/media/${project.mediaId}`}
                style={{ width: '100%' }}
              />
            </details>
          )}
        </aside>
      </div>
      <section className="assistant">
        <div className="assistant-title">
          <span>✦</span>
          <div>
            <strong>Tu asistente de montaje</strong>
            <small>
              {mode === 'local'
                ? 'Intérprete local · reglas explícitas'
                : 'API · propuestas para revisar'}
            </small>
          </div>
        </div>
        <div className="command-box">
          <input
            aria-label="Instrucción de edición"
            placeholder="En el segundo 25, añade un contador de 24 horas y un sonido de reloj"
            value={instruction}
            disabled={!!busy || !project}
            onChange={(e) => setInstruction(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && instruction.trim() && !busy) void command();
            }}
          />
          <button
            className="primary"
            disabled={!!busy || !instruction.trim() || !project}
            onClick={() => void command()}
          >
            {mode === 'api' ? 'Proponer ↗' : 'Aplicar ↗'}
          </button>
        </div>
        <select
          aria-label="Motor de instrucciones"
          value={mode}
          onChange={(e) => setMode(e.target.value as 'local' | 'api')}
        >
          <option value="local">Modo local</option>
          <option value="api">OpenAI API</option>
        </select>
        <p className="command-help">
          Prueba: «Corta del segundo 2 al 4» · «En el segundo 5, añade zoom 1.3x» · «En el segundo
          1, texto “Hola”»
        </p>
      </section>
      {plan && (
        <section className="plan">
          <div>
            <span className="section-kicker">
              PROPUESTA {plan.mode === 'api' ? 'DE API' : 'POR REGLAS LOCALES'}
            </span>
            <h3>Revisa antes de aplicar</h3>
          </div>
          {plan.notes.map((note, i) => (
            <p key={i}>{note}</p>
          ))}
          {plan.warnings.map((w, i) => (
            <p className="hint" key={i}>
              {w}
            </p>
          ))}
          <pre>{JSON.stringify(plan.operations, null, 2)}</pre>
          <button
            className="primary"
            disabled={!!busy || !plan.operations.length}
            onClick={() =>
              void task('Aplicando propuesta', async () => {
                if (!project) return;
                const r = await api<{ project: Project }>(`/api/projects/${project.id}/plan`, {
                  action: 'apply',
                  revision: plan.revision,
                  operations: plan.operations,
                });
                setHistory((h) => [...h, project]);
                setFuture([]);
                setProject(r.project);
                setDirty(false);
                setPlan(null);
                await refresh();
                setMessage('Propuesta aplicada. Revisa el resultado.');
              })
            }
          >
            Aplicar {plan.operations.length} cambios
          </button>
          <button onClick={() => setPlan(null)}>Descartar</button>
        </section>
      )}
      {job && (
        <div className="export-status" role="status">
          <strong>
            {job.status === 'done'
              ? 'Exportación lista'
              : job.status === 'failed'
                ? 'Error al exportar'
                : 'Renderizando MP4 1080 × 1920'}
          </strong>
          <progress value={job.progress} max={1} />
          <span>{Math.round(job.progress * 100)}%</span>
          {job.error && <p>{job.error}</p>}
          {job.status === 'done' && (
            <a className="primary" href={`/api/jobs/${job.id}?download=1`}>
              Descargar MP4 ↓
            </a>
          )}
        </div>
      )}
      <footer className="footer">
        EDITOR IA PROFESIONAL{' '}
        <span>Primera versión · Edición semiautomática · Sin análisis visual autónomo</span>
      </footer>
    </div>
  );
}
