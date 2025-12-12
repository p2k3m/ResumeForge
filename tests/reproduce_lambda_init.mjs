
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Mock Environment Variables
process.env.AWS_REGION = 'us-east-1';
process.env.AWS_LAMBDA_FUNCTION_NAME = 'ResumeForge-prod-client-app';
// process.env.S3_BUCKET = 'test-bucket';
// process.env.GEMINI_API_KEY = 'test-key';
// process.env.CLOUDFRONT_ORIGINS = '*';
process.env.LOG_LEVEL = 'debug';

const lambdaPath = path.resolve(__dirname, '../dist/lambda_debug/lambdas/resumeUpload.mjs');

console.log(`Attempting to import Lambda handler from: ${lambdaPath}`);

if (!fs.existsSync(lambdaPath)) {
    console.error(`ERROR: Lambda artifact not found at ${lambdaPath}`);
    process.exit(1);
}

try {
    const module = await import(lambdaPath);
    console.log('Successfully imported Lambda module.');

    if (typeof module.handler === 'function') {
        console.log('Handler function exported successfully. Attempting invocation...');

        const event = {
            path: '/api/process-cv',
            httpMethod: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            requestContext: {
                stage: 'prod'
            },
            body: JSON.stringify({ test: 'data' })
        };

        const context = {
            callbackWaitsForEmptyEventLoop: true
        };

        try {
            const result = await module.handler(event, context);
            console.log('Handler invoked successfully.');
            console.log('Result status:', result.statusCode);
            console.log('Result headers:', result.headers);
            console.log('Result body:', result.body);
        } catch (invokeError) {
            console.error('ERROR: Handler invocation failed.');
            console.error(invokeError);
        }

    } else {
        console.error('ERROR: Module does not export a "handler" function.');
        console.log('Exports:', Object.keys(module));
    }
} catch (error) {
    console.error('ERROR: Failed to import Lambda module.');
    console.error(error);
    process.exit(1);
}
