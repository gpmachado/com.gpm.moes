# Moes Devices

Homey app for Moes/Linptech Zigbee devices:

- **Moes 3-Gang Fan/Dimmer Controller** (`moes_dimmer_3_gang`) — Tuya TS0601, DP-protocol (cluster 0xEF00).
- **Linptech mmWave Presence Sensor** (`moes_radar_sensor_mmwave`) — TS0225, `_TZ3218_t9ynfz4x`.
- **Moes 4-Gang Wall Remote** (`moes_remote_4_gang`) — TS0044, battery; no availability tracking.

## Availability

Homey does not mark a Zigbee device unavailable on its own, so `lib/AvailabilityManager.js` (same model as com.gpm.sonoff, all in memory) does it from three signals on the dimmer and the radar:

- any frame received → available;
- 25 min without any frame → unavailable ("No activity for Nmin"). Every Tuya module here sends a Basic-cluster report every ~2.7 min, so this is ~8 missed heartbeats;
- 5 failed sends in a row ("Could not reach device") → unavailable ("No response to commands").

A 5 min grace after the app starts; the `availability_turned_on/off` flows fire once per transition. The app settings page shows message counts per device (Traffic) and a switch that turns availability tracking off.

## Rejoin detection

`lib/RejoinManager.js` fires the `..._device_rejoined` flow trigger. Two device-agnostic entry points, driven by lookup tables in `lib/constants.js`:

- **`notifyIfRejoinDatapoint(device, dp)`** — for devices whose rejoin signal is a known Tuya DP. The dimmer uses `DP.POWER_ON` (14): the device only re-reports its power-on-restore behavior after a real power cycle, not during normal operation.
- **`watchBootSignals(device)`** — the dimmer's DP 14 arrives inside the post-boot DP dump, which is often partly or fully lost while the router re-establishes its route. Two boot-only frames are watched as well: a Basic report with private attribute `0xFFE4 = 1` (always `0` in the steady-state heartbeat) and the Tuya heartbeat command `0x11`. Tested in `test/rejoin-boot-signal.test.js` (`npm test`).
- **`watchAnnounceFrame(device)`** — for devices whose rejoin signal is a raw, undocumented cluster frame. The radar sends a frame on cluster `0xEC03` (60419) — not documented in zigbee-herdsman, zigbee-herdsman-converters, or Tuya's own SDK docs — carrying its own manufacturer-name string as payload.

Both are debounced by `REJOIN_DEBOUNCE_MS` (30s) so a burst of repeated announces (e.g. one per sibling gang, or two closely-spaced real power cuts) only fires once.

### Caveat: settings writes can trigger a false rejoin

Both signals can also fire as a side effect of **us** writing a setting to the device, not just after a genuine rejoin:

- Writing `DP.POWER_ON` (changing the Power-On Behavior setting) makes the dimmer echo that DP back — indistinguishable from the DP appearing after a real rejoin.
- Sniffer capture (`analise/linptech- tuya - .pcapng`) showed the radar's `0xEC03` frame follows *any* config DP report (fading time, sensitivity, distance, LED indicator), not only the full resync burst that happens once after boot/rejoin. Frame 2000 in that capture decodes to a Tuya DP report (`dp=101` "fading time", value `120`) immediately followed by `0xEC03` — with no power cycle involved.

Both `onSettings()` handlers call a suppression method *before* writing, so the resulting echo doesn't get misread as a rejoin:

- `moes_dimmer_3_gang`: `RejoinManager.markSelfWrite(this, dp)` in `_writeEnumSetting()`.
- `moes_radar_sensor_mmwave`: `RejoinManager.suppressAnnounce(this)` at the top of `onSettings()`.

Adding rejoin detection to a new driver means one `constants.js` entry (`REJOIN_ANNOUNCE_DPS` or `REJOIN_ANNOUNCE_CLUSTERS`) plus one call from the driver — no per-device state to manage.

### Tried and rejected: configureReporting

Attempted `configureReporting` on the dimmer's `basic` cluster (`zclVersion`, short interval) to get it to self-report a heartbeat. The device never responded — timed out with no ack, not even a rejection. Consistent with its `attributeReportingStatus` attribute being stuck at `"PENDING"` in the pairing interview data. This firmware does not support attribute reporting configuration; don't retry this without new evidence. It turned out not to be needed: the module already sends a Basic report every ~2.7 min on its own (see Availability).
