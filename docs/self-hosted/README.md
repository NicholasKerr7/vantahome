# VantaHome Self-Hosted Stack (NUC / mini-PC)

This setup targets an Intel NUC / Beelink / Minisforum i5 with 16-32GB RAM, NVMe, and a Coral USB for fast detection.

## What you get

- Home Assistant for devices and automations
- Mosquitto MQTT broker (password-protected)
- go2rtc for camera stream normalization
- Frigate for detection + recording
- CompreFace for face recognition
- Double Take for match orchestration + MQTT events

## 1) Host OS and Docker

Recommended: Ubuntu Server 22.04 or 24.04 LTS.

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y ca-certificates curl gnupg lsb-release
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
newgrp docker
```

## 2) Coral USB (recommended)

```bash
curl -fsSL https://packages.cloud.google.com/apt/doc/apt-key.gpg | sudo gpg --dearmor -o /usr/share/keyrings/coral-edgetpu.gpg
echo "deb [signed-by=/usr/share/keyrings/coral-edgetpu.gpg] https://packages.cloud.google.com/apt coral-edgetpu-stable main" | sudo tee /etc/apt/sources.list.d/coral-edgetpu.list
sudo apt update
sudo apt install -y gasket-dkms libedgetpu1-std
```

Verify:

```bash
lsusb | rg -i "coral|google"
```

## 3) Place the stack on the NUC

Copy `docs/self-hosted` to the NUC (example uses `/opt/vantahome-stack`):

```bash
sudo mkdir -p /opt/vantahome-stack
sudo chown -R $USER:$USER /opt/vantahome-stack
rsync -av ./docs/self-hosted/ /opt/vantahome-stack/
```

## 4) Create MQTT credentials

This stack disables anonymous MQTT access.

```bash
cd /opt/vantahome-stack
docker run --rm -it -v ./mosquitto/config:/mosquitto/config eclipse-mosquitto:2 \
  mosquitto_passwd -c /mosquitto/config/passwords vantahome
```

Update the same password in:

- `/opt/vantahome-stack/frigate/config.yml`
- `/opt/vantahome-stack/double-take/config/config.yml`

## 5) Configure cameras

Edit the go2rtc streams:

- `/opt/vantahome-stack/go2rtc/go2rtc.yaml`

Update Frigate to match those stream names:

- `/opt/vantahome-stack/frigate/config.yml`

If you use Intel Quick Sync and see decode issues, try:

- `LIBVA_DRIVER_NAME=i965` in `docker-compose.yml` under `frigate`.

## 6) Configure CompreFace + Double Take

1. Open CompreFace: `http://<nuc-ip>:8000`
2. Create a Recognition service and copy its API key.
3. Paste the key into:
   - `/opt/vantahome-stack/double-take/config/config.yml` under `detectors.compreface.key`

Double Take publishes face matches to MQTT topics your app can subscribe to:

- `vantahome/face/matches` (by person name)
- `vantahome/face/cameras` (by camera name)

## 7) Start the stack

```bash
cd /opt/vantahome-stack
docker compose up -d
```

## 8) Access UIs

- Home Assistant: `http://<nuc-ip>:8123`
- Frigate: `http://<nuc-ip>:5000`
- go2rtc: `http://<nuc-ip>:1984`
- Double Take: `http://<nuc-ip>:3000`
- CompreFace: `http://<nuc-ip>:8000`

## 9) Hook up Home Assistant

In HA:

- Add MQTT integration with host `127.0.0.1`, username `vantahome`, and your password.
- Add the Frigate integration if you want detection events in HA.

## 10) VantaHome MQTT bridge (app)

The app connects over MQTT WebSockets (`ws://`). The Mosquitto config in this repo enables port `9001`; restart the broker after copying the stack:

```bash
docker compose restart mosquitto
```

In your app `.env`:

```
EXPO_PUBLIC_MQTT_URL=ws://<nuc-ip>:9001
EXPO_PUBLIC_MQTT_USERNAME=vantahome
EXPO_PUBLIC_MQTT_PASSWORD=<password>
EXPO_PUBLIC_MQTT_TOPIC_STATE=vantahome/devices/state
EXPO_PUBLIC_MQTT_TOPIC_COMMAND=vantahome/devices/command
```

In the app, open Settings → Realtime (Dev) and enable the toggle (WebSocket URL can stay blank when using MQTT).

MQTT payloads the app expects:

- **State** (HA → app):

