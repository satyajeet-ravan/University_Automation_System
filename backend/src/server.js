import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { config, isAllowedOrigin } from './config.js';
import routes from './routes.js';

const app = express();

// The built frontend can be served by this same server, giving a single link.
const frontendDist = fileURLToPath(new URL('../../frontend/dist', import.meta.url));
const serveFrontend = existsSync(`${frontendDist}/index.html`);

// Supabase is called from the browser (sign-in, photos), so allow it explicitly.
const supabaseHost = config.supabaseUrl ? new URL(config.supabaseUrl).host : '*.supabase.co';

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
      imgSrc: ["'self'", 'data:', 'blob:', `https://${supabaseHost}`],
      connectSrc: ["'self'", `https://${supabaseHost}`, `wss://${supabaseHost}`],
      objectSrc: ["'none'"],
      frameAncestors: ["'self'"],
      upgradeInsecureRequests: null
    }
  }
}));
app.use(cors({
  origin(origin, callback) {
    callback(null, isAllowedOrigin(origin));
  }
}));
app.use(express.json({ limit: '1mb' }));
app.use('/api', routes);

if (serveFrontend) {
  app.use(express.static(frontendDist));
  // Any other page is the single-page app; the router in the browser handles it.
  app.get(/^\/(?!api(\/|$)).*/, (_req, res) => {
    res.sendFile(`${frontendDist}/index.html`);
  });
}
app.use((err, req, res, _next) => {
  if (err?.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Request body must contain valid JSON.' });
  }
  console.error(`[api] ${req.method} ${req.path} failed:`, err?.message || 'unknown error');
  res.status(500).json({ error: 'Unexpected server error.' });
});

// Keep the API alive if a stray async failure escapes a route handler.
process.on('unhandledRejection', reason => {
  console.error('[api] Unhandled promise rejection:', reason?.message || reason);
});

const server = app.listen(config.port, () => {
  console.log(`University Automation API listening on http://localhost:${config.port}`);
  if (config.supabaseUrl && config.serviceRoleKey) {
    console.log('[config] Backend Supabase URL and service key are configured.');
  }
});

server.on('error', error => {
  if (error.code === 'EADDRINUSE') {
    console.error(`[startup] Port ${config.port} is already in use. Stop the existing CampusFlow backend before starting another instance.`);
  } else {
    console.error('[startup] Could not start the API server:', error.message);
  }
  process.exitCode = 1;
});
