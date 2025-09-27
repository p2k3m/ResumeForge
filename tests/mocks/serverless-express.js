import request from 'supertest';

export const configure = ({ app }) => {
  return async (event) => {
    const method = (event.httpMethod || 'GET').toLowerCase();
    const path = event.path || '/';
    let req = request(app)[method](path);
    if (event.headers) {
      for (const [key, value] of Object.entries(event.headers)) {
        if (value !== undefined) req = req.set(key, value);
      }
    }
    if (event.body) {
      const payload = event.isBase64Encoded
        ? Buffer.from(event.body, 'base64').toString()
        : event.body;
      req = req.send(payload);
    }
    const response = await req;
    return {
      statusCode: response.status,
      body: response.text,
      headers: response.headers
    };
  };
};
