// api/torrentio.js
// Vercel serverless proxy for Torrentio.
// Torrentio sends no Access-Control-Allow-Origin header, so the browser blocks
// direct fetches (CORS). This proxy fetches it server-side (no CORS there) and
// returns the JSON with an allow-origin header the browser accepts.
//
// Usage from the client:
//   /api/torrentio?path=<url-encoded torrentio path after the host>
// e.g. path = "qualityfilter=4k,1080p/stream/movie/tt1375666.json"

const TORRENTIO_HOST = 'https://torrentio.strem.fun';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { path } = req.query;
  if (!path) return res.status(400).json({ error: 'Missing path' });

  // Only allow Torrentio stream paths — never let this proxy fetch arbitrary URLs.
  const clean = String(path).replace(/^\/+/, '');
  if (!/(^|\/)stream\/(movie|series)\/[^/]+\.json$/.test(clean)) {
    return res.status(400).json({ error: 'Invalid Torrentio path' });
  }

  try {
    const controller = new AbortController();
    const timeout    = setTimeout(() => controller.abort(), 15000);
    const upstream   = await fetch(`${TORRENTIO_HOST}/${clean}`, { signal: controller.signal });
    clearTimeout(timeout);

    if (!upstream.ok) {
      return res.status(upstream.status).json({ error: `Torrentio ${upstream.status}`, streams: [] });
    }

    const data = await upstream.json().catch(() => ({ streams: [] }));
    // Cache at the edge for a bit — same title gets re-requested often.
    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate');
    return res.status(200).json(data);

  } catch (err) {
    console.error('[Torrentio Proxy] Error:', err.message);
    return res.status(500).json({ error: err.message, streams: [] });
  }
}
