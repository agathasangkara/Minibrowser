import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';
import { ProfileEntry, HeaderRule } from '../shared/types';

const BASE_DIR = app.isPackaged ? app.getPath('userData') : path.resolve(__dirname, '..', '..');
const PROFILES_FILE = path.join(BASE_DIR, 'profiles.json');
const PROFILES_DIR = path.join(BASE_DIR, 'profiles');

export interface XSession {
  screen_name: string;
  auth_token: string;
  ct0: string;
  status: 'Active' | 'Suspend';
}

export interface ProfileSettings {
  proxy: string;
  proxyActive: boolean;
  userAgent: string;
  dns: string;
  modHeaders: HeaderRule[];
  xSessions: XSession[];
}

export function getProfilesFile(): string {
  return PROFILES_FILE;
}

export function getProfilesDir(): string {
  return PROFILES_DIR;
}

export function readProfiles(): ProfileEntry[] {
  try {
    if (fs.existsSync(PROFILES_FILE)) {
      const raw = fs.readFileSync(PROFILES_FILE, 'utf-8');
      const data = JSON.parse(raw);
      if (Array.isArray(data)) return data;
    }
  } catch {}
  return [];
}

export function saveProfiles(profiles: ProfileEntry[]): void {
  fs.writeFileSync(PROFILES_FILE, JSON.stringify(profiles, null, 2), 'utf-8');
}

export function createProfile(name: string): boolean {
  const profiles = readProfiles();
  if (profiles.some((p) => p.name === name)) return false;
  profiles.push({ name });
  saveProfiles(profiles);
  const dir = path.join(PROFILES_DIR, name);
  fs.mkdirSync(dir, { recursive: true });
  return true;
}

export function getPartition(profileName: string): string {
  if (profileName) {
    return `persist:${profileName}`;
  }
  return `persist:default`;
}

export function deleteProfile(name: string): boolean {
  const profiles = readProfiles();
  const idx = profiles.findIndex((p) => p.name === name);
  if (idx === -1) return false;
  profiles.splice(idx, 1);
  saveProfiles(profiles);
  const dir = path.join(PROFILES_DIR, name);
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
  return true;
}

export function ensureProfileDir(profileName: string): string {
  const dir = path.join(PROFILES_DIR, profileName || 'default');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}


function getSettingsFile(profile: string): string {
  return path.join(PROFILES_DIR, profile || 'default', 'settings.json');
}

export function readProfileSettings(profile: string): ProfileSettings {
  try {
    const f = getSettingsFile(profile);
    if (fs.existsSync(f)) {
      const data = JSON.parse(fs.readFileSync(f, 'utf-8'));
      return {
        proxy: data.proxy || '',
        proxyActive: !!data.proxyActive,
        userAgent: data.userAgent || '',
        dns: data.dns || '',
        modHeaders: Array.isArray(data.modHeaders) ? data.modHeaders : [],
        xSessions: Array.isArray(data.xSessions) ? data.xSessions : [],
      };
    }
  } catch {}
  return { proxy: '', proxyActive: false, userAgent: '', dns: '', modHeaders: [], xSessions: [] };
}

export function saveProfileSettings(profile: string, settings: Partial<ProfileSettings>): void {
  ensureProfileDir(profile);
  const current = readProfileSettings(profile);
  const merged = { ...current, ...settings };
  fs.writeFileSync(getSettingsFile(profile), JSON.stringify(merged, null, 2), 'utf-8');
}
