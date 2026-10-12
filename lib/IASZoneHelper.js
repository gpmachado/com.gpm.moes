'use strict';

const { CLUSTER } = require('zigbee-clusters');

const DEFAULT_ENDPOINT_ID = 1;
const DEFAULT_ZONE_ID = 1;

const IAS_BITS = {
  alarm1: 0x0001,
  alarm2: 0x0002,
  tamper: 0x0004,
  battery: 0x0008,
  trouble: 0x0040,
  acMains: 0x0080,
  test: 0x0100,
  batteryDefect: 0x0200,
};

class IASZoneHelper {

  constructor(device, options = {}) {
    this.device = device;
    this.endpointId = options.endpointId ?? DEFAULT_ENDPOINT_ID;
    this.zoneId = options.zoneId ?? DEFAULT_ZONE_ID;
    this.sendEnrollOnInit = options.sendEnrollOnInit !== false;
    this.readInitialState = options.readInitialState !== false;
    this.onStatus = options.onStatus;
    this.onActivity = options.onActivity;
    this._iasZone = null;
    this._onAttrZoneStatus = null;
    this._onZoneStatusChangeNotification = null;
    this._onZoneEnrollRequest = null;
  }

  async init(zclNode) {
    const iasZone = zclNode?.endpoints?.[this.endpointId]?.clusters?.[CLUSTER.IAS_ZONE.NAME];
    if (!iasZone) {
      this.device.error(`[IAS] Cluster missing on endpoint ${this.endpointId}`);
      return null;
    }

    this._iasZone = iasZone;
    this._installListeners();

    if (this.readInitialState) {
      await this.readInitialStatus('init');
    }

    if (this.sendEnrollOnInit) {
      await this.sendEnrollResponse('init');
    }

    return iasZone;
  }

  _installListeners() {
    const iasZone = this._iasZone;

    this._onZoneEnrollRequest = () => {
      this.device.log('[IAS] Enroll request received');
      this.sendEnrollResponse('request').catch(err => {
        this.device.error('[IAS] Enroll response failed:', err.message);
      });
    };
    iasZone.onZoneEnrollRequest = this._onZoneEnrollRequest;

    this._onZoneStatusChangeNotification = payload => {
      this._notifyActivity('ias-report');
      const zoneStatus = payload?.zoneStatus;
      this.device.log('[IAS] Status change -- raw:', zoneStatus);
      this._emitStatus(zoneStatus, { source: 'notification', payload });
    };
    iasZone.onZoneStatusChangeNotification = this._onZoneStatusChangeNotification;

    if (typeof iasZone.on === 'function') {
      this._onAttrZoneStatus = zoneStatus => {
        this._notifyActivity('ias-attr');
        this.device.log('[IAS] attr.zoneStatus report received:', zoneStatus);
        this._emitStatus(zoneStatus, { source: 'attribute' });
      };
      iasZone.removeListener?.('attr.zoneStatus', this._onAttrZoneStatus);
      iasZone.on('attr.zoneStatus', this._onAttrZoneStatus);
    }
  }

  async readInitialStatus(source = 'read') {
    if (!this._iasZone?.readAttributes) return null;

    try {
      const attrs = await this._iasZone.readAttributes(['zoneState', 'zoneStatus', 'zoneId']);
      this._notifyActivity(`ias-${source}`);
      this.device.log(`[IAS] zoneState=${attrs.zoneState} zoneId=${attrs.zoneId}`);
      if (attrs.zoneStatus !== undefined) {
        this._emitStatus(attrs.zoneStatus, { source, attrs });
      }
      return attrs;
    } catch (err) {
      this.device.log('[IAS] Could not read initial attributes (non-fatal):', err.message);
      return null;
    }
  }

  async sendEnrollResponse(source = 'manual') {
    if (!this._iasZone?.zoneEnrollResponse) return false;

    try {
      await this._iasZone.zoneEnrollResponse({ enrollResponseCode: 0, zoneId: this.zoneId });
      this.device.log(`[IAS] Enroll response sent (${source}, zoneId=${this.zoneId})`);
      return true;
    } catch (err) {
      this.device.log(`[IAS] Enroll response skipped (${source}, non-fatal):`, err.message);
      return false;
    }
  }

  dispose() {
    if (this._iasZone && this._onAttrZoneStatus) {
      this._iasZone.removeListener?.('attr.zoneStatus', this._onAttrZoneStatus);
    }
    if (this._iasZone?.onZoneEnrollRequest === this._onZoneEnrollRequest) {
      this._iasZone.onZoneEnrollRequest = null;
    }
    if (this._iasZone?.onZoneStatusChangeNotification === this._onZoneStatusChangeNotification) {
      this._iasZone.onZoneStatusChangeNotification = null;
    }
  }

  _emitStatus(zoneStatus, context) {
    if (typeof this.onStatus === 'function') {
      this.onStatus(zoneStatus, context);
    }
  }

  _notifyActivity(source) {
    if (typeof this.onActivity === 'function') {
      this.onActivity(source);
    }
  }

  static toUint16(value) {
    if (Buffer.isBuffer(value)) return value.length >= 2 ? value.readUInt16LE(0) : value[0] || 0;
    if (value?.type === 'Buffer' && Array.isArray(value.data)) {
      return IASZoneHelper.toUint16(Buffer.from(value.data));
    }
    if (typeof value === 'number') return value;
    if (value && typeof value === 'object') {
      return Object.entries(IAS_BITS).reduce(
        (acc, [key, mask]) => (value[key] ? acc | mask : acc),
        0
      );
    }
    return 0;
  }

  static hasAlarm(value) {
    const bitmap = IASZoneHelper.toUint16(value);
    return !!(bitmap & (IAS_BITS.alarm1 | IAS_BITS.alarm2));
  }
}

module.exports = IASZoneHelper;
module.exports.IAS_BITS = IAS_BITS;
