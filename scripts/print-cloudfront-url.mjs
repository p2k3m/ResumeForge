#!/usr/bin/env node
import { CloudFormationClient, DescribeStacksCommand } from "@aws-sdk/client-cloudformation";

const [, , stackName] = process.argv;

if (!stackName) {
  console.error("Usage: npm run print:cloudfront-url -- <stack-name>");
  process.exitCode = 1;
  process.exit();
}

const client = new CloudFormationClient({});

try {
  const response = await client.send(new DescribeStacksCommand({ StackName: stackName }));
  const stack = response.Stacks?.[0];

  if (!stack) {
    console.error(`Stack '${stackName}' not found.`);
    process.exitCode = 1;
    process.exit();
  }

  const outputs = stack.Outputs ?? [];
  const cloudFrontOutput = outputs.find((output) => output.OutputKey === "CloudFrontUrl")
    ?? outputs.find((output) => output.OutputKey === "AppBaseUrl");

  if (!cloudFrontOutput?.OutputValue) {
    console.error(
      "The stack does not contain a CloudFrontUrl (or AppBaseUrl) output. Ensure the stack was deployed with the provided template."
    );
    process.exitCode = 1;
    process.exit();
  }

  console.log(cloudFrontOutput.OutputValue);
} catch (error) {
  if (error?.name === "ValidationError") {
    console.error(`Unable to describe stack '${stackName}'. Confirm the name and AWS credentials/region.`);
  } else {
    console.error(error instanceof Error ? error.message : error);
  }
  process.exitCode = 1;
}
