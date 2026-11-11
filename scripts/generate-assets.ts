import { mkdir, writeFile } from 'node:fs/promises';
// Original deterministic synthesis, no third-party recordings. CC0; see public/assets/LICENSE.md.
await mkdir('public/assets', { recursive: true });
const rate = 44100;
for (const name of ['tick', 'pop', 'whoosh']) {
  const length = Math.round(rate * (name === 'whoosh' ? 0.65 : name === 'tick' ? 0.18 : 0.25));
  const out = Buffer.alloc(44 + length * 2);
  out.write('RIFF', 0);
  out.writeUInt32LE(36 + length * 2, 4);
  out.write('WAVEfmt ', 8);
  out.writeUInt32LE(16, 16);
  out.writeUInt16LE(1, 20);
  out.writeUInt16LE(1, 22);
  out.writeUInt32LE(rate, 24);
  out.writeUInt32LE(rate * 2, 28);
  out.writeUInt16LE(2, 32);
  out.writeUInt16LE(16, 34);
  out.write('data', 36);
  out.writeUInt32LE(length * 2, 40);
  let seed = 1837;
  for (let i = 0; i < length; i++) {
    const t = i / rate;
    seed = (seed * 1664525 + 1013904223) >>> 0;
    const noise = (seed / 4294967296) * 2 - 1;
    const signal =
      name === 'tick'
        ? Math.sin(2 * Math.PI * 1850 * t) * Math.exp(-t * 45)
        : name === 'pop'
          ? Math.sin(2 * Math.PI * (600 * t - 700 * t * t)) * Math.exp(-t * 24)
          : noise * Math.sin((Math.PI * i) / length) * 0.35;
    out.writeInt16LE(Math.round(Math.max(-1, Math.min(1, signal)) * 18000), 44 + i * 2);
  }
  await writeFile(`public/assets/${name}.wav`, out);
}
