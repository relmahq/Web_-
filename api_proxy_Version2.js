const fetch = require('node-fetch');

const YOUR_SECRET_KEY = "YOUR_SECRET_FOR_SINGLE_USER"; // رمز عبور برای یک نفر

module.exports = async (req, res) => {
  // فقط برای یک نفر (رمز عبور)
  if (req.headers['x-proxy-auth'] !== YOUR_SECRET_KEY) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const { url } = req.query;
  if (!url) {
    res.status(400).json({ error: 'URL parameter required.' });
    return;
  }

  // User-Agent جعلی و حذف کوکی‌ها
  const customHeaders = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:105.0) Gecko/20100101 Firefox/105.0',
    'Accept-Language': 'en-US,en;q=0.9',
    ...req.headers,
    'cookie': '', // حذف کوکی‌ها
    'host': undefined // نباید ارسال شود
  };

  try {
    const proxyRes = await fetch(url, {
      method: req.method,
      headers: customHeaders,
      body: ['GET', 'HEAD'].includes(req.method) ? undefined : req.body,
    });

    // حذف Set-Cookie در پاسخ
    const headers = {};
    proxyRes.headers.forEach((v, k) => {
      if (k.toLowerCase() !== 'set-cookie') headers[k] = v;
    });

    const body = await proxyRes.buffer();
    res.status(proxyRes.status);
    Object.entries(headers).forEach(([k, v]) => res.setHeader(k, v));
    res.send(body);
  } catch (e) {
    res.status(502).json({ error: 'Proxy error', detail: e.message });
  }
};