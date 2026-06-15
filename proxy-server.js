const http = require('http');
const https = require('https');
const url = require('url');

const PROXY_PORT = process.env.PROXY_PORT || 3001;
const API_KEY = process.env.PROXY_API_KEY || 'sk-62db71312d81415b93c059eec68e7a27';
const TARGET_HOST = 'dashscope.aliyuncs.com';
const TARGET_PATH = '/compatible-mode/v1/chat/completions';

const server = http.createServer((req, res) => {
  // 设置 CORS 头，允许同源访问
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.url === '/jijin/api/chat' && req.method === 'POST') {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
    });
    req.on('end', () => {
      console.log(`[${new Date().toISOString()}] Proxy request: ${req.method} ${req.url}, body length: ${body.length}`);
      const proxyReq = https.request(
        {
          hostname: TARGET_HOST,
          path: TARGET_PATH,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${API_KEY}`,
            'Content-Length': Buffer.byteLength(body)
          }
        },
        (proxyRes) => {
          console.log(`[${new Date().toISOString()}] Dashscope response: ${proxyRes.statusCode}`);
          res.writeHead(proxyRes.statusCode, proxyRes.headers);
          proxyRes.pipe(res);
        }
      );

      proxyReq.on('error', (e) => {
        console.error(`[${new Date().toISOString()}] Proxy request error:`, e.message);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Proxy request failed', message: e.message }));
      });

      proxyReq.write(body);
      proxyReq.end();
    });
  } else {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not Found' }));
  }
});

server.listen(PROXY_PORT, () => {
  console.log(`AI proxy server listening on port ${PROXY_PORT}`);
  console.log(`Forwarding /jijin/api/chat -> https://${TARGET_HOST}${TARGET_PATH}`);
});
