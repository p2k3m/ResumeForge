export class SNSClient {
  constructor(config = {}) {
    this.config = config;
  }

  async send(command) {
    return { $metadata: { mock: true }, command };
  }
}

export class PublishCommand {
  constructor(input = {}) {
    this.input = input;
  }
}

export default {
  SNSClient,
  PublishCommand,
};
