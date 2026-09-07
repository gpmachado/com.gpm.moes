'use strict';

// Single source of truth — matches app.json "version" field.
const { version: APP_VERSION } = require('../app.json');

module.exports = {

  APP_VERSION,

  // Debug
  // true  -> verbose zigbee-clusters frame logging and extra app-side ZCL diagnostics.
  // false -> production logging.
  ZCL_DEBUG: true,

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
