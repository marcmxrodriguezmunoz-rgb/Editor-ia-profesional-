'use client';
import dynamic from 'next/dynamic';
const Editor = dynamic(() => import('./Editor'), {
  ssr: false,
  loading: () => <div className="loading">Abriendo tu estudio…</div>,
});
export function EditorShell() {
  return <Editor />;
}
