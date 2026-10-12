/**
 * TuyaSpecificClusterDevice.js: base class for Tuya DP (cluster 0xEF00) devices. Waits for the
 * Tuya cluster, binds the Time server, writes datapoints with retry and parses incoming ones.
 */

'use strict';

const { ZigBeeDevice } = require('homey-zigbeedriver');
const { AvailabilityManagerPassive } = require('./AvailabilityManager');
const { TimeServerBoundCluster, BasicSilentBoundCluster } = require('./TimeCluster');
const { getNodeDevices, updateSiblingNames } = require('./connectedDevices');

class TuyaSpecificClusterDevice extends ZigBeeDevice {

  // CONFIG

  /** Override in subclass for non-standard endpoint */
  tuyaEndpoint = 1;

  // TRANSACTION ID

  _transactionID = 0;

  /** Auto-incrementing, wraps at 256 */
  get transactionID() {
    return this._transactionID++ % 256;
  }

  // DEVICE READINESS

  /**
   * True when zclNode + endpoint + tuya cluster are all accessible.
   * @returns {boolean}
   */
  isDeviceReady() {
    return !!(this.zclNode?.endpoints?.[this.tuyaEndpoint]?.clusters?.tuya);
  }

  /**
   * Wait for device ready using exponential backoff.
   * 250 → 500 → 1000ms (capped), up to maxMs total.
   *
   * @param {number} [maxMs=10000]
   * @throws {Error} if not ready within maxMs
   */
  async waitForDeviceReady(maxMs = 10000) {
    const start = Date.now();
    let delayMs = 250;

    while (!this.isDeviceReady()) {
      if (Date.now() - start > maxMs) {
        throw new Error(`[TuyaDevice] Not ready after ${maxMs}ms`);
      }
      await new Promise(r => this.homey.setTimeout(r, delayMs));
      delayMs = Math.min(delayMs * 2, 1000);
    }
  }

  // LIFECYCLE

  /**
   * Waits for Tuya cluster before handing off to subclass.
   * Subclasses must call: await super.onNodeInit(props)
   */
  async onNodeInit(props) {
    await super.onNodeInit(props);
    try {
      await this.waitForDeviceReady();
      this.log('[TuyaDevice] cluster ready');

      // Suppress "binding_unavailable" log spam from Tuya devices that send
      // Time cluster (0x000A) frames as OUTPUT clusters. endpoint.bind()
      // registers a BoundCluster on the local endpoint regardless of whether
      // the remote declares the cluster as input, so always attempt it.
      try {
        const ep1 = this.zclNode?.endpoints?.[1];
        ep1?.bind('time',  new TimeServerBoundCluster({ getTimeZone: () => this.homey.clock.getTimezone() }));
        ep1?.bind('basic', new BasicSilentBoundCluster());
      } catch (err) { }

    } catch (err) {
      this.error('[TuyaDevice] waitForDeviceReady failed:', err.message);
    }
  }

  // WRITE METHODS (with exponential backoff retry)

  /**
   * Write boolean datapoint with retry
   * @param {number} dp - Datapoint
   * @param {boolean} value - Boolean value
   * @param {number} [maxRetries=2] - Max retry attempts
   * @param {number} [baseDelay=300] - Base delay in ms (exponential backoff)
   */
  async writeBool(dp, value, maxRetries = 2, baseDelay = 300) {
    if (typeof value !== 'boolean') {
      throw new Error(`writeBool: expected boolean, got ${typeof value}`);
    }
    return this._sendTuyaDatapoint(dp, 1, Buffer.from([value ? 1 : 0]), maxRetries, baseDelay);
  }

  /**
   * Write 32-bit value datapoint with retry
   * @param {number} dp - Datapoint
   * @param {number} value - Uint32 value
   * @param {number} [maxRetries=2] - Max retry attempts
   * @param {number} [baseDelay=300] - Base delay in ms
   */
  async writeData32(dp, value, maxRetries = 2, baseDelay = 300) {
    if (!Number.isInteger(value) || value < 0 || value > 0xFFFFFFFF) {
      throw new Error(`writeData32: invalid uint32: ${value}`);
    }
    const buf = Buffer.alloc(4);
    buf.writeUInt32BE(value, 0);
    return this._sendTuyaDatapoint(dp, 2, buf, maxRetries, baseDelay);
  }

  /**
   * Write enum datapoint with retry
   * @param {number} dp - Datapoint
   * @param {number} value - Enum value (0-255)
   * @param {number} [maxRetries=2] - Max retry attempts
   * @param {number} [baseDelay=300] - Base delay in ms
   */
  async writeEnum(dp, value, maxRetries = 2, baseDelay = 300) {
    if (!Number.isInteger(value) || value < 0 || value > 255) {
      throw new Error(`writeEnum: invalid enum: ${value}`);
    }
    return this._sendTuyaDatapoint(dp, 4, Buffer.from([value]), maxRetries, baseDelay);
  }

