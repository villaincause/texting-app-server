// src/utils/body.parser.js
export function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString('utf-8');
    });
    req.on('end', () => {
      try {
        if (!body || body.trim() === '') {
          return resolve({});
        }
        // Strip UTF-8 BOM (\uFEFF) and trim leading/trailing whitespace
        const cleanBody = body.replace(/^\uFEFF/, '').trim();
        resolve(JSON.parse(cleanBody));
      } catch (err) {
        reject(new Error('Invalid JSON payload'));
      }
    });
    req.on('error', err => reject(err));
  });
}