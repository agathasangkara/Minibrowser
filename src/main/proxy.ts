import { ProxyConfig, ProxyCheckResult } from '../shared/types';

export function parseProxy(raw: string): ProxyConfig | null {
  const t = (raw || '').trim();
  if (!t) return null;

  // Format: scheme://user:pass@host:port
  if (t.includes('://')) {
    try {
      const u = new URL(t);
      if (!u.hostname || !u.port) return null;
      const scheme = u.protocol.replace(':', '').toLowerCase();
      return {
        scheme,
        user: decodeURIComponent(u.username || ''),
        pass: decodeURIComponent(u.password || ''),
        host: u.hostname,
        port: parseInt(u.port, 10),
      };
    } catch {
      return null;
    }
  }

  // Format: user:pass@host:port
  if (t.includes('@')) {
    const [creds, hp] = t.split('@', 2);
    if (!hp || !hp.includes(':')) return null;
    const lastColon = hp.lastIndexOf(':');
    const host = hp.substring(0, lastColon).trim();
    const port = hp.substring(lastColon + 1).trim();
    if (!host || !/^\d+$/.test(port)) return null;

    let user = '', pass = '';
    if (creds.includes(':')) {
      const ci = creds.indexOf(':');
      user = creds.substring(0, ci);
      pass = creds.substring(ci + 1);
    } else {
      user = creds;
    }
    return { scheme: 'http', user, pass, host, port: parseInt(port, 10) };
  }

  // Format: host:port
  if (t.includes(':')) {
    const lastColon = t.lastIndexOf(':');
    const host = t.substring(0, lastColon).trim();
    const port = t.substring(lastColon + 1).trim();
    if (!host || !/^\d+$/.test(port)) return null;
    return { scheme: 'http', user: '', pass: '', host, port: parseInt(port, 10) };
  }

  return null;
}

export function proxyToUrl(p: ProxyConfig): string {
  if (!p.host || !p.port) return '';
  const scheme = p.scheme || 'http';
  if (p.user || p.pass) {
    const u = encodeURIComponent(p.user);
    const pw = encodeURIComponent(p.pass);
    return `${scheme}://${u}:${pw}@${p.host}:${p.port}`;
  }
  return `${scheme}://${p.host}:${p.port}`;
}

export async function applyProxy(ses: Electron.Session, raw: string): Promise<boolean> {
  const p = parseProxy(raw);
  if (!p) {
    await ses.setProxy({ mode: 'direct' });
    return false;
  }

  // Build proxy rules with correct scheme
  const scheme = p.scheme || 'http';
  let rules: string;
  if (scheme === 'socks5' || scheme === 'socks4' || scheme === 'socks') {
    rules = `socks5://${p.host}:${p.port}`;
  } else {
    rules = `http://${p.host}:${p.port}`;
  }

  await ses.setProxy({
    proxyRules: rules,
    proxyBypassRules: 'localhost,127.0.0.1',
  });

  // NOTE: Proxy auth is handled at app level in main.ts
  return true;
}

export async function checkProxy(raw: string): Promise<ProxyCheckResult> {
  const p = parseProxy(raw);
  if (!p) return { ok: false, error: 'Invalid proxy format' };

  try {
    const proxyUrl = proxyToUrl(p);
    const response = await new Promise<{ ok: boolean; data: any }>((resolve, reject) => {
      const http = require('http');
      const reqUrl = new URL('http://ip-api.com/json');

      const proxyParsed = new URL(proxyUrl);
      const options: any = {
        hostname: proxyParsed.hostname,
        port: proxyParsed.port,
        path: reqUrl.href,
        method: 'GET',
        headers: {
          Host: reqUrl.hostname,
        },
      };

      if (proxyParsed.username) {
        const auth = `${decodeURIComponent(proxyParsed.username)}:${decodeURIComponent(proxyParsed.password)}`;
        options.headers['Proxy-Authorization'] = 'Basic ' + Buffer.from(auth).toString('base64');
      }

      const req = http.request(options, (res: any) => {
        let data = '';
        res.on('data', (chunk: string) => { data += chunk; });
        res.on('end', () => {
          try {
            resolve({ ok: res.statusCode === 200, data: JSON.parse(data) });
          } catch {
            resolve({ ok: false, data: null });
          }
        });
      });
      req.on('error', (e: Error) => reject(e));
      req.setTimeout(15000, () => { req.destroy(); reject(new Error('timeout')); });
      req.end();
    });

    if (response.ok && response.data?.status === 'success') {
      return {
        ok: true,
        country: response.data.country || '',
        ip: response.data.query || '',
      };
    }
    return { ok: false, error: 'Proxy check failed' };
  } catch (e: any) {
    return { ok: false, error: e.message || 'Connection failed' };
  }
}
