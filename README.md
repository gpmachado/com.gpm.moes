# Moes Devices

Homey app for Moes/Linptech Zigbee devices:

- **Moes 3-Gang Fan/Dimmer Controller** (`moes_dimmer_3_gang`) — Tuya TS0601, DP-protocol (cluster 0xEF00).
- **Linptech mmWave Presence Sensor** (`moes_radar_sensor_mmwave`) — TS0225, `_TZ3218_t9ynfz4x`.

## Availability tracking

`lib/AvailabilityManager.js` (`AvailabilityManagerPassive`) tracks device liveness two ways:

1. **Passive** — a hook on the Zigbee node's frame stream marks the device alive on *any* incoming frame, at zero extra network cost. Works well for devices that talk on their own (the radar reports basic-cluster attributes periodically).
2. **Active poll** — if a device stays silent past its configured timeout, `_pollDevice()` reads the `basic` cluster before marking it unavailable. This is the safety net for devices that are genuinely silent when idle — confirmed via testing that the Moes dimmer sends **zero** frames of any kind unless a button is pressed or a setting is changed, so the passive hook alone never catches it.

## Rejoin detection

`lib/RejoinManager.js` fires the `..._device_rejoined` flow trigger. Two device-agnostic entry points, driven by lookup tables in `lib/constants.js`:

- **`notifyIfRejoinDatapoint(device, dp)`** — for devices whose rejoin signal is a known Tuya DP. The dimmer uses `DP.POWER_ON` (14): the device only re-reports its power-on-restore behavior after a real power cycle, not during normal operation.
- **`watchAnnounceFrame(device)`** — for devices whose rejoin signal is a raw, undocumented cluster frame. The radar sends a frame on cluster `0xEC03` (60419) — not documented in zigbee-herdsman, zigbee-herdsman-converters, or Tuya's own SDK docs — carrying its own manufacturer-name string as payload.

### Caveat: settings writes can trigger a false rejoin

Both signals can also fire as a side effect of **us** writing a setting to the device, not just after a genuine rejoin:

- Writing `DP.POWER_ON` (changing the Power-On Behavior setting) makes the dimmer echo that DP back — indistinguishable from the DP appearing after a real rejoin.
- Sniffer capture (`analise/linptech- tuya - .pcapng`) showed the radar's `0xEC03` frame follows *any* config DP report (fading time, sensitivity, distance, LED indicator), not only the full resync burst that happens once after boot/rejoin. Frame 2000 in that capture decodes to a Tuya DP report (`dp=101` "fading time", value `120`) immediately followed by `0xEC03` — with no power cycle involved.

Both `onSettings()` handlers call a suppression method *before* writing, so the resulting echo doesn't get misread as a rejoin:

- `moes_dimmer_3_gang`: `RejoinManager.markSelfWrite(this, dp)` in `_writeEnumSetting()`.
- `moes_radar_sensor_mmwave`: `RejoinManager.suppressAnnounce(this)` at the top of `onSettings()`.

Adding rejoin detection to a new driver means one `constants.js` entry (`REJOIN_ANNOUNCE_DPS` or `REJOIN_ANNOUNCE_CLUSTERS`) plus one call from the driver — no per-device state to manage.
