# Phase 4: Matter Controller and Apple Home

Home Assistant is a Matter controller, not a Matter bridge. It can commission
Matter devices into Home Assistant, but it cannot expose arbitrary Home
Assistant entities as Matter devices.

## VantaHome 1.0: Matter devices into VantaHome

1. Run Home Assistant OS, the supported installation path for its Matter Server.
2. Add the Matter integration in Home Assistant.
3. Commission a Matter device into Home Assistant.
4. Import its device/entities and capabilities through Vanta Bridge.

The flow is Matter device → Home Assistant Matter controller → Vanta Bridge →
VantaHome.

## Existing Home Assistant devices into Apple Home

Use Home Assistant's HomeKit Bridge integration for supported entities. This is
HomeKit, not Matter bridging.

## Post-1.0: VantaHome Matter product

A proprietary VantaHome Matter controller or bridge requires dedicated software,
product architecture, certification, and trademark decisions. Direct VantaHome
commissioning and bridging are explicitly outside the first public release.

## Suggested command flow

- VantaHome → authenticated Vanta Bridge WSS/HTTPS.
- Vanta Bridge → Home Assistant WebSocket API and service calls.
- Home Assistant → commissioned Matter device.
- VantaHome cloud registry stays in sync via Phase 2/3 state ingest.

## Checklist

- [ ] Home Assistant OS updated and Matter integration enabled
- [ ] Matter device commissioned into Home Assistant
- [ ] Device imported through Vanta Bridge with actual capabilities
- [ ] Validate service calls and observed state changes

## Notes

- Multi-admin sharing may allow the same Matter device to join another
  controller fabric; it does not turn Home Assistant into a bridge.
- Keep the Home Assistant host on a stable LAN address.
