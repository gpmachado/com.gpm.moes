'use strict';

// Single source of truth — matches app.json "version" field.
const { version: APP_VERSION } = require('../app.json');

module.exports = {

  APP_VERSION,

  // Debug
  // true  -> verbose zigbee-clusters frame logging and extra app-side ZCL diagnostics.
  // false -> production logging.
  ZCL_DEBUG: true,

  // Availability watchdog timeout
  // Time without any Zigbee frame before a device is marked unavailable.
  // Mains-powered device with active onOff/cluster-6 reporting every ≤10 min
  // (Moes dimmer). 2.5× the report interval.
  HEARTBEAT_FAST_MS: 25 * 60 * 1000, // 25 min

  // Poll before marking offline

  POLL_BEFORE_OFFLINE: true,
  POLL_TIMEOUT_MS: 10000,

  // Spreads the confirmation poll's timing across 0..this value. Prevents
  // several devices timing out on the same watchdog tick (e.g. a general
  // power outage followed by a simultaneous reconnect) from contending for
  // the Zigbee channel at once with concurrent readAttributes calls.
  POLL_JITTER_MAX_MS: 5000, // 5 s

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
