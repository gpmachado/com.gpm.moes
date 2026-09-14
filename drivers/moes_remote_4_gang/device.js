'use strict';

// Moes / Tuya TS0044 4-button scene remote (_TZ3000_wkai4ga5).
// Driver seeded from JohanBendz/com.tuya.zigbee (MIT); button protocol confirmed
// via sniffer and cross-checked against zigbee2mqtt (fz.tuya_on_off_action).
// Assets (icon/images) © Johan Bendz, MIT.
//
// Each button = an endpoint (1..4). A press is an onOff (cluster 6)
// cluster-specific command 0xFD; the press type is byte frame[3]:
//   0 = single, 1 = double, 2 = long.
// Buttons are exposed by NUMBER (1..4), not physical position, because the
// physical layout varies between firmwares (see Johan issues #270 / #793).

const { ZigBeeDevice } = require('homey-zigbeedriver');
const { CLUSTER } = require('zigbee-clusters');
const { TimeServerBoundCluster } = require('../../lib/TimeCluster');

const ACTION = { 0: 'single', 1: 'double', 2: 'long' };
const ACTION_LABEL = { single: '1 Click', double: '2 Clicks', long: 'Long Press' };
const IDLE_LABEL = 'Idle';
// Per-button tiles are momentary (revert to Idle); Last button/action/click stay sticky.
const IDLE_TIMEOUT_MS = 3_000;

class MoesRemote4Gang extends ZigBeeDevice {

  async onNodeInit({ zclNode }) {

    // Battery level (powerConfiguration, batteryPercentageRemaining: ZCL 0-200 -> %).
    // Sleepy device: don't read on start, just parse the spontaneous reports.
    if (this.hasCapability('measure_battery')) {
      this.registerCapability('measure_battery', CLUSTER.POWER_CONFIGURATION, {
        report: 'batteryPercentageRemaining',
        reportParser: v => (typeof v === 'number' ? Math.round(v / 2) : null),
        getOpts: { getOnStart: false },
      });
    }

    this._idleTimers = new Map();

    for (let ep = 1; ep <= 4; ep++) {
      const cap = `button${ep}_action`;
      if (this.hasCapability(cap) && this.getCapabilityValue(cap) == null) {
        this.setCapabilityValue(cap, IDLE_LABEL).catch(this.error);
      }
    }

    this._buttonTrigger = this.homey.flow.getDeviceTriggerCard('moes_remote_4_gang_button')
      .registerRunListener((args, state) => Number(args.button) === state.ep && args.action === state.pressType);

    try { zclNode.endpoints[1].bind('time', new TimeServerBoundCluster()); } catch {}

    // Wrap node.handleFrame (don't replace it): intercept the button commands on
    // cluster 6, but forward every other frame to the original handler so battery
    // reports (cluster 1) and normal ZCL processing keep working.
    // Guarded against re-installing on re-init: this.node can be reused by the
    // framework across an onNodeInit re-run, and wrapping handleFrame again on
    // the same node would stack interceptors indefinitely.
    const node = await this.homey.zigbee.getNode(this);
    if (node._moes4gFrameHookInstalled) {
      this.log('handleFrame hook already installed (shared node)');
    } else {
      node._moes4gFrameHookInstalled = true;
      const original = typeof node.handleFrame === 'function' ? node.handleFrame.bind(node) : null;
      node.handleFrame = (endpointId, clusterId, frame, meta) => {
        if (clusterId === 6) {
          this._parseButton(endpointId, frame);
          return false;
        }
        return original ? original(endpointId, clusterId, frame, meta) : false;
      };
    }
  }

  _parseButton(ep, frame) {
    // TS0044 emits the same press twice; the pair shares the ZCL transaction
    // sequence number (frame[1]). Skip an immediate repeat → one trigger per
    // press (fixes the double-fire reported in Johan issue #793).
    const tsn = frame[1];
    if (tsn === this._lastTsn) return;
    this._lastTsn = tsn;

    if (ep < 1 || ep > 4) return;
    this._applyButtonAction(ep, ACTION[frame[3]] ?? 'single');
  }

  /**
   * Fire the button trigger and update the Last button/action/click
   * capabilities, plus the per-button tile (which reverts to Idle after
   * IDLE_TIMEOUT_MS). Shared by real presses (_parseButton) and the
   * "Simulate button press" flow action.
   * @param {number} ep - 1..4
   * @param {'single'|'double'|'long'} pressType
   */
  _applyButtonAction(ep, pressType) {
    this._buttonTrigger.trigger(this, {}, { ep, pressType })
      .then(() => this.log('Button:', `${ep}-${pressType}`))
      .catch(err => this.error('Button trigger failed:', err));

    const label = ACTION_LABEL[pressType] ?? pressType;
    this.setCapabilityValue('last_button', ep).catch(this.error);
    this.setCapabilityValue('last_action', label).catch(this.error);
    this.setCapabilityValue(`button${ep}_action`, label).catch(this.error);

    const existingTimer = this._idleTimers.get(ep);
    if (existingTimer) clearTimeout(existingTimer);
    this._idleTimers.set(ep, setTimeout(() => {
      this.setCapabilityValue(`button${ep}_action`, IDLE_LABEL).catch(this.error);
    }, IDLE_TIMEOUT_MS));

    let tz = 'UTC';
    try {
      const result = this.homey.clock.getTimezone();
      if (typeof result === 'string' && result.length > 0) tz = result;
    } catch { /* use UTC fallback */ }
    const timestamp = new Intl.DateTimeFormat('en-GB', {
      timeZone: tz,
      dateStyle: 'short',
      timeStyle: 'medium',
    }).format(new Date());
    this.setCapabilityValue('last_click', timestamp).catch(this.error);
  }

  onDeleted() {
    if (this._idleTimers) {
      for (const timer of this._idleTimers.values()) clearTimeout(timer);
    }
    this.log('Moes 4 Gang Wall Remote removed');
  }

}

module.exports = MoesRemote4Gang;
