export class LambdaClient {
  constructor(config = {}) {
    this.config = config;
  }

  async send(command) {
    return { $metadata: { mock: true }, command };
  }
}

export class InvokeCommand {
  constructor(input = {}) {
    this.input = input;
  }
}

export default {
  LambdaClient,
  InvokeCommand,
};
