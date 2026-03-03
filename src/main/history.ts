import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';

export interface HistoryEntry {
  url: string;
  title: string;
  visitedAt: number;
}

const BASE_DIR = app.isPackaged ? app.getPath('userData') : path.resolve(__dirname, '..', '..');
const DATA_DIR = path.join(BASE_DIR, 'data');
const MAX_ENTRIES = 5000;

function getFile(profile: string): string {
  return path.join(DATA_DIR, `history_${profile || 'default'}.json`);
}

function ensureDir() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

export function readHistory(profile: string = 'default'): HistoryEntry[] {
  try {
    const f = getFile(profile);
    if (fs.existsSync(f)) {
      return JSON.parse(fs.readFileSync(f, 'utf-8'));
    }
  } catch {}
  return [];
}

function save(entries: HistoryEntry[], profile: string = 'default'): void {
  ensureDir();
  fs.writeFileSync(getFile(profile), JSON.stringify(entries, null, 2), 'utf-8');
}

export function addHistoryEntry(url: string, title: string, profile: string = 'default'): void {
  if (!url || url === 'about:blank' || url.startsWith('data:')) return;
  const entries = readHistory(profile);
  entries.unshift({ url, title: title || url, visitedAt: Date.now() });
  if (entries.length > MAX_ENTRIES) entries.length = MAX_ENTRIES;
  save(entries, profile);
}

export function deleteHistoryEntry(visitedAt: number, profile: string = 'default'): void {
  const entries = readHistory(profile).filter((e) => e.visitedAt !== visitedAt);
  save(entries, profile);
}

export function clearHistory(profile: string = 'default'): void {
  save([], profile);
}
