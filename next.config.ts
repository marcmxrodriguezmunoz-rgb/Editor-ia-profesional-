import type { NextConfig } from 'next';
const config: NextConfig = {
  serverExternalPackages: ['@remotion/bundler', '@remotion/renderer'],
  experimental: { cpus: 2 },
};
export default config;
