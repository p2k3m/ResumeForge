export class CloudWatchClient {
  constructor(config = {}) {
    this.config = config;
  }

  async send(command) {
    return { $metadata: { mock: true }, command };
  }
}

export class PutMetricDataCommand {
  constructor(input = {}) {
    this.input = input;
  }
}

export default {
  CloudWatchClient,
  PutMetricDataCommand,
};
