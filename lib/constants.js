'use strict';

// Single source of truth — matches app.json "version" field.
const { version: APP_VERSION } = require('../app.json');

module.exports = {

  APP_VERSION,

  // Debug
  // true  -> verbose zigbee-clusters frame logging and extra app-side ZCL diagnostics.
  // false -> production logging.
  ZCL_DEBUG: false,

  // Availability watchdog
  // Silence (no Zigbee frame at all) before a device is marked unavailable ("No activity for
  // Nmin"). Every Tuya module here sends a Basic-cluster attribute report (0x0001 appVersion +
  // private 0xFFE2/0xFFE4) every ~2.7 min - measured on the dimmer and radar, max gap 3.0 min
  // over 74 min - so 25 min is ~8 missed heartbeats. See lib/AvailabilityManager.js for the
  // other two signals (any frame restores; 5 failed sends in a row mark unavailable).
  HEARTBEAT_FAST_MS: 25 * 60 * 1000, // 25 min

  // homey.settings key (settings page switch): when its stored value is exactly `false`, no
  // device is ever marked unavailable (lib/AvailabilityManager.js#_isGloballyEnabled). Absent,
  // or any other value, means enabled.
  AVAILABILITY_ENABLED_SETTING_KEY: 'availability_enabled',

  // Hourly log of inbound frame counts per endpoint/cluster — used to
  // observe each device's real reporting cadence.
  AVAILABILITY_STATS_LOG_MS: 60 * 60 * 1000, // 1 h

  // "Announce" cluster ID emitted once by the device right after a Zigbee
  // (re)join — used by RejoinManager.watchAnnounceFrame() as the rejoin
  // signal. Not documented in zigbee-herdsman, zigbee-herdsman-converters or
  // Tuya's own SDK docs; confirmed empirically per model (4/4 power-cycles
  // on the Linptech radar, 0/2 in unrelated sessions). Each device model
  // uses its own packet, so this is keyed by driver id.
  REJOIN_ANNOUNCE_CLUSTERS: {
    moes_radar_sensor_mmwave: 0xEC03,
  },

  // Tuya datapoint that only fires on power restore — used by
  // RejoinManager.notifyIfRejoinDatapoint() as the rejoin signal for devices
  // whose protocol is a DP inside the standard tuya cluster (0xEF00) rather
  // than a raw unregistered cluster frame. Keyed by driver id.
  REJOIN_ANNOUNCE_DPS: {
    moes_dimmer_3_gang: 14, // DP.POWER_ON
  },

  // Burst cooldown: the announce DP/frame can repeat in quick succession
  // (e.g. one per sibling gang) — only the first within this window counts.
  REJOIN_DEBOUNCE_MS: 30_000,

};
