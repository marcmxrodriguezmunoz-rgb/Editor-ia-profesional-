export const assetLibrary = [
  { id: 'tick', kind: 'sound', name: 'Reloj', license: 'CC0-1.0', path: '/assets/tick.wav' },
  { id: 'pop', kind: 'sound', name: 'Pop', license: 'CC0-1.0', path: '/assets/pop.wav' },
  { id: 'whoosh', kind: 'sound', name: 'Whoosh', license: 'CC0-1.0', path: '/assets/whoosh.wav' },
  { id: 'title', kind: 'animation', name: 'Título con entrada', license: 'project', path: null },
  { id: 'counter', kind: 'animation', name: 'Cuenta atrás', license: 'project', path: null },
  { id: 'zoom', kind: 'effect', name: 'Zoom suave', license: 'project', path: null },
] as const;
// Future assets (images, b-roll, transitions) must declare provenance, license and tags.
export type ReferenceAnalysis = {
  version: 1;
  referenceId: string;
  provenance: string;
  rhythm: { averageShotSeconds: number };
  suggestedRules: string[];
};
