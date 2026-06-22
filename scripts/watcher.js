// File watcher: monitors INBOX_PATH for new screenshots and ingests them.
// Runs as a separate process alongside `next dev`.
// Uses require() so it runs without tsx/ts-node.

// Load .env.local manually without dotenv dependency
const fs = require('fs');
const envFile = fs.existsSync('.env.local') ? '.env.local' : '.env';
if (fs.existsSync(envFile)) {
  fs.readFileSync(envFile, 'utf8').split('\n').forEach(line => {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m) process.env[m[1].trim()] = m[2].trim();
  });
}

const path = require('path');
const chokidar = require('chokidar');
const https = require('https');
const http = require('http');

const INBOX = process.env.INBOX_PATH || './inbox';
const PORT = process.env.PORT || 3000;

console.log(`[watcher] Watching: ${INBOX}`);
console.log(`[watcher] Will call http://localhost:${PORT}/api/ingest on new files`);

function callIngest(filePath) {
  const body = JSON.stringify({ file: filePath });
  const options = {
    hostname: 'localhost',
    port: PORT,
    path: '/api/ingest',
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
  };

  const req = http.request(options, (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
      try {
        const json = JSON.parse(data);
        console.log(`[watcher] ${json.message || JSON.stringify(json)}`);
      } catch {
        console.log(`[watcher] Response: ${data}`);
      }
    });
  });

  req.on('error', (e) => {
    // Next.js may still be starting up — retry once after 5s
    if (e.code === 'ECONNREFUSED') {
      console.log(`[watcher] Server not ready yet, retrying in 5s...`);
      setTimeout(() => callIngest(filePath), 5000);
    } else {
      console.error(`[watcher] Error: ${e.message}`);
    }
  });

  req.write(body);
  req.end();
}

// Wait 3s for Next.js to start before setting up watcher
setTimeout(() => {
  const watcher = chokidar.watch(INBOX, {
    persistent: true,
    ignoreInitial: false,
    awaitWriteFinish: { stabilityThreshold: 1500, pollInterval: 200 },
  });

  watcher
    .on('add', (filePath) => {
      if (/\.(png|jpg|jpeg|webp|bmp|tiff?)$/i.test(filePath)) {
        console.log(`[watcher] New file: ${path.basename(filePath)}`);
        callIngest(filePath);
      }
    })
    .on('error', (err) => console.error(`[watcher] Watcher error: ${err}`));
}, 3000);
