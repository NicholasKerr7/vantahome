const mqtt = require("mqtt");
const fs = require("fs");
const path = require("path");

const args = process.argv.slice(2);
const getArg = (key, fallback) => {
  const index = args.indexOf(`--${key}`);
  if (index === -1) return fallback;
  const value = args[index + 1];
  if (!value || value.startsWith("--")) return fallback;
  return value;
};
const getFlag = (short, long, fallback) => {
  const shortIndex = args.indexOf(short);
  const longIndex = args.indexOf(long);
  const index = shortIndex > -1 ? shortIndex : longIndex;
  if (index === -1) return fallback;
  const value = args[index + 1];
  if (!value || value.startsWith("-")) return fallback;
  return value;
};

const showHelp = args.includes("-h") || args.includes("--help");
const url =
  getFlag("-u", "--url", undefined) || process.env.EXPO_PUBLIC_MQTT_URL;
const topic =
  getFlag("-t", "--topic", undefined) ||
  process.env.EXPO_PUBLIC_MQTT_TOPIC_STATE ||
  "vantahome/devices/state";
const roomInput = getFlag("-r", "--room", undefined) || getArg("room");
const roomName = getFlag("-n", "--room-name", undefined) || getArg("room-name");
const deviceId = getFlag("-d", "--device", undefined) || getArg("device");
const kind = getFlag("-k", "--kind", "unknown") || "unknown";
const source = getFlag("-s", "--source", "motion") || "motion";

if (showHelp) {
  console.log(
    [
      "Usage:",
      "  npm run mqtt:presence -- --room r1 --kind unknown --source motion",
      "  npm run mqtt:presence -- --room-name \"Drawing Room\"",
      "",
      "Options:",
      "  -u, --url         MQTT url (or EXPO_PUBLIC_MQTT_URL)",
      "  -t, --topic       MQTT state topic (default: vantahome/devices/state)",
      "  -r, --room        Room id (or room name if it matches roomsSeed)",
      "  -n, --room-name   Room name (resolved from roomsSeed)",
      "  -d, --device      Device id (fallback if no room id)",
      "  -k, --kind        known | unknown (default: unknown)",
      "  -s, --source      motion | camera | sensor (default: motion)",
    ].join("\n"),
  );
  process.exit(0);
}

if (!url) {
  console.error("MQTT url missing. Use --url or EXPO_PUBLIC_MQTT_URL.");
  process.exit(1);
}

const resolveRoomId = () => {
  if (!roomInput && !roomName) return null;
  const seedPath = path.resolve(__dirname, "../src/store/useHomeStore.ts");
  let sourceText = "";
  try {
    sourceText = fs.readFileSync(seedPath, "utf8");
  } catch {
    return roomInput ?? null;
  }
  const seedMatch = sourceText.match(
    /const\s+roomsSeed[^=]*=\s*\[([\s\S]*?)\];/,
  );
  if (!seedMatch) return roomInput ?? null;
  const body = seedMatch[1];
  const rooms = [];
  const roomRegex = /\{\s*id:\s*"([^"]+)"\s*,\s*name:\s*"([^"]+)"\s*\}/g;
  let match = roomRegex.exec(body);
  while (match) {
    rooms.push({ id: match[1], name: match[2] });
    match = roomRegex.exec(body);
  }
  if (roomName) {
    const found = rooms.find(
      (room) => room.name.toLowerCase() === roomName.toLowerCase(),
    );
    return found?.id ?? roomInput ?? null;
  }
  if (roomInput) {
    const byId = rooms.find((room) => room.id === roomInput);
    if (byId) return roomInput;
    const byName = rooms.find(
      (room) => room.name.toLowerCase() === roomInput.toLowerCase(),
    );
    return byName?.id ?? roomInput;
  }
  return null;
};

const roomId = resolveRoomId();

if (!roomId && !deviceId) {
  console.error("Provide --room/--room-name or --device.");
  process.exit(1);
}

const payload = {
  type: "presence",
  roomId: roomId ?? null,
  deviceId: deviceId ?? null,
  kind,
  source,
};

const client = mqtt.connect(url, {
  username: process.env.MQTT_USERNAME,
  password: process.env.MQTT_PASSWORD,
  clientId: `vantahome-presence-${Math.random().toString(16).slice(2)}`,
  keepalive: 20,
});

const timeout = setTimeout(() => {
  console.error("MQTT connect timeout.");
  client.end(true);
  process.exit(1);
}, 8000);

client.on("connect", () => {
  clearTimeout(timeout);
  client.publish(topic, JSON.stringify(payload), { qos: 0 }, (err) => {
    if (err) {
      console.error("MQTT publish failed:", err.message);
      process.exit(1);
    }
    console.log(`Presence event published to ${topic}`);
    client.end(true);
  });
});

client.on("error", (err) => {
  clearTimeout(timeout);
  console.error("MQTT error:", err.message);
  client.end(true);
  process.exit(1);
});
