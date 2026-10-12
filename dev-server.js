import http from 'node:http';
import handler from './api/chat.js';

http
  .createServer((req, res) => {
    if (!req.url.startsWith('/api/chat')) {
      res.statusCode = 404;
      return res.end();
    }

    let raw = '';
    req.on('data', chunk => (raw += chunk));
    req.on('end', () => {
      try {
        req.body = raw ? JSON.parse(raw) : {};
      } catch {
        req.body = {};
      }

      res.status = code => {
        res.statusCode = code;
        return res;
      };
      res.json = data => {
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify(data));
      };

      handler(req, res);
    });
  })
  .listen(3000, () => console.log('API jalan di http://localhost:3000'));