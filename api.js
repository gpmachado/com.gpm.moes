'use strict';

/**
 * App Settings API.
 */
module.exports = {
  async getRejoinStats({ homey }) {
    const drivers = homey.drivers.getDrivers();
    const devices = [];

    for (const driver of Object.values(drivers)) {
      for (const device of driver.getDevices()) {
        devices.push({
          id: device.getId(),
          name: device.getName(),
          rejoinCount: device.getStoreValue?.('rejoin_count') ?? 0,
          rejoinLastAt: device.getStoreValue?.('rejoin_last_at') ?? null,
        });
      }
    }

    return {
      since: homey.settings.get('rejoin_tracking_since') || null,
      devices,
    };
  },

  async resetRejoinStats({ homey }) {
    const drivers = homey.drivers.getDrivers();
    const writes = [];

    for (const driver of Object.values(drivers)) {
      for (const device of driver.getDevices()) {
        if (device.getStoreValue?.('rejoin_count') !== undefined) {
          writes.push(device.setStoreValue('rejoin_count', 0));
          writes.push(device.setStoreValue('rejoin_last_at', null));
        }
      }
    }

    await Promise.allSettled(writes);
    homey.settings.set('rejoin_tracking_since', Date.now());

    return { since: homey.settings.get('rejoin_tracking_since') };
  },
};
