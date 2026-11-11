import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = {
  title: 'Editor IA Profesional — Estudio',
  description: 'Editor audiovisual semiautomático con vista previa y composición editable.',
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