  /**
   * Alias for writeData32 (legacy compatibility)
   */
  async writeValue(dp, value, maxRetries = 2, baseDelay = 300) {
    return this.writeData32(dp, value, maxRetries, baseDelay);
  }

  /**
   * Send Tuya datapoint with exponential backoff retry
   * @private
   * @param {number} dp - Datapoint
   * @param {number} datatype - Data type (0=raw, 1=bool, 2=value, 3=string, 4=enum)
   * @param {Buffer} data - Data buffer
   * @param {number} [maxRetries=2] - Max retry attempts
   * @param {number} [baseDelay=300] - Base delay in ms
   */
  async _sendTuyaDatapoint(dp, datatype, data, maxRetries = 2, baseDelay = 300) {
    let lastError;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        // Check device ready
        const ep = this.zclNode?.endpoints?.[this.tuyaEndpoint];
        if (!ep?.clusters?.tuya) {
          throw new Error(`[TuyaDevice] tuya cluster not on ep${this.tuyaEndpoint}`);
        }

        // Send datapoint
        await ep.clusters.tuya.datapoint({
          status: 0,
          transid: this.transactionID,
          dp,
          datatype,
          length: data.length,
          data
        });

        // Success
        if (attempt > 0) {
          this.log(`[TuyaDevice] DP${dp} succeeded on attempt ${attempt + 1}`);
        }
        return;

      } catch (err) {
        lastError = err;

        // Don't retry if last attempt
        if (attempt < maxRetries) {
          // Exponential backoff with proportional jitter to avoid thundering herd:
          // base: 300ms → 600ms → 1200ms, plus random 0..baseDelay to desync retries
          const delay = (baseDelay * Math.pow(2, attempt)) + Math.floor(Math.random() * baseDelay);
          this.log(`[TuyaDevice] DP${dp} retry ${attempt + 1}/${maxRetries}, waiting ${delay}ms...`);
          await new Promise(resolve => this.homey.setTimeout(resolve, delay));
        }
      }
    }

    // All retries failed
    this.error(`[TuyaDevice] DP${dp} failed after ${maxRetries + 1} attempts:`, lastError.message);
    throw lastError;
  }

  // DATAPOINT PARSING

  /**
   * Parse a Tuya datapoint value object into a JavaScript type.
   *
   * @param {Object} dpValue
   * @param {number} dpValue.datatype - 0=raw, 1=bool, 2=value, 3=string, 4=enum, 5=bitmap
   * @param {Buffer|Array<number>} dpValue.data
   * @returns {boolean|number|string|Buffer}
   */
  _parseDataValue(dpValue) {
    switch (dpValue.datatype) {
      case 0: return dpValue.data;
      case 1: return dpValue.data[0] === 1;
      case 2: return this._bufToUint32(dpValue.data);
      case 3: return String.fromCharCode(...dpValue.data);
      case 4: return dpValue.data[0];
      case 5: return this._bufToUint32(dpValue.data);
      default: throw new Error(`Unsupported datatype: ${dpValue.datatype}`);
    }
  }

  /**
   * Convert a big-endian byte array to an unsigned 32-bit integer.
   *
   * @param {Buffer|Array<number>} buf
   * @returns {number}
   */
  _bufToUint32(buf) {
    return buf.reduce((acc, b) => (acc << 8) | b, 0);
  }

  // CONNECTED DEVICES (siblings)

  /**
   * Returns all Homey device instances sharing this physical Zigbee node.
   * Delegates to connectedDevices.getNodeDevices — drivers no longer need
   * their own copy of this logic.
   *
   * @returns {Array}
   */
  _getNodeDevices() {
    return getNodeDevices(this);
  }

  /**
   * Get siblings via ieeeAddress, optionally sort, and write labels.
   *
   * @param {object}  [opts]
   * @param {boolean} [opts.mainOnly=false]  skip if this is not the main sub-device
   * @param {Function}[opts.sortFn]          comparator for Array.sort()
   */
  async _updateSiblingNames(opts) {
    await updateSiblingNames(this, opts);
  }


  // onUninit fires on re-init/restart (onDeleted only on user removal).
  // Subclasses may override _teardown to add their own cleanup (timers etc.).
  async onUninit() {
    await this._teardown();
  }

  /** Idempotent cleanup — safe to call from both onUninit and onDeleted. */
  async _teardown() {
    await this._availability?.uninstall().catch(() => {});
  }

  /** Install passive availability tracking (main device only; the manager cascades to siblings). */
  async _installAvailability() {
    const { HEARTBEAT_FAST_MS } = require('./constants');
    this._availability = new AvailabilityManagerPassive(this, { timeout: HEARTBEAT_FAST_MS });
    await this._availability.install();
  }
}

module.exports = TuyaSpecificClusterDevice;
