// Minimal server stub. The NVIDIA proxy (/ai/propose) lands in a later issue.
import http from 'node:http';
import { config, describeConfig } from './config.js';

const server = http.createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, config: describeConfig() }));
    return;
  }
  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('not found');
});

server.listen(config.port, () => {
  console.log('server listening on', config.port, describeConfig());
});
