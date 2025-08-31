export class DynamoDBClient {
  constructor() {}
  send() {
    return Promise.resolve({});
  }
}
export class CreateTableCommand {
  constructor(input) {
    this.input = input;
    this.__type = 'CreateTableCommand';
  }
}
export class DescribeTableCommand {
  constructor(input) {
    this.input = input;
    this.__type = 'DescribeTableCommand';
  }
}
export class PutItemCommand {
  constructor(input) {
    this.input = input;
    this.__type = 'PutItemCommand';
  }
}
