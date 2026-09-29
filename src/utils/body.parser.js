// src/utils/body.parser.js

/**
 * Parses JSON payload from raw Node.js HTTP request streams.
 * Strips UTF-8 BOM markers, handles empty body payloads gracefully,
 * enforces payload size limits, and logs detailed errors to terminal.
 * 
 * @param {import('http').IncomingMessage} req 
 * @param {number} [maxSizeBytes=52428800] Default limit: 50MB
 * @returns {Promise<Object>}
 */
export function parseJsonBody(req, maxSizeBytes = 50 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    // Return early if stream has already been read or payload is empty
    const contentLength = parseInt(req.headers['content-length'] || '0', 10);
    if (contentLength === 0) {
      return resolve({});
    }

    let body = '';
    let bytesReceived = 0;

    req.on('data', chunk => {
      bytesReceived += chunk.length;

      // Reject early if stream payload size exceeds the limit
      if (bytesReceived > maxSizeBytes) {
        console.error(
          `[Body Parser Error] Payload exceeded limit: ${bytesReceived} bytes (Limit: ${maxSizeBytes} bytes)`
        );
        req.destroy();
        return reject(new Error('Payload too large'));
      }

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
        console.error('[Body Parser Error] Failed to parse JSON:', err.message);
        console.error('Raw Payload Snapshot (first 200 chars):', body.slice(0, 200));
        reject(new Error('Invalid JSON payload'));
      }
    });

    req.on('error', err => {
      console.error('[Body Parser Error] Stream reading error:', err.message);
      reject(err);
    });
  });
}