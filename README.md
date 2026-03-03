<p align="center">
  <img src="assets/icon.png" width="128" height="128" alt="Minibrowser">
</p>

<h1 align="center">Minibrowser</h1>

<p align="center">
  A lightweight, privacy-focused Chromium browser built with Electron.<br>
  Multi-profile support, proxy integration, cookie management, and more.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Electron-33-blue?logo=electron" alt="Electron 33">
  <img src="https://img.shields.io/badge/TypeScript-5.7-blue?logo=typescript" alt="TypeScript">
  <img src="https://img.shields.io/badge/Platform-Windows-0078D6?logo=windows" alt="Windows">
  <img src="https://img.shields.io/github/license/agathasangkara/Minibrowser" alt="License">
</p>

---

## Features

- **Multi-Profile** — Run multiple isolated browser sessions, each with its own cookies, storage, and settings
- **Proxy Support** — Per-profile SOCKS5/HTTP proxy with authentication and connection checker
- **Cookie Manager** — View, edit, copy, and delete cookies per tab with filtering
- **Mod Headers** — Inject custom request headers per profile (e.g. API keys, auth tokens)
- **User-Agent Switcher** — Set custom User-Agent per profile, auto-applies to all tabs
- **DNS over HTTPS** — Configure custom DoH servers (Cloudflare, Google, etc.) per profile
- **Bookmark Bar** — Quick-access bookmarks shown on homepage with right-click context menu
- **History** — Grouped by date (Today, Yesterday, This Week, etc.) with search and per-entry delete
- **JSON Viewer** — Auto-detects JSON responses and renders them in a tree/pretty view with copy/collapse
- **Mirror Mode** — Replay mouse, keyboard, scroll, and input events to other browser windows in real-time
- **X (Twitter) Handler** — Token-based login, session management, account status check (Active/Suspend)
- **Embedded DevTools** — Docked inside the window with draggable resize divider
- **Per-Tab Audio** — Mute/unmute sound per tab via gear dropdown
- **Zoom Controls** — Ctrl+scroll or toolbar buttons, per-tab zoom level
- **URL Suggestions** — History-based autocomplete as you type in the address bar
- **Keyboard Shortcuts** — Full set: Ctrl+T/W/L/R/H/D, F12, Ctrl+Tab, Alt+Arrow, Ctrl+/-/0
- **Default Browser** — Registers as http/https protocol handler and .html/.htm file association
- **Dark Theme** — Full dark UI with brown accent (#c9a96e), including custom selection color

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) 18+
- npm (comes with Node.js)

### Install

```bash
git clone https://github.com/agathasangkara/Minibrowser.git
cd Minibrowser
npm install
```

### Development

```bash
npm run dev
```

This compiles TypeScript, copies HTML/CSS assets, and launches the app.

### Build Installers

```bash
# NSIS installer (.exe) + MSI
npm run pack

# MSI only
npm run pack:msi
```

Output goes to `release/`.

## Project Structure

```
Minibrowser/
├── src/
│   ├── main/           # Electron main process
│   │   ├── main.ts     # Window creation, IPC handlers, protocol registration
│   │   ├── preload.ts  # Context bridge (renderer ↔ main)
│   │   ├── proxy.ts    # Proxy parsing, application, and checker
│   │   ├── profiles.ts # Multi-profile management and per-profile settings
│   │   ├── bookmarks.ts
│   │   ├── history.ts
│   │   └── webview-preload.ts
│   ├── renderer/       # Browser UI
│   │   ├── index.html  # Tab bar, toolbar, overlay panels
│   │   ├── renderer.ts # Tab management, navigation, all UI logic
│   │   └── style.css   # Dark theme styles
│   └── shared/
│       └── types.ts    # Shared TypeScript interfaces
├── assets/
│   ├── icon.png
│   └── icon.ico
├── package.json
├── tsconfig.json
└── LICENSE.txt
```

## Architecture

Minibrowser uses Electron's `<webview>` tag for tab isolation. Each profile runs in a separate Electron `persist:` partition, giving full cookie/storage/cache isolation between profiles.

```
┌─────────────────────────────────────────────┐
│  Main Process (main.ts)                     │
│  ├── IPC handlers (proxy, cookies, etc.)    │
│  ├── Session management per partition       │
│  ├── DevTools via WebContentsView           │
│  └── Protocol handler (http/https)          │
├─────────────────────────────────────────────┤
│  Renderer Process (renderer.ts)             │
│  ├── Tab management (create, switch, close) │
│  ├── Navigation + URL suggestions           │
│  ├── Overlay panels (proxy, cookies, etc.)  │
│  └── Mirror event capture/replay            │
├─────────────────────────────────────────────┤
│  Webview (per tab, isolated partition)       │
│  ├── JSON viewer injection                  │
│  ├── Brown selection CSS                    │
│  └── Mirror capture script                  │
└─────────────────────────────────────────────┘
```

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+T` | New tab |
| `Ctrl+W` | Close tab |
| `Ctrl+L` | Focus address bar |
| `Ctrl+R` / `F5` | Reload |
| `Ctrl+H` | History |
| `Ctrl+D` | Bookmark |
| `Ctrl+Tab` | Next tab |
| `Ctrl+Shift+Tab` | Previous tab |
| `F12` | Toggle DevTools |
| `Ctrl++` / `Ctrl+-` | Zoom in/out |
| `Ctrl+0` | Reset zoom |
| `Alt+Left` / `Alt+Right` | Back / Forward |

