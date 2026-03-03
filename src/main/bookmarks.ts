import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';

export interface Bookmark {
  url: string;
  title: string;
  addedAt: number;
}

const BASE_DIR = app.isPackaged ? app.getPath('userData') : path.resolve(__dirname, '..', '..');
const DATA_DIR = path.join(BASE_DIR, 'data');

function getFile(profile: string): string {
  return path.join(DATA_DIR, `bookmarks_${profile || 'default'}.json`);
}

function ensureDir() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

export function readBookmarks(profile: string = 'default'): Bookmark[] {
  try {
    const f = getFile(profile);
    if (fs.existsSync(f)) {
      return JSON.parse(fs.readFileSync(f, 'utf-8'));
    }
  } catch {}
  return [];
}

function save(bookmarks: Bookmark[], profile: string = 'default'): void {
  ensureDir();
  fs.writeFileSync(getFile(profile), JSON.stringify(bookmarks, null, 2), 'utf-8');
}

export function addBookmark(url: string, title: string, profile: string = 'default'): boolean {
  const bookmarks = readBookmarks(profile);
  if (bookmarks.some((b) => b.url === url)) return false;
  bookmarks.push({ url, title: title || url, addedAt: Date.now() });
  save(bookmarks, profile);
  return true;
}

export function removeBookmark(url: string, profile: string = 'default'): void {
  const bookmarks = readBookmarks(profile).filter((b) => b.url !== url);
  save(bookmarks, profile);
}

export function isBookmarked(url: string, profile: string = 'default'): boolean {
  return readBookmarks(profile).some((b) => b.url === url);
}
