import type { LightObservation, PilotLight } from "../lightContract";
import type { LightServiceCall } from "../lightLifecycle";

/** A fresh authenticated integration session supplies both identity and state. */
export type LightAdapterSnapshot = Readonly<{
  light: PilotLight;
  sessionId: string;
  observation: LightObservation;
}>;

/** These events originate inside the authenticated adapter, never a phone body. */
export type LightAdapterEvent =
  | Readonly<{ type: "service-result"; sessionId: string; input: unknown }>
  | Readonly<{ type: "observation"; observation: LightObservation }>
  | Readonly<{ type: "disconnected"; sessionId: string }>;

/** Narrow transport boundary: persistence must complete before calling send. */
export interface LightAdapter {
  getSnapshot(): LightAdapterSnapshot | null;
  allocateRequestId(): number;
  send(call: LightServiceCall, sessionId: string): void;
  subscribe(listener: (event: LightAdapterEvent) => void): () => void;
  close(): void;
}
