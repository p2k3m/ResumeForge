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

export class ScanCommand {
  constructor(input) {
    this.input = input;
    this.__type = 'ScanCommand';
  }
}

export class DeleteItemCommand {
  constructor(input) {
    this.input = input;
    this.__type = 'DeleteItemCommand';
  }
}

export class GetItemCommand {
  constructor(input) {
    this.input = input;
    this.__type = 'GetItemCommand';
  }
}
