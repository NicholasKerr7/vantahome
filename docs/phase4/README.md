# Phase 4: Matter Bridge → Apple Home

This phase connects your VantaHome device registry into Apple Home via Matter. The fastest, most reliable path is to use Home Assistant's built‑in Matter server as the bridge.

## Recommended path (Home Assistant Matter server)

1) **Update HA** to a version that includes the Matter integration.
2) **Enable Matter** in HA:
   - Settings → Devices & Services → Add Integration → Matter.
   - Set the Matter server to *Bridge* mode.
3) **Expose devices** in HA:
   - Make sure your devices (or MQTT entities) exist in HA.
   - Use HA's “Expose to Matter” toggles.
4) **Pair with Apple Home**:
   - In HA Matter integration, create a pairing code.
   - In Apple Home app: Add Accessory → More options → Matter device → scan/paste code.

Once paired, Apple Home uses Matter over your LAN. Your VantaHome app stays the primary UI; HA is the bridge.

## Alternative path (Dedicated Matter bridge)

If you need custom device modeling or a cloud‑native bridge:
- Run a Matter bridge using **matter.js** or **Project CHIP**.
- Implement endpoints based on your device registry (`devices` + `device_state`).
- Use the `device_commands` queue (Phase 3) to sync state and control.

This is more work but gives you full control over the device model and vendor IDs.

## Suggested command flow

- VantaHome → MQTT/HA for local control.
- HA → Matter bridge for Apple Home.
- VantaHome cloud registry stays in sync via Phase 2/3 state ingest.

## Checklist

- [ ] HA updated and Matter integration enabled
- [ ] Devices exposed to Matter in HA
- [ ] Apple Home paired via Matter code
- [ ] Validate on/off + brightness + temperature

## Notes

- Apple Home requires the **same LAN** for initial pairing.
- Matter does not require MFi membership for bridges.
- Keep HA host on a static IP for stability.
