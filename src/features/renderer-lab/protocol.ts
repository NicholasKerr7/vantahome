export type LabDevice = 'lights' | 'blinds' | 'gate';
export type LabView = 'bedroom' | 'property';
export type LabRenderer = 'three' | 'filament';

export interface LabSettings {
  view: LabView;
  night: boolean;
  lights: boolean;
  blinds: number;
  gate: number;
  rain: boolean;
  motion: boolean;
  resetKey: number;
}

export interface LabMetrics {
  frames: number;
  p50: number;
  p95: number;
  slowFrames: number;
}

export type LabEvent = { type: 'ready' } | { type: 'error'; message: string }
  | { type: 'select'; device: LabDevice } | ({ type: 'metrics' } & LabMetrics);

export interface LabSurfaceProps {
  settings: LabSettings;
  onEvent: (event: LabEvent) => void;
}

export const INITIAL_LAB_SETTINGS: LabSettings = {
  view: 'bedroom', night: false, lights: true, blinds: 0, gate: 0,
  rain: false, motion: true, resetKey: 0,
};

/** Accept only bounded renderer diagnostics; this protocol has no hardware commands. */
export function parseLabEvent(raw: string): LabEvent | null {
  if (raw.length > 2048) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== 'object' || !('type' in value)) return null;
    const event = value as Record<string, unknown>;
    if (event.type === 'ready') return { type: 'ready' };
    if (event.type === 'error') return { type: 'error', message: 'The comparison scene could not load.' };
    if (event.type === 'select' && ['lights', 'blinds', 'gate'].includes(String(event.device))) {
      return { type: 'select', device: event.device as LabDevice };
    }
    if (event.type !== 'metrics') return null;
    const { frames, p50, p95, slowFrames } = event;
    if (![frames, p50, p95, slowFrames].every((n) => typeof n === 'number' && Number.isFinite(n) && n >= 0)) return null;
    if ((frames as number) > 10_000 || (p95 as number) > 60_000 || (p50 as number) > (p95 as number)
      || (slowFrames as number) > (frames as number) || !Number.isInteger(frames) || !Number.isInteger(slowFrames)) return null;
    return { type: 'metrics', frames, p50, p95, slowFrames } as LabEvent;
  } catch {
    return null;
  }
}

/** Summarize render-callback cadence, explicitly excluding GPU completion claims. */
export function summarizeIntervals(samples: number[]): LabMetrics | null {
  const sorted = samples.filter((sample) => Number.isFinite(sample) && sample > 0 && sample <= 60_000).sort((a, b) => a - b);
  if (!sorted.length) return null;
  return {
    frames: sorted.length,
    p50: sorted[Math.ceil(sorted.length * 0.5) - 1],
    p95: sorted[Math.ceil(sorted.length * 0.95) - 1],
    slowFrames: sorted.filter((sample) => sample > 1000 / 30).length,
  };
}

/** Inject only this fixed, typed simulation snapshot into the bundled document. */
export function labSettingsScript(settings: LabSettings): string {
  return `window.__VANTA_LAB_UPDATE__?.(${JSON.stringify(settings)});true;`;
}
