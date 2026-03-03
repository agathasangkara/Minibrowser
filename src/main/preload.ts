const { contextBridge, ipcRenderer } = require('electron');
const path = require('path');

const webviewPreloadPath = 'file:///' + path.join(__dirname, 'webview-preload.js').replace(/\\/g, '/');

contextBridge.exposeInMainWorld('electronAPI', {
  // Webview preload path (for light mode override)
  webviewPreloadPath,

  // Window controls
  minimizeWindow: () => ipcRenderer.send('window:minimize'),
  maximizeWindow: () => ipcRenderer.send('window:maximize'),
  closeWindow: () => ipcRenderer.send('window:close'),
  isMaximized: () => ipcRenderer.invoke('window:isMaximized'),
  onMaximizeChange: (cb: any) => {
    ipcRenderer.on('window:maximizeChanged', (_e: any, maximized: boolean) => {
      cb(maximized);
    });
  },

  // Proxy
  getProxy: () => ipcRenderer.invoke('proxy:get'),
  setProxy: (raw: string) => ipcRenderer.invoke('proxy:set', raw),
  proxyOff: () => ipcRenderer.invoke('proxy:off'),
  checkProxy: (raw: string) => ipcRenderer.invoke('proxy:check', raw),

  // Notifications
  setNotifications: (enabled: boolean) => ipcRenderer.invoke('notifications:set', enabled),

  // Cookies
  getCookies: (url: string, partition: string) => ipcRenderer.invoke('cookies:get', url, partition),
  setCookie: (partition: string, url: string, name: string, value: string, domain: string, cookiePath: string) =>
    ipcRenderer.invoke('cookies:set', partition, url, name, value, domain, cookiePath),
  removeCookies: (partition: string, url: string, cookies: { name: string; domain: string }[]) =>
    ipcRenderer.invoke('cookies:remove', partition, url, cookies),

  // Clear data
  clearData: (partition: string) => ipcRenderer.invoke('clear:data', partition),

  // Profiles
  getProfiles: () => ipcRenderer.invoke('profiles:list'),
  createProfile: (name: string) => ipcRenderer.invoke('profiles:create', name),
  deleteProfile: (name: string) => ipcRenderer.invoke('profiles:delete', name),
  cloneWindow: (profileName: string) => ipcRenderer.send('profiles:clone', profileName),

  // Partition
  getPartition: () => ipcRenderer.invoke('partition:get'),

  // Bookmarks
  getBookmarks: () => ipcRenderer.invoke('bookmarks:list'),
  addBookmark: (url: string, title: string) => ipcRenderer.invoke('bookmarks:add', url, title),
  removeBookmark: (url: string) => ipcRenderer.invoke('bookmarks:remove', url),
  isBookmarked: (url: string) => ipcRenderer.invoke('bookmarks:check', url),

  // History
  getHistory: () => ipcRenderer.invoke('history:list'),
  addHistory: (url: string, title: string) => ipcRenderer.invoke('history:add', url, title),
  deleteHistory: (visitedAt: number) => ipcRenderer.invoke('history:delete', visitedAt),
  clearHistory: () => ipcRenderer.invoke('history:clear'),

  // Mod Headers
  getModHeaders: () => ipcRenderer.invoke('modheaders:get'),
  setModHeaders: (rules: any[]) => ipcRenderer.invoke('modheaders:set', rules),

  // Mirror (interaction replay)
  getMirrorTargets: () => ipcRenderer.invoke('mirror:targets'),
  sendMirrorEvent: (data: string, targetIds?: number[]) => ipcRenderer.send('mirror:event', data, targetIds),
  onMirrorEvent: (cb: any) => {
    ipcRenderer.on('mirror:event', (_e: any, data: string) => { cb(data); });
  },
  activateMirror: () => ipcRenderer.send('mirror:activate'),
  onMirrorDeactivate: (cb: any) => {
    ipcRenderer.on('mirror:deactivate', () => { cb(); });
  },

  // Window count
  getWindowCount: () => ipcRenderer.invoke('window:getCount'),
  onWindowCount: (cb: any) => {
    ipcRenderer.on('window:count', (_e: any, count: number) => { cb(count); });
  },

  // User-Agent
  getUserAgent: () => ipcRenderer.invoke('ua:get'),
  setUserAgent: (ua: string) => ipcRenderer.invoke('ua:set', ua),

  // DNS (DoH)
  getDns: () => ipcRenderer.invoke('dns:get'),
  setDns: (dns: string) => ipcRenderer.invoke('dns:set', dns),

  // Running profiles
  getRunningProfiles: () => ipcRenderer.invoke('profiles:running'),

  // DevTools
  openDevTools: (wcId: number, rect: any) => ipcRenderer.send('devtools:open', wcId, rect),
  resizeDevTools: (rect: any, devWidth?: number) => ipcRenderer.send('devtools:resize', rect, devWidth),
  closeDevTools: () => ipcRenderer.send('devtools:close'),
  onDevToolsState: (cb: any) => {
    ipcRenderer.on('devtools:state', (_e: any, open: boolean, width: number) => { cb(open, width); });
  },

  // X Token Login
  checkXSession: (partition: string, authToken: string) => ipcRenderer.invoke('xsessions:check', partition, authToken),
  getXSessions: () => ipcRenderer.invoke('xsessions:list'),
  saveXSessions: (sessions: any[]) => ipcRenderer.invoke('xsessions:save', sessions),

  // New window from webview (target="_blank", window.open)
  onNewWindow: (cb: any) => {
    ipcRenderer.on('webview:new-window', (_e: any, url: string) => { cb(url); });
  },

  // Keyboard shortcuts forwarded from focused webview
  onWebviewShortcut: (cb: any) => {
    ipcRenderer.on('webview:shortcut', (_e: any, key: string, ctrl: boolean, alt: boolean, shift: boolean) => {
      cb(key, ctrl, alt, shift);
    });
  },

  // URL opened from protocol handler or file association
  onOpenUrl: (cb: any) => {
    ipcRenderer.on('open-url', (_e: any, url: string) => { cb(url); });
  },

});
