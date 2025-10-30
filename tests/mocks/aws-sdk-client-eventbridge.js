export class EventBridgeClient {
  constructor(config = {}) {
    this.config = config;
  }

  async send(command) {
    return { $metadata: { mock: true }, command };
  }
}

export class PutEventsCommand {
  constructor(input = {}) {
    this.input = input;
  }
}

export default {
  EventBridgeClient,
  PutEventsCommand,
};
