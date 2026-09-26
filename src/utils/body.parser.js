// src/utils/body.parser.js

/**
 * Parses JSON payload from raw Node.js HTTP request streams.
 * Strips UTF-8 BOM markers and handles empty body payloads gracefully.
 * 
 * @param {import('http').IncomingMessage} req 
 * @returns {Promise<Object>}
 */
export function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    // Return early if stream has already been read or payload is empty
    const contentLength = parseInt(req.headers['content-length'] || '0', 10);
    if (contentLength === 0) {
      return resolve({});
    }

    let body = '';

    req.on('data', chunk => {
      body += chunk.toString('utf-8');
    });

    req.on('end', () => {
      try {
        if (!body || body.trim() === '') {
          return resolve({});
        }

        // Strip UTF-8 BOM (\uFEFF) and trim whitespace
        const cleanBody = body.replace(/^\uFEFF/, '').trim();
        
        resolve(JSON.parse(cleanBody));
      } catch (err) {
        reject(new Error('Invalid JSON payload'));
      }
    });

    req.on('error', err => reject(err));
  });
}