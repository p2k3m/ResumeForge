let cachedHandler;

export const handler = async (event, context) => {
    if (!cachedHandler) {
        try {
            // Lazy load dependencies to catch initialization errors
            await import('../config/environment.js');
            const { resumeUploadHttpHandler } = await import('../services/resumeUpload/httpHandler.js');
            cachedHandler = resumeUploadHttpHandler;
        } catch (error) {
            console.error('Lambda Initialization Failed:', error);
            return {
                statusCode: 500,
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
                    'Access-Control-Allow-Methods': 'OPTIONS,GET,POST,PUT,DELETE',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    success: false,
                    error: {
                        code: 'LAMBDA_INIT_ERROR',
                        message: 'Lambda initialization failed',
                        details: error.message,
                        stack: error.stack
                    }
                })
            };
        }
    }

    return cachedHandler(event, context);
};

export default handler;
