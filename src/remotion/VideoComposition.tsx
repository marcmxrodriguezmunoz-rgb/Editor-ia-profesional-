import {
  AbsoluteFill,
  Sequence,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import { Video, Audio } from '@remotion/media';
import { type Project, type TimelineEvent, styles, sourceFrameAt } from '../domain/project';

export type CompositionProps = { project: Project; mediaUrl: string | null; assetBase: string };
const clamp = { extrapolateLeft: 'clamp' as const, extrapolateRight: 'clamp' as const };
function Graphic({ event, accent }: { event: TimelineEvent; accent: string }) {
  const frame = useCurrentFrame(),
    { fps } = useVideoConfig();
  if (event.type !== 'counter' && event.type !== 'text') return null;
  const seconds =
    event.type === 'counter' ? Math.max(0, Math.ceil(event.hours * 3600 - frame / fps)) : 0;
  const clock = [Math.floor(seconds / 3600), Math.floor((seconds % 3600) / 60), seconds % 60]
    .map((n) => String(n).padStart(2, '0'))
    .join(':');
  return (
    <div
      style={{
        position: 'absolute',
        left: 100,
        right: 100,
        top: event.type === 'counter' ? 300 : 180,
        textAlign: 'center',
        opacity: interpolate(
          frame,
          [0, Math.max(1, Math.min(8, event.duration - 1))],
          [0, 1],
          clamp,
        ),
        scale: spring({ frame, fps, config: { damping: 18 } }),
        fontFamily: 'Arial, sans-serif',
      }}
    >
      <div
        style={{
          display: 'inline-block',
          maxWidth: '100%',
          padding: '28px 42px',
          background: '#10151bef',
          border: `2px solid ${accent}`,
          borderRadius: 24,
          color: event.type === 'counter' ? accent : 'white',
          fontSize: event.type === 'counter' ? 112 : 64,
          fontWeight: 800,
          overflowWrap: 'anywhere',
          fontVariantNumeric: 'tabular-nums',
          boxShadow: '0 20px 80px #0005',
        }}
      >
        {event.type === 'counter' ? clock : event.text}
      </div>
      {event.type === 'counter' && (
        <div style={{ fontSize: 30, letterSpacing: 8, color: 'white', marginTop: 20 }}>
          EL TIEMPO EMPIEZA AHORA
        </div>
      )}
    </div>
  );
}
function WordCaptions({ project, accent }: { project: Project; accent: string }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const ms = (sourceFrameAt(project, frame) / fps) * 1000;
  const active = project.captions.findIndex((c) => ms >= c.startMs && ms < c.endMs);
  if (active < 0 || !project.preferences.captionsEnabled) return null;
  const start = Math.floor(active / 5) * 5;
  // Keep words tied to source time, even when the surrounding source was cut.
  const words = project.captions.slice(start, start + 5);
  return (
    <div
      style={{
        position: 'absolute',
        bottom: 330,
        left: 110,
        right: 110,
        textAlign: 'center',
        fontFamily: 'Arial, sans-serif',
        fontWeight: 800,
        fontSize: 64,
        lineHeight: 1.45,
        whiteSpace: 'pre-wrap',
        overflowWrap: 'anywhere',
        textShadow: '0 3px 14px #000',
      }}
    >
      <span
        style={{
          background: '#10151be8',
          borderRadius: 18,
          padding: '10px 20px',
          boxDecorationBreak: 'clone',
        }}
      >
        {words.map((c, i) => (
          <span key={i} style={{ color: start + i === active ? accent : 'white' }}>
            {c.text}
          </span>
        ))}
      </span>
    </div>
  );
}
export function VideoComposition({ project, mediaUrl, assetBase }: CompositionProps) {
  const frame = useCurrentFrame(),
    { fps } = useVideoConfig();
  const accent = styles[project.style].accent;
  const zoom = project.events.find(
    (e) => e.type === 'zoom' && frame >= e.start && frame < e.start + e.duration,
  );
  let offset = 0;
  return (
    <AbsoluteFill style={{ background: '#10151b', overflow: 'hidden' }}>
      <AbsoluteFill
        style={{
          scale:
            zoom?.type === 'zoom'
              ? interpolate(
                  frame,
                  [
                    zoom.start,
                    zoom.start + Math.min(15, zoom.duration / 2),
                    zoom.start + zoom.duration,
                  ],
                  [1, zoom.scale, 1],
                  clamp,
                )
              : 1,
        }}
      >
        {mediaUrl ? (
          project.clips.map((c) => {
            const from = offset;
            offset += c.duration;
            return (
              <Sequence
                key={c.id}
                name="Vídeo fuente"
                from={from}
                durationInFrames={c.duration}
                premountFor={fps}
              >
                <Video
                  src={mediaUrl}
                  trimBefore={c.sourceStart}
                  volume={project.preferences.sourceVolume}
                  objectFit="cover"
                  style={{ width: '100%', height: '100%' }}
                  premountFor={fps}
                />
              </Sequence>
            );
          })
        ) : (
          <AbsoluteFill
            style={{
              background:
                'radial-gradient(ellipse at 20% 20%, #536149 0%, #1b2928 38%, #10151b 75%)',
              justifyContent: 'center',
              alignItems: 'center',
              fontFamily: 'Arial, sans-serif',
            }}
          >
            <div
              style={{
                position: 'absolute',
                width: 780,
                height: 780,
                border: `2px solid ${accent}50`,
                borderRadius: '50%',
                rotate: `${frame / 8}deg`,
                scale: interpolate(Math.sin(frame / 80), [-1, 1], [0.85, 1.05]),
              }}
            />
            <div style={{ fontSize: 220, fontWeight: 900, color: accent, letterSpacing: -18 }}>
              24<span style={{ fontSize: 100 }}>h</span>
            </div>
            <div
              style={{
                position: 'absolute',
                bottom: 600,
                fontSize: 32,
                letterSpacing: 12,
                color: '#d9e5d1',
              }}
            >
              UNA IDEA LO CAMBIA TODO
            </div>
            <div style={{ position: 'absolute', bottom: 160, color: '#9eada2', fontSize: 24 }}>
              DEMO GRÁFICA · SIN VÍDEO FUENTE
            </div>
          </AbsoluteFill>
        )}
      </AbsoluteFill>
      {project.events
        .filter((e) => e.type === 'text' || e.type === 'counter')
        .map((e) => (
          <Sequence
            key={e.id}
            name={e.type}
            from={e.start}
            durationInFrames={e.duration}
            premountFor={fps}
          >
            <Graphic event={e} accent={accent} />
          </Sequence>
        ))}
      {project.events
        .filter((e) => e.type === 'sound')
        .map(
          (e) =>
            e.type === 'sound' && (
              <Sequence
                key={e.id}
                name={e.asset}
                from={e.start}
                durationInFrames={e.duration}
                premountFor={fps}
              >
                <Audio src={`${assetBase}/${e.asset}.wav`} volume={e.volume} premountFor={fps} />
              </Sequence>
            ),
        )}
      <WordCaptions project={project} accent={accent} />
    </AbsoluteFill>
  );
}
