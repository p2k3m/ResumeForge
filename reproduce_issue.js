
import { handler } from './lambdas/clientApp.js';

const event = {
    path: '/assets/inter-latin-wght-normal-3100e775.woff2',
    httpMethod: 'GET',
    headers: {},
    requestContext: {
        stage: 'prod'
    }
};

async function run() {
    try {
        const response = await handler(event, {});
        console.log('Response statusCode:', response.statusCode);
        console.log('Response headers:', response.headers);
        console.log('isBase64Encoded:', response.isBase64Encoded);
        if (response.body) {
            console.log('Body length:', response.body.length);
            console.log('Body start (first 20 chars):', response.body.substring(0, 20));

            if (response.isBase64Encoded) {
                const decoded = Buffer.from(response.body, 'base64');
                console.log('Decoded first 4 bytes (hex):', decoded.subarray(0, 4).toString('hex'));
                console.log('Decoded first 4 bytes (ascii):', decoded.subarray(0, 4).toString('ascii'));
            } else {
                console.log('Body first 4 bytes (hex):', Buffer.from(response.body).subarray(0, 4).toString('hex'));
            }
        }
    } catch (error) {
        console.error('Error:', error);
    }
}

run();
