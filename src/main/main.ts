import {
  app,
  BrowserWindow,
  ipcMain,
  net,
  session,
  webContents,
  WebContentsView,
} from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { applyProxy, checkProxy, parseProxy } from './proxy';
import {
  readProfiles,
  createProfile,
  deleteProfile,
  getPartition,
  ensureProfileDir,
  readProfileSettings,
  saveProfileSettings,
} from './profiles';
import { readBookmarks, addBookmark, removeBookmark, isBookmarked } from './bookmarks';
import { readHistory, addHistoryEntry, deleteHistoryEntry, clearHistory } from './history';
import { HeaderRule } from '../shared/types';

// Suppress Chromium infobars (cookie warnings, etc.)
app.commandLine.appendSwitch('disable-infobars');

let currentProfile = '';
let defaultUserAgent = '';
const activePartitions = new Set<string>();
const windowProfiles = new Map<number, string>();

// Global settings (window state only)
const BASE_DIR = app.isPackaged ? app.getPath('userData') : path.resolve(__dirname, '..', '..');
const DATA_DIR = path.join(BASE_DIR, 'data');
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');

function readSettings(): any { try { if (fs.existsSync(SETTINGS_FILE)) return JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf-8')); } catch {} return {}; }
function saveSettings(s: any): void { fs.mkdirSync(DATA_DIR, { recursive: true }); fs.writeFileSync(SETTINGS_FILE, JSON.stringify(s, null, 2), 'utf-8'); }

function applyDns(dns: string) {
  if (!dns) {
    app.configureHostResolver({ secureDnsMode: 'off', secureDnsServers: [] });
    console.log('[dns] Reset to system default');
  } else {
    app.configureHostResolver({ enableBuiltInResolver: true, secureDnsMode: 'automatic', secureDnsServers: [dns] });
    console.log('[dns] Set to:', dns);
  }
}

function applyModHeadersForProfile(profile: string) {
  const partition = getPartition(profile);
  const ses = session.fromPartition(partition);
  const rules = readProfileSettings(profile).modHeaders.filter((r) => r.enabled && r.key);
  if (rules.length === 0) {
    ses.webRequest.onBeforeSendHeaders(null as any);
  } else {
    ses.webRequest.onBeforeSendHeaders((details, callback) => {
      for (const rule of rules) {
        details.requestHeaders[rule.key] = rule.value;
      }
      callback({ requestHeaders: details.requestHeaders });
    });
  }
}

function getProfileForWindow(e: Electron.IpcMainEvent | Electron.IpcMainInvokeEvent): string {
  const w = BrowserWindow.fromWebContents(e.sender);
  return windowProfiles.get(w?.id ?? 0) || currentProfile || 'default';
}

function getCliArgs() {
  const args = process.argv.slice(1);
  let proxy = '';
  let profile = '';
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--proxy' && i + 1 < args.length) {
      proxy = args[i + 1];
      i++;
    }
    if (args[i] === '--profile' && i + 1 < args.length) {
      profile = args[i + 1];
      i++;
    }
  }
  return { proxy, profile };
}

function broadcastWindowCount() {
  const count = BrowserWindow.getAllWindows().length;
  for (const w of BrowserWindow.getAllWindows()) {
    try { w.webContents.send('window:count', count); } catch {}
  }
}

function getWindowState(): { x?: number; y?: number; width: number; height: number; maximized: boolean } {
  const settings = readSettings();
  return settings.windowState || { width: 1280, height: 820, maximized: false };
}

function saveWindowState(win: BrowserWindow): void {
  const settings = readSettings();
  const isMax = win.isMaximized();
  if (!isMax) {
    const bounds = win.getBounds();
    settings.windowState = { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height, maximized: false };
  } else {
    // Keep previous x/y/size but mark maximized
    const prev = settings.windowState || {};
    settings.windowState = { x: prev.x, y: prev.y, width: prev.width || 1280, height: prev.height || 820, maximized: true };
  }
  saveSettings(settings);
}

