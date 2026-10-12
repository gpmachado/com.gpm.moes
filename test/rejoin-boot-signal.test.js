'use strict';

// Frames copied from real dimmer logs (rejoin-moes2.log, lean-moes01.log). Run: npm test
const test = require('node:test');
const assert = require('node:assert');
const RejoinManager = require('../lib/RejoinManager');

const signal = (clusterId, hex) => RejoinManager._bootSignal(clusterId, Buffer.from(hex, 'hex'));

test('Basic report with 0xFFE4 = 1 (first report after boot) is a boot signal', () => {
  assert.strictEqual(signal(0x0000, '08050a0100204ae2ff2038e4ff2001'), 'Basic 0xFFE4=1');
});

test('steady-state Basic heartbeat (0xFFE4 = 0) is not', () => {
  assert.strictEqual(signal(0x0000, '08d60a0100204ae2ff2038e4ff2000'), null);
});

test('Basic 0xFFDF string report (also after boot) is not, and does not throw', () => {
  assert.strictEqual(signal(0x0000, '08940adfff422808000000690900000069'), null);
});

test('Tuya heartbeat 0x11 is a boot signal', () => {
  assert.strictEqual(signal(0xEF00, '099111001740'), 'Tuya heartbeat 0x11');
});

test('Tuya DP report and short frames are not', () => {
  assert.strictEqual(signal(0xEF00, '09900200fa0e04000100'), null);
  assert.strictEqual(signal(0x0000, '0805'), null);
});
