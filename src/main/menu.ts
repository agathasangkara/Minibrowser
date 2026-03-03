// Menu items definition for the three-dot dropdown
// Rendered in the renderer process, this file provides menu config

export interface MenuItem {
  id: string;
  label: string;
  icon: string;
  shortcut?: string;
}

export const menuItems: MenuItem[] = [
  { id: 'proxy', label: 'Proxy', icon: '🔒' },
  { id: 'cookie', label: 'Cookies', icon: '🍪' },
  { id: 'clear', label: 'Clear Data', icon: '🗑' },
  { id: 'clone', label: 'Clone Window', icon: '📋' },
];