function createWindow(profileName: string, proxyRaw: string): BrowserWindow {
  const partition = getPartition(profileName);
  activePartitions.add(partition);
  ensureProfileDir(profileName || 'default');

  const ws = getWindowState();
  const winOpts: any = {
    width: ws.width,
    height: ws.height,
    minWidth: 600,
    minHeight: 400,
    frame: false,
    backgroundColor: '#202124',
    icon: path.join(__dirname, '..', '..', 'assets', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
      webviewTag: true,
    },
  };
  if (ws.x !== undefined && ws.y !== undefined) { winOpts.x = ws.x; winOpts.y = ws.y; }

  const win = new BrowserWindow(winOpts);

  if (ws.maximized) win.maximize();

  windowProfiles.set(win.id, profileName || 'default');

  win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));

  const pName = profileName || 'default';
  const ps = readProfileSettings(pName);
  const ses = session.fromPartition(partition);
  // Capture the default UA before any overrides
  if (!defaultUserAgent) {
    defaultUserAgent = ses.getUserAgent();
  }
  // Only set custom UA — if empty, let Electron use its natural UA
  if (ps.userAgent) {
    ses.setUserAgent(ps.userAgent);
  }

  // Apply CLI proxy override or per-profile proxy (only if active)
  const effectiveProxy = proxyRaw || (ps.proxyActive ? ps.proxy : '');
  if (effectiveProxy) {
    applyProxy(ses, effectiveProxy);
  }

  applyModHeadersForProfile(pName);
  if (ps.dns) applyDns(ps.dns);

  win.on('maximize', () => { win.webContents.send('window:maximizeChanged', true); });
  win.on('unmaximize', () => { win.webContents.send('window:maximizeChanged', false); });

  win.webContents.on('did-finish-load', () => { broadcastWindowCount(); });

  win.on('close', () => { saveWindowState(win); });
  win.on('closed', () => {
    windowProfiles.delete(win.id);
    setTimeout(broadcastWindowCount, 100);
  });

  return win;
}

