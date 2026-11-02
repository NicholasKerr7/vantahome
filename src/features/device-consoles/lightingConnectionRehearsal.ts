import type { LightingConsoleActions, LightingConsoleCapabilities, LightingConsoleModel } from './lightingConsoleModel';

export type LightingConnectionProfile = 'switch' | 'dimmer' | 'color';
export type LightingConnectionScenario = 'normal' | 'delayed' | 'offline' | 'failure' | 'stale';
export type LightingConnectionPhase = 'idle' | 'sending' | 'awaiting' | 'confirmed' | 'failed' | 'interrupted';

/** An isolated demo sample and its command lifecycle; no physical connection is represented. */
export interface LightingConnectionSnapshot {
  readonly model: LightingConsoleModel;
  readonly profile: LightingConnectionProfile;
  readonly scenario: LightingConnectionScenario;
  readonly phase: LightingConnectionPhase;
  readonly active: boolean;
  readonly canControl: boolean;
  readonly detail: string;
}

/** Only these explicitly known sample fields can be changed by a rehearsed command. */
interface SampleReading {
  on: boolean;
  brightness: number | null;
  colorMode: 'color' | 'temperature';
  color: string;
  temperatureK: number;
}

const ACKNOWLEDGEMENT_MS = 200;
const OBSERVATION_MS = 800;
const DELAYED_OBSERVATION_MS = 3000;
const FAILURE_MS = 600;
const SAMPLE_WHITE = '#FFE4CC';
const BRIGHTNESS_RANGE = Object.freeze({ min: 0, max: 100, step: 5 });
const TEMPERATURE_RANGE = Object.freeze({ min: 2700, max: 6500 });
const CAPABILITIES: Record<LightingConnectionProfile, LightingConsoleCapabilities> = {
  switch: Object.freeze({ power: true, brightness: null, temperature: null, color: false }),
  dimmer: Object.freeze({ power: true, brightness: BRIGHTNESS_RANGE, temperature: null, color: false }),
  color: Object.freeze({ power: true, brightness: BRIGHTNESS_RANGE, temperature: TEMPERATURE_RANGE, color: true }),
};

/** Create a known fixture without borrowing home, registry or simulation state. */
function createSample(profile: LightingConnectionProfile): SampleReading {
  return { on: false, brightness: profile === 'switch' ? null : 50, colorMode: 'temperature', color: SAMPLE_WHITE, temperatureK: 3000 };
}

/** Approximate white appearance for artwork only; this is not measured light output. */
function samplePreviewColor(reading: SampleReading): string {
  if (reading.colorMode === 'color') return reading.color;
  const fraction = (reading.temperatureK - TEMPERATURE_RANGE.min) / (TEMPERATURE_RANGE.max - TEMPERATURE_RANGE.min);
  const warm = [255, 214, 168];
  const cool = [244, 247, 255];
  return `#${warm.map((channel, index) => Math.round(channel + (cool[index] - channel) * fraction).toString(16).padStart(2, '0')).join('')}`;
}

/**
 * Rehearse intent, acknowledgement and later observation entirely in memory.
 * Timer generations prevent cancelled or backgrounded commands from publishing.
 */
export class LightingConnectionRehearsal {
  private profile: LightingConnectionProfile = 'dimmer';
  private scenario: LightingConnectionScenario = 'normal';
  private phase: LightingConnectionPhase = 'idle';
  private active = true;
  private disposed = false;
  private generation = 0;
  private reading = createSample(this.profile);
  private detail = 'Demo sample ready. No physical light is connected.';
  private readonly listeners = new Set<() => void>();
  private readonly timers = new Set<ReturnType<typeof setTimeout>>();
  private snapshot = this.createSnapshot();

  /** Stable handlers let the shared console submit intent without a device identity. */
  readonly actions: LightingConsoleActions = Object.freeze({
    toggle: () => this.toggle(),
    adjustBrightness: (direction: -1 | 1) => this.adjustBrightness(direction),
    setMode: (mode: 'color' | 'temperature') => this.setMode(mode),
    setTemperature: (kelvin: number) => this.setTemperature(kelvin),
    setColor: (hex: string) => this.setColor(hex),
  });

  /** Return one referentially stable snapshot until a real demo transition occurs. */
  getSnapshot = (): LightingConnectionSnapshot => this.snapshot;

