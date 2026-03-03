export interface ProxyConfig {
  scheme: string;
  user: string;
  pass: string;
  host: string;
  port: number;
}

export interface ProfileEntry {
  name: string;
}

export interface CookieItem {
  name: string;
  value: string;
  domain: string;
  path: string;
}

export interface ProxyCheckResult {
  ok: boolean;
  country?: string;
  ip?: string;
  error?: string;
}

export interface BookmarkItem {
  url: string;
  title: string;
  addedAt: number;
}

export interface HistoryItem {
  url: string;
  title: string;
  visitedAt: number;
}

export interface HeaderRule {
  key: string;
  value: string;
  enabled: boolean;
}

export interface ElectronAPI {
  // Window controls
  minimizeWindow: () => void;
  maximizeWindow: () => void;
  closeWindow: () => void;
  isMaximized: () => Promise<boolean>;
  onMaximizeChange: (cb: (maximized: boolean) => void) => void;

  // Proxy
  getProxy: () => Promise<string>;
  setProxy: (raw: string) => Promise<boolean>;
  checkProxy: (raw: string) => Promise<ProxyCheckResult>;

  // Cookies
  getCookies: (url: string, partition: string) => Promise<CookieItem[]>;
  setCookie: (partition: string, url: string, name: string, value: string, domain: string, path: string) => Promise<boolean>;

  // Clear data
  clearData: (partition: string) => Promise<void>;

  // Profiles
  getProfiles: () => Promise<ProfileEntry[]>;
  createProfile: (name: string) => Promise<boolean>;
  deleteProfile: (name: string) => Promise<boolean>;
  cloneWindow: (profileName: string) => void;

  // Tab webview
  getPartition: () => Promise<string>;

  // Bookmarks
  getBookmarks: () => Promise<BookmarkItem[]>;
  addBookmark: (url: string, title: string) => Promise<boolean>;
  removeBookmark: (url: string) => Promise<void>;
  isBookmarked: (url: string) => Promise<boolean>;

  // History
  getHistory: () => Promise<HistoryItem[]>;
  addHistory: (url: string, title: string) => Promise<void>;
  deleteHistory: (visitedAt: number) => Promise<void>;
  clearHistory: () => Promise<void>;

  // Mod Headers
  getModHeaders: () => Promise<HeaderRule[]>;
  setModHeaders: (rules: HeaderRule[]) => Promise<void>;

  // Mirror (interaction replay)
  getMirrorTargets: () => Promise<{ windowId: number; profile: string }[]>;
  sendMirrorEvent: (data: string, targetIds?: number[]) => void;
  onMirrorEvent: (cb: (data: string) => void) => void;
  activateMirror: () => void;
  onMirrorDeactivate: (cb: () => void) => void;

  // Window count
  getWindowCount: () => Promise<number>;
  onWindowCount: (cb: (count: number) => void) => void;

  // User-Agent
  getUserAgent: () => Promise<string>;
  setUserAgent: (ua: string) => Promise<void>;

  // Running profiles
  getRunningProfiles: () => Promise<string[]>;
}