```json
{
  "deviceId": "d2",
  "patch": { "isOn": true, "brightness": 80 },
  "ts": 1730000000000
}
```

- **Command** (app → HA):

```json
{
  "type": "command",
  "payload": { "op": "toggle", "deviceId": "d2", "on": true }
}
```

Example HA automations (map `deviceId` to your HA entity IDs):

```yaml
alias: VantaHome - Living room light state
trigger:
  - platform: state
    entity_id: light.living_room
action:
  - service: mqtt.publish
    data:
      topic: vantahome/devices/state
      payload: >
        {{ {
          'deviceId': 'd2',
          'patch': {
            'isOn': is_state('light.living_room', 'on'),
            'brightness': (state_attr('light.living_room', 'brightness')|int(0) / 255 * 100) | round
          },
          'ts': now().timestamp() | int
        } | tojson }}
```

```yaml
alias: VantaHome - Commands
trigger:
  - platform: mqtt
    topic: vantahome/devices/command
variables:
  cmd: "{{ trigger.payload_json.payload }}"
action:
  - choose:
      - conditions: "{{ cmd.op == 'toggle' and cmd.deviceId == 'd2' }}"
        sequence:
          - service: "light.turn_{{ 'on' if cmd.on else 'off' }}"
            target:
              entity_id: light.living_room
      - conditions: "{{ cmd.op == 'set-brightness' and cmd.deviceId == 'd2' }}"
        sequence:
          - service: light.turn_on
            target:
              entity_id: light.living_room
            data:
              brightness_pct: "{{ cmd.value | int }}"
      - conditions: "{{ cmd.op == 'set-temp' and cmd.deviceId == 'd1' }}"
        sequence:
          - service: climate.set_temperature
            target:
              entity_id: climate.living_room
            data:
              temperature: "{{ cmd.value | float }}"
```

Tip: keep device IDs stable by editing `src/store/useHomeStore.ts` so they match your HA entity mapping.

## 11) Security hardening

### MQTT TLS (optional but recommended)

1. Create certs:

```bash
mkdir -p /opt/vantahome-stack/mosquitto/config/certs
cd /opt/vantahome-stack/mosquitto/config/certs
openssl genrsa -out ca.key 4096
openssl req -x509 -new -nodes -key ca.key -sha256 -days 3650 -out ca.crt -subj "/CN=VantaHome CA"
openssl genrsa -out server.key 2048
openssl req -new -key server.key -out server.csr -subj "/CN=<nuc-ip>"
openssl x509 -req -in server.csr -CA ca.crt -CAkey ca.key -CAcreateserial -out server.crt -days 3650 -sha256
```

2. Create `/opt/vantahome-stack/mosquitto/config/conf.d/tls.conf`:

```conf
listener 8883
cafile /mosquitto/config/certs/ca.crt
certfile /mosquitto/config/certs/server.crt
keyfile /mosquitto/config/certs/server.key
```

3. Restart Mosquitto:

```bash
docker compose restart mosquitto
```

Update MQTT clients to use port `8883` and the CA if you enable TLS. Double Take supports `mqtt.tls.ca`, `mqtt.tls.cert`, and `mqtt.tls.key` in `double-take/config/config.yml`.

### Firewall (UFW example)

Allow LAN-only access to your services:

```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow from 192.168.1.0/24 to any port 22
sudo ufw allow from 192.168.1.0/24 to any port 8123
sudo ufw allow from 192.168.1.0/24 to any port 1883
sudo ufw allow from 192.168.1.0/24 to any port 9001
sudo ufw allow from 192.168.1.0/24 to any port 8883
sudo ufw allow from 192.168.1.0/24 to any port 5000
sudo ufw allow from 192.168.1.0/24 to any port 1984
sudo ufw allow from 192.168.1.0/24 to any port 3000
sudo ufw allow from 192.168.1.0/24 to any port 8000
sudo ufw enable
```

### Home Assistant trusted networks (optional)

Use LAN-only trusted networks if you want to bypass login locally:

```yaml
http:
  trusted_networks:
    - 192.168.1.0/24
  ip_ban_enabled: true
  login_attempts_threshold: 5
```

## Notes

- Blink cameras do not expose RTSP/ONVIF, so go2rtc and Frigate cannot ingest live video from Blink. This stack is ready for any RTSP-capable camera when you switch.
- Keep the stack on a static IP for stable camera URLs and app connections.
