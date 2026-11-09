// Local preview with the API routes: node scripts/dev.js [port]
// Serves the static pages with Vercel-style clean URLs and mounts api/*.js the
// way Vercel does (one Node function per file). With no Redis env vars the
// messages live in memory; set ADMIN_CODE to try the admin page.
'use strict';
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const PORT = Number(process.argv[2] || process.env.PORT || 3000);
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.json': 'application/json', '.ico': 'image/x-icon', '.webp': 'image/webp' };

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname.startsWith('/api/')) {
    const file = path.join(ROOT, url.pathname.replace(/\/$/, '') + '.js');
    if (!fs.existsSync(file) || path.basename(file).startsWith('_')) { res.statusCode = 404; return res.end('no such function'); }
    delete require.cache[require.resolve(file)];
    try { await require(file)(req, res); } catch (e) { console.error(e); res.statusCode = 500; res.end('function error: ' + e.message); }
    return;
  }
  let p = decodeURIComponent(url.pathname);
  let file = path.join(ROOT, p);
  if (p.endsWith('/')) file = path.join(file, 'index.html');
  else if (!path.extname(file) && fs.existsSync(file + '.html')) file += '.html';
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.statusCode = 404; return res.end('not found'); }
  res.setHeader('Content-Type', TYPES[path.extname(file)] || 'application/octet-stream');
  fs.createReadStream(file).pipe(res);
}).listen(PORT, () => console.log(`Founder Square dev server: http://localhost:${PORT}  (ADMIN_CODE ${process.env.ADMIN_CODE ? 'set' : 'not set'}, Redis ${process.env.KV_REST_API_URL ? 'on' : 'off'}, Resend ${process.env.RESEND_API_KEY ? 'on' : 'off'})`));
