// Lightweight privacy-focused proxy for Vercel Serverless (Node 18+)
// Usage: GET/POST https://<domain>/api/api_proxy?url=https://example.com
// No auth, no IP filtering. Strips cookies and sensitive headers, sets generic UA and language.

export default async function handler(req, res) {
  const { url } = req.query;
  if (!url) {
    res.status(400).json({ error: 'URL parameter required.' });
    return;
  }

  let target = url;
  if (!/^https?:\/\//i.test(target)) target = 'https://' + target;

  const hopByHop = new Set([
    'connection',
    'keep-alive',
    'proxy-authenticate',
    'proxy-authorization',
    'te',
    'trailer',
    'transfer-encoding',
    'upgrade',
    'host',
  ]);

  const incoming = req.headers || {};
  const filteredHeaders = {};
  for (const [k, v] of Object.entries(incoming)) {
    const key = k.toLowerCase();
    if (hopByHop.has(key)) continue;
    if (key === 'cookie' || key === 'authorization' || key.startsWith('cf-') || key.startsWith('x-forwarded-')) continue;
    if (key === 'accept-language' || key === 'user-agent') continue;
    filteredHeaders[key] = v;
  }

  const customHeaders = {
    'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:115.0) Gecko/20100101 Firefox/115.0',
    'accept-language': 'en-US,en;q=0.9',
    ...filteredHeaders,
  };

  const method = (req.method || 'GET').toUpperCase();

  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,HEAD,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Accept,Authorization,Accept-Language,User-Agent');

  if (method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  try {
    const proxyRes = await fetch(target, {
      method,
      headers: customHeaders,
      body: ['GET', 'HEAD'].includes(method) ? undefined : req,
      redirect: 'follow',
    });

    const respHeaders = {};
    proxyRes.headers.forEach((v, k) => {
      const key = k.toLowerCase();
      if (key === 'set-cookie') return;
      if (hopByHop.has(key)) return;
      respHeaders[k] = v;
    });

    if (respHeaders['content-type']) {
      res.setHeader('Content-Type', respHeaders['content-type']);
      delete respHeaders['content-type'];
    }

    Object.entries(respHeaders).forEach(([k, v]) => res.setHeader(k, v));
    res.status(proxyRes.status);

    if (proxyRes.body && typeof proxyRes.body.pipe === 'function') {
      proxyRes.body.pipe(res);
    } else {
      const buf = Buffer.from(await proxyRes.arrayBuffer());
      res.end(buf);
    }
  } catch (e) {
    res.status(502).json({ error: 'Proxy error', detail: e.message });
  }
}