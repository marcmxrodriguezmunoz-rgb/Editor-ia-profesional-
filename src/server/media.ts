import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const exec = promisify(execFile);
export async function probe(file: string) {
  const { stdout } = await exec(
    process.env.FFPROBE_PATH || 'ffprobe',
    ['-v', 'error', '-show_format', '-show_streams', '-of', 'json', file],
    { timeout: 30000, maxBuffer: 1024 * 1024 },
  );
  const info = JSON.parse(stdout);
  const video = info.streams?.find((s: { codec_type: string }) => s.codec_type === 'video');
  const duration = Number(info.format?.duration);
  if (!video || !Number.isFinite(duration) || duration <= 0 || duration > 1800)
    throw new Error('Se necesita un vídeo válido de hasta 30 minutos.');
  if (video.width > 7680 || video.height > 7680)
    throw new Error('La fuente no puede superar 7680 píxeles por lado.');
  return {
    duration,
    frames: Math.max(1, Math.floor(duration * 30)),
    hasAudio: info.streams.some((s: { codec_type: string }) => s.codec_type === 'audio'),
  };
}
export async function normalize(input: string, output: string) {
  await exec(
    process.env.FFMPEG_PATH || 'ffmpeg',
    [
      '-nostdin',
      '-y',
      '-v',
      'error',
      '-i',
      input,
      '-map',
      '0:v:0',
      '-map',
      '0:a:0?',
      '-vf',
      "scale='min(1920,iw)':'min(1920,ih)':force_original_aspect_ratio=decrease:force_divisible_by=2",
      '-r',
      '30',
      '-c:v',
      'libx264',
      '-preset',
      'veryfast',
      '-crf',
      '20',
      '-pix_fmt',
      'yuv420p',
      '-c:a',
      'aac',
      '-b:a',
      '128k',
      '-movflags',
      '+faststart',
      output,
    ],
    { timeout: 15 * 60 * 1000, maxBuffer: 2 * 1024 * 1024 },
  );
}
export async function extractAudio(input: string, output: string) {
  await exec(
    process.env.FFMPEG_PATH || 'ffmpeg',
    [
      '-nostdin',
      '-y',
      '-v',
      'error',
      '-i',
      input,
      '-vn',
      '-ac',
      '1',
      '-ar',
      '16000',
      '-c:a',
      'libmp3lame',
      '-b:a',
      '48k',
      output,
    ],
    { timeout: 180000, maxBuffer: 1024 * 1024 },
  );
}