  /** Attach a store listener and return idempotent cleanup, including after disposal. */
  subscribe = (listener: () => void): (() => void) => {
    if (!this.disposed) this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };

  /** Changing the fixture invalidates any pending command and starts a fresh sample. */
  setProfile = (profile: LightingConnectionProfile): void => {
    if (this.disposed || profile === this.profile || !['switch', 'dimmer', 'color'].includes(profile)) return;
    this.cancelPending();
    this.profile = profile;
    this.reading = createSample(profile);
    this.phase = 'idle';
    this.detail = 'Demo profile changed; a fresh sample is ready. No physical light is connected.';
    this.publish();
  };

  /** Scenarios are local fixtures; offline and stale never enable real transport. */
  setScenario = (scenario: LightingConnectionScenario): void => {
    if (this.disposed || scenario === this.scenario || !['normal', 'delayed', 'offline', 'failure', 'stale'].includes(scenario)) return;
    const interrupted = this.isPending();
    this.cancelPending();
    this.scenario = scenario;
    this.phase = interrupted ? 'interrupted' : 'idle';
    this.detail = scenario === 'offline'
      ? 'Demo offline. Last known sample retained; controls are unavailable.'
      : scenario === 'stale'
        ? 'Demo sample is stale. Readings and controls are unavailable.'
        : interrupted
          ? 'Demo command interrupted by the scenario change. Previous sample retained.'
          : 'Demo scenario ready with the local sample. No physical light is connected.';
    this.publish();
  };

  /** A covered or backgrounded rehearsal cancels work and requires a new intent on return. */
  setActive = (active: boolean): void => {
    if (this.disposed || typeof active !== 'boolean' || active === this.active) return;
    const interrupted = this.isPending();
    this.cancelPending();
    this.active = active;
    this.phase = interrupted ? 'interrupted' : 'idle';
    this.detail = active
      ? 'Demo resumed with the previous local sample. Interrupted commands are not retried.'
      : 'Demo paused. Pending commands were cancelled; no physical light is connected.';
    this.publish();
  };

  /** Release all callbacks without publishing into a detached console. */
  dispose = (): void => {
    if (this.disposed) return;
    this.disposed = true;
    this.cancelPending();
    this.listeners.clear();
  };

  /** Power intent changes only power when a later sample confirms it. */
  private toggle(): void {
    if (!this.canSubmit()) return;
    this.submit({ on: !this.reading.on });
  }

  /** Reject unsupported, malformed and out-of-range steps instead of coercing values. */
  private adjustBrightness(direction: -1 | 1): void {
    if (!this.canSubmit()) return;
    const range = CAPABILITIES[this.profile].brightness;
    const current = this.reading.brightness;
    if (!range || current === null || (direction !== -1 && direction !== 1)) {
      this.reject('Demo brightness command is unsupported or invalid. Sample unchanged.');
      return;
    }
    const brightness = current + direction * range.step;
    if (!Number.isFinite(brightness) || brightness < range.min || brightness > range.max) {
      this.reject('Demo brightness is outside the supported range. Sample unchanged.');
      return;
    }
    this.submit({ brightness });
  }

  /** Mode selection is capability checked and never changes independent power. */
  private setMode(mode: 'color' | 'temperature'): void {
    if (!this.canSubmit()) return;
    const capabilities = CAPABILITIES[this.profile];
    if ((mode !== 'color' && mode !== 'temperature') || (mode === 'color' ? !capabilities.color : !capabilities.temperature)) {
      this.reject('Demo light mode is unsupported or invalid. Sample unchanged.');
      return;
    }
    this.submit({ colorMode: mode });
  }

  /** White presets must fit the adapter range; the existing 2400 K preset is rejected. */
  private setTemperature(kelvin: number): void {
    if (!this.canSubmit()) return;
    const range = CAPABILITIES[this.profile].temperature;
    if (!range || !Number.isInteger(kelvin) || kelvin < range.min || kelvin > range.max) {
      this.reject('Demo white temperature is unsupported or outside the allowed range. Sample unchanged.');
      return;
    }
    this.submit({ temperatureK: kelvin, colorMode: 'temperature' });
  }

