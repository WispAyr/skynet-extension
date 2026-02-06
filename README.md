# Skynet Command — Chrome Extension

LCARS-styled command centre for Skynet operations. Apps self-register their UI panels via the Panel Protocol. The extension discovers and renders them in a unified interface.

![LCARS](https://img.shields.io/badge/UI-LCARS-orange)
![Manifest V3](https://img.shields.io/badge/Chrome-Manifest%20V3-blue)

## Features

- **Dynamic Panel Discovery** — Apps register panels via `POST /api/panels/register`
- **LCARS Styling** — Authentic Star Trek LCARS aesthetic (black bg, orange headers, pill buttons)
- **Popup View** — 400×600 quick-access panel browser
- **Side Panel** — Full-height split view with nav and panels
- **Live Updates** — WebSocket connection for real-time panel changes
- **Panel Types**: status tables, action buttons, stats counters, iframes, live streams, camera feeds
- **Health Monitoring** — Live status dots per app (green/red)
- **No Build Step** — Pure vanilla JS + CSS

## Install

1. Open `chrome://extensions/`
2. Enable "Developer mode" (top right toggle)
3. Click "Load unpacked"
4. Select this directory (`skynet-extension/`)

## Architecture

```
Skynet Dashboard (localhost:3210)
  ├─ GET  /api/panels         → List all registered apps
  ├─ POST /api/panels/register → Register/update app panels
  ├─ DELETE /api/panels/:appId → Deregister
  └─ WS   /ws/panels          → Live panel updates

Apps (Signage, POS, etc.)
  └─ GET /_panel → Panel manifest JSON
  └─ Self-register on startup via POST to registry
```

## Panel Protocol

See [PROTOCOL.md](PROTOCOL.md) for the full specification.

Quick example — an app registers itself:

```bash
curl -X POST http://localhost:3210/api/panels/register \
  -H 'Content-Type: application/json' \
  -d '{
    "app": "my-app",
    "name": "My App",
    "icon": "tools",
    "version": "1.0",
    "baseUrl": "http://localhost:3000",
    "panels": [
      {
        "id": "status",
        "title": "STATUS",
        "type": "status",
        "endpoint": "/api/health",
        "refreshMs": 5000,
        "fields": [{ "key": "status", "label": "STATUS" }]
      }
    ]
  }'
```

## Structure

```
skynet-extension/
  manifest.json          — Chrome Manifest V3
  background.js          — Service worker
  popup/
    popup.html/js/css    — Popup view (400×600)
  sidepanel/
    panel.html/js/css    — Side panel view (split layout)
  lcars/
    lcars.css            — Full LCARS design system
  lib/
    registry.js          — Registry client (fetch, cache, health)
    renderer.js          — Panel type renderers
    websocket.js         — Live update connection
  icons/
    icon16/48/128.png    — Extension icons
  PROTOCOL.md            — Panel Protocol specification
```

## Registered Apps

| App | Port | Status |
|-----|------|--------|
| Skynet Signage | 3400 | ✅ Has `/_panel` endpoint |
| POS | 3000 | 📋 Static config (NestJS) |
| Hailo Analytics | (Pi) | 📋 Static config |

## Design System

Uses the Skynet LCARS design system:
- Black (#000) background
- Orange (#FF9900) headers and primary actions
- Blue (#9999FF) data values
- Amber (#FFCC66) labels
- Rounded-end pill buttons
- Elbow corners on frame
- All-caps labels
- Monospace tabular numbers