function setupIPC() {
  ipcMain.on('window:minimize', (e) => {
    const w = BrowserWindow.fromWebContents(e.sender);
    w?.minimize();
  });

  ipcMain.on('window:maximize', (e) => {
    const w = BrowserWindow.fromWebContents(e.sender);
    if (w?.isMaximized()) {
      w.unmaximize();
    } else {
      w?.maximize();
    }
  });

  ipcMain.on('window:close', (e) => {
    const w = BrowserWindow.fromWebContents(e.sender);
    w?.close();
  });

  ipcMain.handle('window:isMaximized', (e) => {
    const w = BrowserWindow.fromWebContents(e.sender);
    return w?.isMaximized() ?? false;
  });

  ipcMain.handle('window:getCount', () => {
    return BrowserWindow.getAllWindows().length;
  });

  ipcMain.handle('proxy:get', (e) => {
    const profile = getProfileForWindow(e);
    const s = readProfileSettings(profile);
    return { proxy: s.proxy, active: s.proxyActive };
  });

  ipcMain.handle('proxy:set', async (e, raw: string) => {
    const profile = getProfileForWindow(e);
    const trimmed = (raw || '').trim();
    saveProfileSettings(profile, { proxy: trimmed, proxyActive: true });
    const partition = getPartition(profile);
    await applyProxy(session.fromPartition(partition), trimmed);
    return !!parseProxy(trimmed);
  });

  ipcMain.handle('proxy:off', async (e) => {
    const profile = getProfileForWindow(e);
    saveProfileSettings(profile, { proxyActive: false });
    const partition = getPartition(profile);
    const ses = session.fromPartition(partition);
    await applyProxy(ses, '');
    await ses.closeAllConnections();
  });

  ipcMain.handle('proxy:check', async (_e, raw: string) => {
    return await checkProxy(raw);
  });

  let notificationsEnabled = true;
  ipcMain.handle('notifications:set', (_e, enabled: boolean) => {
    notificationsEnabled = enabled;
    const ses = session.fromPartition(getPartition(currentProfile));
    ses.setPermissionRequestHandler((_wc, permission, callback) => {
      if (permission === 'notifications') {
        callback(notificationsEnabled);
      } else {
        callback(true);
      }
    });
  });

  ipcMain.handle('cookies:get', async (_e, url: string, partition: string) => {
    try {
      const ses = session.fromPartition(partition || getPartition(currentProfile));
      const cookies = await ses.cookies.get({ url });
      return cookies.map((c) => ({
        name: c.name,
        value: c.value,
        domain: c.domain || '',
        path: c.path || '/',
      }));
    } catch {
      return [];
    }
  });

  ipcMain.handle('cookies:set', async (_e, partition: string, url: string, name: string, value: string, domain: string, cookiePath: string) => {
    try {
      const ses = session.fromPartition(partition || getPartition(currentProfile));
      const secure = url.startsWith('https');
      const cookieUrl = secure ? `https://${domain.replace(/^\./, '')}${cookiePath || '/'}` : url;
      await ses.cookies.set({ url: cookieUrl, name, value, domain: domain || undefined, path: cookiePath || '/', secure, sameSite: 'no_restriction' });
      return true;
    } catch {
      return false;
    }
  });

  ipcMain.handle('cookies:remove', async (_e, partition: string, url: string, cookies: { name: string; domain: string }[]) => {
    try {
      const ses = session.fromPartition(partition || getPartition(currentProfile));
      for (const c of cookies) {
        const cookieUrl = `http${url.startsWith('https') ? 's' : ''}://${c.domain.replace(/^\./, '')}`;
        await ses.cookies.remove(cookieUrl, c.name);
      }
      return true;
    } catch {
      return false;
    }
  });

  ipcMain.handle('clear:data', async (_e, partition: string) => {
    try {
      const ses = session.fromPartition(partition || getPartition(currentProfile));
      await ses.clearStorageData();
      await ses.clearCache();
    } catch {}
  });

  ipcMain.handle('profiles:list', () => readProfiles());

  ipcMain.handle('profiles:create', (_e, name: string) => {
    return createProfile(name);
  });

  ipcMain.handle('profiles:delete', (_e, name: string) => {
    return deleteProfile(name);
  });

  ipcMain.on('profiles:clone', (_e, profileName: string) => {
    const win = createWindow(profileName, '');
    win.show();
  });

  ipcMain.handle('partition:get', (e) => {
    return getPartition(getProfileForWindow(e));
  });

  ipcMain.handle('bookmarks:list', (e) => {
    return readBookmarks(getProfileForWindow(e));
  });
  ipcMain.handle('bookmarks:add', (e, url: string, title: string) => {
    return addBookmark(url, title, getProfileForWindow(e));
  });
  ipcMain.handle('bookmarks:remove', (e, url: string) => {
    removeBookmark(url, getProfileForWindow(e));
  });
  ipcMain.handle('bookmarks:check', (e, url: string) => {
    return isBookmarked(url, getProfileForWindow(e));
  });

  ipcMain.handle('history:list', (e) => {
    return readHistory(getProfileForWindow(e));
  });
  ipcMain.handle('history:add', (e, url: string, title: string) => {
    addHistoryEntry(url, title, getProfileForWindow(e));
  });
  ipcMain.handle('history:delete', (e, visitedAt: number) => {
    deleteHistoryEntry(visitedAt, getProfileForWindow(e));
  });
  ipcMain.handle('history:clear', (e) => {
    clearHistory(getProfileForWindow(e));
  });

  ipcMain.handle('modheaders:get', (e) => {
    const profile = getProfileForWindow(e);
    return readProfileSettings(profile).modHeaders;
  });
  ipcMain.handle('modheaders:set', (e, rules: HeaderRule[]) => {
    const profile = getProfileForWindow(e);
    saveProfileSettings(profile, { modHeaders: rules });
    applyModHeadersForProfile(profile);
  });

  // Mirror — list other windows (profiles) available to mirror to
  ipcMain.handle('mirror:targets', (e) => {
    const senderWindow = BrowserWindow.fromWebContents(e.sender);
    const targets: { windowId: number; profile: string }[] = [];
    BrowserWindow.getAllWindows().forEach((w) => {
      if (w !== senderWindow) {
        targets.push({ windowId: w.id, profile: windowProfiles.get(w.id) || 'default' });
      }
    });
    return targets;
  });

  // Mirror — send event to specific target window IDs
  ipcMain.on('mirror:event', (e, data: string, targetIds?: number[]) => {
    const senderWindow = BrowserWindow.fromWebContents(e.sender);
    BrowserWindow.getAllWindows().forEach((w) => {
      if (w !== senderWindow) {
        if (!targetIds || targetIds.includes(w.id)) {
          w.webContents.send('mirror:event', data);
        }
      }
    });
  });

  // Mirror activation — only 1 window can mirror at a time
  ipcMain.on('mirror:activate', (e) => {
    const senderWindow = BrowserWindow.fromWebContents(e.sender);
    BrowserWindow.getAllWindows().forEach((w) => {
      if (w !== senderWindow) {
        w.webContents.send('mirror:deactivate');
      }
    });
  });

  ipcMain.handle('ua:get', (e) => {
    const profile = getProfileForWindow(e);
    const stored = readProfileSettings(profile).userAgent;
    const partition = getPartition(profile);
    const actual = session.fromPartition(partition).getUserAgent();
    return { ua: stored || actual, custom: !!stored };
  });
  ipcMain.handle('ua:set', (e, ua: string) => {
    const profile = getProfileForWindow(e);
    const partition = getPartition(profile);
    const ses = session.fromPartition(partition);

    // Save to profile (empty string = use Electron's natural UA)
    saveProfileSettings(profile, { userAgent: ua || '' });

    // Apply to session + all webContents in this window
    const effectiveUA = ua || defaultUserAgent;
    ses.setUserAgent(effectiveUA);
    const w = BrowserWindow.fromWebContents(e.sender);
    if (w) {
      for (const wc of webContents.getAllWebContents()) {
        if (wc.hostWebContents === w.webContents || wc === w.webContents) {
          wc.setUserAgent(effectiveUA);
        }
      }
    }
    return effectiveUA;
  });

  ipcMain.handle('dns:get', (e) => {
    const profile = getProfileForWindow(e);
    return readProfileSettings(profile).dns;
  });
  ipcMain.handle('dns:set', (e, dns: string) => {
    const profile = getProfileForWindow(e);
    const trimmed = (dns || '').trim();
    saveProfileSettings(profile, { dns: trimmed });
    applyDns(trimmed);
  });

  ipcMain.handle('profiles:running', () => {
    return Array.from(windowProfiles.values());
  });

  // DevTools — embedded inside window using WebContentsView
  const devToolsState = new Map<number, { view: WebContentsView; pageWcId: number; devWidth: number }>();

  function closeDevToolsForWindow(win: BrowserWindow) {
    const state = devToolsState.get(win.id);
    if (!state) return;
    devToolsState.delete(win.id); // delete first to prevent re-entry
    try {
      const wc = webContents.fromId(state.pageWcId);
      if (wc && !wc.isDestroyed() && wc.isDevToolsOpened()) wc.closeDevTools();
    } catch {}
    try { win.contentView.removeChildView(state.view); } catch {}
    try { if (!state.view.webContents.isDestroyed()) state.view.webContents.close(); } catch {}
    try { win.webContents.send('devtools:state', false, 0); } catch {}
  }

  ipcMain.on('devtools:open', (e, wcId: number, rect: { x: number; y: number; w: number; h: number }) => {
    const pageWC = webContents.fromId(wcId);
    const win = BrowserWindow.fromWebContents(e.sender);
    if (!pageWC || !win) return;

    const existing = devToolsState.get(win.id);
    if (existing) {
      const wasToggle = existing.pageWcId === wcId;
      closeDevToolsForWindow(win);
      if (wasToggle) return; // toggle off
    }

    const devWidth = Math.floor(rect.w * 0.4);
    const view = new WebContentsView();
    win.contentView.addChildView(view);
    view.setBounds({ x: Math.round(rect.x + rect.w - devWidth), y: Math.round(rect.y), width: devWidth, height: Math.round(rect.h) });

    pageWC.setDevToolsWebContents(view.webContents);
    pageWC.openDevTools();

    devToolsState.set(win.id, { view, pageWcId: wcId, devWidth });
    e.sender.send('devtools:state', true, devWidth);

    // Delayed listener for DevTools X button — avoids init race condition
    setTimeout(() => {
      if (pageWC.isDestroyed() || !devToolsState.has(win.id)) return;
      pageWC.once('devtools-closed', () => {
        if (devToolsState.get(win.id)?.pageWcId === wcId) {
          closeDevToolsForWindow(win);
        }
      });
    }, 3000);
  });

  // Renderer tells us its new devWidth (from drag) or asks for resize
  ipcMain.on('devtools:resize', (e, rect: { x: number; y: number; w: number; h: number }, newDevWidth?: number) => {
    const win = BrowserWindow.fromWebContents(e.sender);
    if (!win) return;
    const state = devToolsState.get(win.id);
    if (!state) return;
    const devWidth = newDevWidth || state.devWidth;
    state.devWidth = devWidth;
    state.view.setBounds({ x: Math.round(rect.x + rect.w - devWidth), y: Math.round(rect.y), width: devWidth, height: Math.round(rect.h) });
  });

  ipcMain.on('devtools:close', (e) => {
    const win = BrowserWindow.fromWebContents(e.sender);
    if (win) closeDevToolsForWindow(win);
  });


  const TWITTER_BEARER = 'AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA';
  const TWITTER_API_URL = 'https://api.x.com/1.1/account/settings.json?include_ext_sharing_audiospaces_listening_data_with_followers=true&include_mention_filter=true&include_nsfw_user_flag=true&include_nsfw_admin_flag=true&include_ranked_timeline=true&include_alt_text_compose=true&include_ext_dm_av_call_settings=true&ext=ssoConnections&include_country_code=true&include_ext_dm_nsfw_media_filter=true';
  const X_TXN_SETTINGS = 'DPK171SN9twMq0bdzxRcjjfje1i2ODpcRCtfAuPvQ3lMMmLkEm7kS5fGzAWRP5ShhtuYWgkEXkjU/gm7t5Z8SfsUtYrBDw';
  const X_TXN_USERFLOW = '0kveYrEgDqj7h+AbUB0ooKKDwHxIEjYU2mPR+hanvLxd2zrlaRiunezYT0pk1QziAxZIhNcqQsS6+6esoFDZIFsIsXo80Q';

  // Helper: make a net.request and return { body, headers }
  function xFetch(opts: { method?: string; url: string; ses: Electron.Session; headers?: Record<string, string>; postBody?: string }): Promise<{ body: string; resHeaders: Record<string, string | string[]> }> {
    return new Promise((resolve, reject) => {
      // If we pass explicit Cookie header, don't use session cookies (avoids conflict)
      const useSession = !opts.headers?.['Cookie'];
      const req = net.request({ method: opts.method || 'GET', url: opts.url, session: opts.ses, useSessionCookies: useSession });
      req.setHeader('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36');
      if (opts.headers) { for (const [k, v] of Object.entries(opts.headers)) req.setHeader(k, v); }
      req.on('response', (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => resolve({ body: Buffer.concat(chunks).toString('utf8'), resHeaders: res.headers as any }));
        res.on('error', reject);
      });
      req.on('error', reject);
      if (opts.postBody) req.write(opts.postBody);
      req.end();
    });
  }

  // All-in-one: set auth_token → hit x.com → get ct0 → verify username → check status
  ipcMain.handle('xsessions:check', async (_e, partition: string, authToken: string) => {
    try {
      const ses = session.fromPartition(partition || getPartition(currentProfile));

      // 1. Set auth_token cookie
      await ses.cookies.set({ url: 'https://x.com', name: 'auth_token', value: authToken, domain: '.x.com', path: '/', secure: true, sameSite: 'no_restriction' });

      // 2. Hit x.com to get ct0 from Set-Cookie response headers
      const xRes = await xFetch({ url: 'https://x.com', ses });
      const setCookies: string[] = (xRes.resHeaders['set-cookie'] as any) || [];
      let ct0 = '';
      for (const sc of setCookies) {
        const m = sc.match(/^ct0=([^;]+)/);
        if (m && m[1]) ct0 = m[1];
      }
      console.log('[xhandler] ct0 from Set-Cookie:', ct0 ? ct0.substring(0, 20) + '...' : '(empty)');
      if (!ct0) {
        return { ok: false, error: 'Auth token not valid' };
      }

      // 3. Store ct0 in cookie jar so next requests send it
      await ses.cookies.set({ url: 'https://x.com', name: 'ct0', value: ct0, domain: '.x.com', path: '/', secure: true, sameSite: 'no_restriction' });

      // 4. Verify username via settings API (may fail — still save with @null)
      let screenName = '';
      try {
        const verifyRes = await xFetch({
          url: TWITTER_API_URL, ses,
          headers: {
            'authorization': `Bearer ${decodeURIComponent(TWITTER_BEARER)}`,
            'x-csrf-token': ct0,
            'x-twitter-auth-type': 'OAuth2Session',
            'x-twitter-active-user': 'yes',
            'x-twitter-client-language': 'en',
            'x-client-transaction-id': X_TXN_SETTINGS,
            'origin': 'https://x.com',
            'referer': 'https://x.com/',
            'accept-language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
            'Cookie': `auth_token=${authToken}; ct0=${ct0}`,
          },
        });
        console.log('[xhandler] verify response:', verifyRes.body.substring(0, 200));
        try { const data = JSON.parse(verifyRes.body); screenName = data.screen_name || ''; } catch {}
      } catch (e: any) {
        console.log('[xhandler] verify error:', e.message);
      }

      // 5. Check suspend status via user_flow.json (may fail — save with status '-')
      let status = '-';
      let statusMsg = '';
      try {
        const statusRes = await xFetch({
          method: 'POST', url: 'https://x.com/i/api/1.1/graphql/user_flow.json', ses,
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'authorization': `Bearer ${decodeURIComponent(TWITTER_BEARER)}`,
            'x-csrf-token': ct0,
            'x-twitter-auth-type': 'OAuth2Session',
            'x-twitter-active-user': 'yes',
            'x-twitter-client-language': 'en',
            'x-client-transaction-id': X_TXN_USERFLOW,
            'origin': 'https://x.com',
            'referer': 'https://x.com/',
            'accept-language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
            'Cookie': `auth_token=${authToken}; ct0=${ct0}`,
          },
          postBody: 'category=perftown&log=' + encodeURIComponent('[]'),
        });
        console.log('[xhandler] status response:', statusRes.body.substring(0, 200));
        const trimmed = statusRes.body.trim();
        if (!trimmed || trimmed === '{}') {
          status = 'Active';
        } else {
          try {
            const sData = JSON.parse(trimmed);
            if (sData.errors && Array.isArray(sData.errors)) {
              const suspended = sData.errors.find((e: any) => e.code === 64);
              if (suspended) { status = 'Suspend'; statusMsg = suspended.message; }
              else { status = 'Active'; }
            } else {
              status = 'Active';
            }
          } catch { status = 'Active'; }
        }
      } catch (e: any) {
        console.log('[xhandler] status error:', e.message);
      }

      return { ok: true, screen_name: screenName || 'null', ct0, status, statusMsg };
    } catch (e: any) {
      console.log('[xhandler] error:', e.message);
      return { ok: false, error: e.message || 'Check failed' };
    }
  });

  ipcMain.handle('xsessions:list', (e) => {
    const profile = getProfileForWindow(e);
    return readProfileSettings(profile).xSessions;
  });

  ipcMain.handle('xsessions:save', (e, sessions: any[]) => {
    const profile = getProfileForWindow(e);
    saveProfileSettings(profile, { xSessions: sessions });
  });
}

