import { Hono } from 'hono';
import type { Env } from './seed';
import { corsGuard } from './guard';
import { pub } from './public';
import { auth } from './auth';
import { admin } from './admin';

export const app = new Hono<{ Bindings: Env }>();

app.use('/api/*', corsGuard);
app.get('/api/health', c => c.json({ ok: true }));
app.route('/api', pub);
app.route('/api/auth', auth);
app.route('/api/admin', admin);
app.notFound(c => c.json({ error: 'not_found', message: 'Not found' }, 404));

export default {
  fetch: app.fetch,
} satisfies ExportedHandler<Env>;
