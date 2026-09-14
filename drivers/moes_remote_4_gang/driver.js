'use strict';

const { ZigBeeDriver } = require('homey-zigbeedriver');

class MoesRemote4GangDriver extends ZigBeeDriver {

  async onInit() {
    await super.onInit();

    this.homey.flow.getActionCard('moes_remote_4_gang_simulate_press')
      .registerRunListener(async args => {
        args.device._applyButtonAction(Number(args.button), args.action);
      });
  }

}

module.exports = MoesRemote4GangDriver;
