/** Replay and expiry metadata shared by the mobile client and isolated bridge. */
export type CommandSecurity = {
  commandId: string;
  nonce: string;
  createdAt: number;
  expiresAt: number;
  idempotencyKey: string;
};

/** Explicit power intent; the historical wire name never permits implicit toggles. */
export type ExplicitPowerCommand = Readonly<CommandSecurity & {
  op: "toggle";
  deviceId: string;
  on: boolean;
}>;
