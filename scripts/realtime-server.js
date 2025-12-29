#!/usr/bin/env node
/* eslint-disable no-console */
const http = require("http");
const WebSocket = require("ws");

const PORT = Number(process.env.PORT || 8088);
const server = http.createServer();
const wss = new WebSocket.Server({ server });
const deviceState = new Map();

const broadcast = (message) => {
  const payload = JSON.stringify(message);
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  });
};

const applyPatch = (deviceId, patch) => {
  const prev = deviceState.get(deviceId) || { id: deviceId };
  const next = { ...prev, ...patch };
  deviceState.set(deviceId, next);
  return next;
};

const patchFromCommand = (cmd) => {
  switch (cmd.op) {
    case "patch":
      return cmd.patch || null;
    case "toggle":
      return { isOn: typeof cmd.on === "boolean" ? cmd.on : true };
    case "set-temp":
      return { tempC: cmd.value, mode: cmd.mode, isOn: true };
    case "set-brightness":
      return { brightness: cmd.value, isOn: cmd.value > 0 };
    case "set-volume":
      return { volume: cmd.value, isOn: true };
    case "set-mode":
      return { mode: cmd.mode, isOn: true };
    case "set-channel":
      return { channel: cmd.value, isOn: true };
    case "set-muted":
      return { muted: cmd.value, isOn: true };
    case "launch-app":
      return { source: cmd.app, isOn: true };
    case "media":
    case "nav":
      return { isOn: true };
    default:
      return null;
  }
};

wss.on("connection", (ws) => {
  const snapshot = Array.from(deviceState.values());
  if (snapshot.length) {
    ws.send(
      JSON.stringify({ type: "snapshot", devices: snapshot, ts: Date.now() }),
    );
  }

  ws.on("message", (raw) => {
    let data;
    try {
      data = JSON.parse(raw.toString());
    } catch {
      return;
    }

    if (data?.type === "state" && data.deviceId && data.patch) {
      const next = applyPatch(data.deviceId, data.patch);
      broadcast({
        type: "state",
        deviceId: data.deviceId,
        patch: next,
        ts: Date.now(),
      });
      return;
    }

    if (data?.type === "command" && data.payload?.deviceId) {
      const patch = patchFromCommand(data.payload);
      if (!patch) return;
      const next = applyPatch(data.payload.deviceId, patch);
      broadcast({
        type: "state",
        deviceId: data.payload.deviceId,
        patch: next,
        ts: Date.now(),
      });
    }
  });
});

server.listen(PORT, () => {
  console.log(`Realtime WS server listening on ws://localhost:${PORT}`);
});
