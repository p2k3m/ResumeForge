export class SQSClient {
  constructor(config = {}) {
    this.config = config;
  }

  async send(command) {
    return { $metadata: { mock: true }, command };
  }
}

export class SendMessageCommand {
  constructor(input = {}) {
    this.input = input;
  }
}

export default {
  SQSClient,
  SendMessageCommand,
};