  /** Accept a complete RGB hex value only, without CSS or browser interpretation. */
  private setColor(hex: string): void {
    if (!this.canSubmit()) return;
    if (!CAPABILITIES[this.profile].color || typeof hex !== 'string' || !/^#[0-9a-f]{6}$/i.test(hex)) {
      this.reject('Demo color is unsupported or invalid. Sample unchanged.');
      return;
    }
    this.submit({ color: hex.toUpperCase(), colorMode: 'color' });
  }

  /** Pending or unavailable samples cannot enqueue another command. */
  private canSubmit(): boolean {
    return !this.disposed && this.active && this.scenario !== 'offline' && this.scenario !== 'stale' && !this.isPending();
  }

  /** Acknowledged intent remains pending until a separate simulated observation arrives. */
  private submit(change: Partial<SampleReading>): void {
    this.cancelPending();
    const generation = this.generation;
    this.phase = 'sending';
    this.detail = 'Demo command sending. The displayed sample has not changed.';
    this.publish();
    this.schedule(generation, ACKNOWLEDGEMENT_MS, () => {
      this.phase = 'awaiting';
      this.detail = 'Demo command acknowledged; waiting for a simulated observation. The sample has not changed.';
      this.publish();
    });
    const fails = this.scenario === 'failure';
    const observationDelay = this.scenario === 'delayed' ? DELAYED_OBSERVATION_MS : OBSERVATION_MS;
    this.schedule(generation, fails ? FAILURE_MS : ACKNOWLEDGEMENT_MS + observationDelay, () => {
      if (fails) {
        this.phase = 'failed';
        this.detail = 'Demo command failed. Previous sample retained; no physical light was controlled.';
      } else {
        this.reading = { ...this.reading, ...change };
        this.phase = 'confirmed';
        this.detail = 'Demo sample confirmed by a simulated observation. No physical light was controlled.';
      }
      this.publish();
    });
  }

  /** Invalid intent produces feedback without changing the observed sample. */
  private reject(detail: string): void {
    this.phase = 'failed';
    this.detail = detail;
    this.publish();
  }

  /** Capture the command generation so even an already queued callback cannot act late. */
  private schedule(generation: number, delay: number, callback: () => void): void {
    if (this.disposed || !this.active || generation !== this.generation) return;
    const timer = setTimeout(() => {
      this.timers.delete(timer);
      if (this.disposed || !this.active || generation !== this.generation) return;
      callback();
    }, delay);
    this.timers.add(timer);
  }

  /** Invalidate correlation before clearing timers to cover callbacks already queued. */
  private cancelPending(): void {
    this.generation += 1;
    this.timers.forEach((timer) => clearTimeout(timer));
    this.timers.clear();
  }

  /** Both sending and acknowledgement phases exclude duplicate taps. */
  private isPending(): boolean {
    return this.phase === 'sending' || this.phase === 'awaiting';
  }

  /** Project known versus unavailable samples without optimistic power or illumination. */
  private createSnapshot(): LightingConnectionSnapshot {
    const capabilities = CAPABILITIES[this.profile];
    const known = this.active && this.scenario !== 'stale';
    const available = known && this.scenario !== 'offline';
    const status = !this.active ? 'Demo paused · Sample unavailable'
      : this.scenario === 'stale' ? 'Demo stale · Sample unavailable'
        : this.scenario === 'offline' ? 'Demo offline · Last known sample'
          : `Demo sample · ${this.reading.on ? 'On' : 'Off'}`;
    const model: LightingConsoleModel = Object.freeze({
      on: known ? this.reading.on : null,
      brightness: known ? this.reading.brightness : null,
      colorMode: known ? this.reading.colorMode : null,
      color: known ? this.reading.color : null,
      temperatureK: known ? this.reading.temperatureK : null,
      manual: known,
      previewColor: known ? samplePreviewColor(this.reading) : SAMPLE_WHITE,
      previewBrightness: available && this.reading.on ? (this.reading.brightness ?? 100) : 0,
      status,
      feedback: this.detail,
      capabilities,
    });
    return Object.freeze({ model, profile: this.profile, scenario: this.scenario, phase: this.phase,
      active: this.active, canControl: this.canSubmit(), detail: this.detail });
  }

  /** Publish one stable snapshot for a completed local transition. */
  private publish(): void {
    this.snapshot = this.createSnapshot();
    this.listeners.forEach((listener) => listener());
  }
}
