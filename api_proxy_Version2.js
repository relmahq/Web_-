// Vercel/Node serverless handler: Lightweight privacy-focused proxy without IP allow/deny.
// Notes:
// - No auth. Open endpoint, use responsibly.
// - Strips cookies and sensitive headers; sets generic UA and language.
// - Streams responses (supports text, JSON, binary) without buffering entire body.
// - Uses global fetch available in Node 18+ on Vercel.

module.exports = async (req, res) => {
  const { url } = req.query;
  if (!url) {
    res.status(400).json({ error: 'URL parameter required.' });
    return;
  }

  // Normalize target URL
  let target = url;
  if (!/^https?:\/\//i.test(target)) {
    target = 'https://' + target;
  }

  // Copy incoming headers but remove fingerprinting/leaky ones
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
    if (key === 'accept-language') continue; // we will set our own
    if (key === 'user-agent') continue; // we will set our own
    filteredHeaders[key] = v;
  }

  const customHeaders = {
    'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/115.0',
    'accept-language': 'en-US,en;q=0.9',
    ...filteredHeaders,
  };

  // Only pass body for methods that have one
  const method = req.method || 'GET';
  const hasBody = !['GET', 'HEAD'].includes(method.toUpperCase());

  try {
    const proxyRes = await fetch(target, {
      method,
      headers: customHeaders,
      body: hasBody ? req : undefined, // stream request body
      redirect: 'follow',
    });

    // Build safe response headers: strip Set-Cookie and hop-by-hop
    const respHeaders = {};
    proxyRes.headers.forEach((v, k) => {
      const key = k.toLowerCase();
      if (key === 'set-cookie') return;
      if (hopByHop.has(key)) return;
      respHeaders[k] = v;
    });

    // Enable permissive CORS for browser usage through this proxy
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,HEAD,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Accept,Authorization,Accept-Language,User-Agent');

    // Preflight
    if (method.toUpperCase() === 'OPTIONS') {
      res.status(204).end();
      return;
    }

    // Mirror content-type if present
    if (respHeaders['content-type']) {
      res.setHeader('Content-Type', respHeaders['content-type']);
      delete respHeaders['content-type'];
    }

    // Set the rest of the headers
    Object.entries(respHeaders).forEach(([k, v]) => res.setHeader(k, v));

    res.status(proxyRes.status);

    // Stream the response to the client
    if (proxyRes.body && typeof proxyRes.body.pipe === 'function') {
      proxyRes.body.pipe(res);
    } else {
      // Fallback for environments without stream.pipe
      const buf = Buffer.from(await proxyRes.arrayBuffer());
      res.end(buf);
    }
  } catch (e) {
    res.status(502).json({ error: 'Proxy error', detail: e.message });
  }
};