'use strict';

// Single source of truth — matches app.json "version" field.
const { version: APP_VERSION } = require('../app.json');

module.exports = {

  APP_VERSION,

  // Debug
  // true  -> verbose zigbee-clusters frame logging and extra app-side ZCL diagnostics.
  // false -> production logging.
  ZCL_DEBUG: false,

  // Availability watchdog timeout
  // Time without any Zigbee frame before a device is marked unavailable.
  // Mains-powered device with active onOff/cluster-6 reporting every ≤10 min
  // (Moes dimmer). 2.5× the report interval.
  HEARTBEAT_FAST_MS: 25 * 60 * 1000, // 25 min

  // Poll antes de marcar offline

  POLL_BEFORE_OFFLINE: true,
  POLL_TIMEOUT_MS: 10000,

  // Espalha o instante do poll de confirmação entre 0 e este valor.
  // Evita que vários dispositivos expirando no mesmo tick do watchdog
  // (ex.: queda de energia geral seguida de reconexão simultânea) disputem
  // o canal Zigbee ao mesmo tempo com readAttributes concorrentes.
  POLL_JITTER_MAX_MS: 5000, // 5 s

};