app.on('login', (event, wc, _details, authInfo, callback) => {
  if (authInfo.isProxy) {
    const win = BrowserWindow.fromWebContents(wc);
    const profile = windowProfiles.get(win?.id ?? 0) || currentProfile || 'default';
    const proxyRaw = readProfileSettings(profile).proxy;
    if (proxyRaw) {
      const p = parseProxy(proxyRaw);
      if (p && p.user) {
        event.preventDefault();
        callback(p.user, p.pass);
        return;
      }
    }
  }
});

app.on('certificate-error', (event, wc, _url, _error, _certificate, callback) => {
  // Allow certificate errors when any profile has a proxy set
  const win = BrowserWindow.fromWebContents(wc);
  const profile = windowProfiles.get(win?.id ?? 0) || currentProfile || 'default';
  const proxyRaw = readProfileSettings(profile).proxy;
  if (proxyRaw) {
    event.preventDefault();
    callback(true);
  }
});

app.on('web-contents-created', (_, contents) => {
  // Redirect window.open() from webviews to new tabs
  contents.setWindowOpenHandler(({ url }) => {
    if (contents.getType() === 'webview' && url && url !== 'about:blank') {
      try {
        const host = (contents as any).hostWebContents;
        if (host) host.send('webview:new-window', url);
      } catch {}
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });

  // Forward browser shortcuts from focused webview to renderer
  contents.on('before-input-event', (event, input) => {
    if (contents.getType() !== 'webview' || input.type !== 'keyDown') return;
    const ctrl = input.control || input.meta;
    let forward = false;
    if (input.key === 'F12') forward = true;
    if (ctrl && (input.key === 't' || input.key === 'w' || input.key === 'l' || input.key === 'r')) forward = true;
    if (input.alt && (input.key === 'ArrowLeft' || input.key === 'ArrowRight')) forward = true;
    if (forward) {
      event.preventDefault();
      try {
        const host = (contents as any).hostWebContents;
        if (host) host.send('webview:shortcut', input.key, ctrl, input.alt, input.shift);
      } catch {}
    }
  });
});

if (process.defaultApp) {
  if (process.argv.length >= 2) {
    app.setAsDefaultProtocolClient('http', process.execPath, [path.resolve(process.argv[1])]);
    app.setAsDefaultProtocolClient('https', process.execPath, [path.resolve(process.argv[1])]);
  }
} else {
  app.setAsDefaultProtocolClient('http');
  app.setAsDefaultProtocolClient('https');
}

const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', (_event, commandLine) => {
    const url = commandLine.find(arg => /^https?:\/\//i.test(arg));
    const win = BrowserWindow.getAllWindows()[0];
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
      if (url) win.webContents.send('open-url', url);
    }
  });

  app.whenReady().then(() => {
    const cli = getCliArgs();
    currentProfile = cli.profile;

    // If CLI proxy was provided, save it to the profile
    if (cli.proxy) {
      const pName = currentProfile || 'default';
      ensureProfileDir(pName);
      saveProfileSettings(pName, { proxy: cli.proxy });
    }

    setupIPC();

    // Check if launched with a URL argument (e.g. from file association or protocol)
    const launchUrl = process.argv.find(arg => /^https?:\/\//i.test(arg));

    const win = createWindow(currentProfile, cli.proxy);
    win.show();

    if (launchUrl) {
      win.webContents.once('did-finish-load', () => {
        win.webContents.send('open-url', launchUrl);
      });
    }

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        const w = createWindow(currentProfile, '');
        w.show();
      }
    });
  });

  app.on('window-all-closed', () => {
    app.quit();
  });
}
