# Skynet Panel Protocol v1.0

## Overview

The Panel Protocol enables any Skynet application to self-register its UI panels with the central registry. The Skynet Command Extension discovers registered apps and renders their panels in a unified LCARS interface.

**No extension updates needed when new apps come online.**

## Architecture

```
Apps (POS, Signage, Analytics, etc.)
  └─ Each exposes GET /_panel → Panel Manifest JSON
  
Registry (localhost:3210/api/panels)
  └─ Central discovery endpoint
  └─ Apps register on startup, re-register on heartbeat
  
Chrome Extension (popup + side panel)
  └─ Fetches registry → renders each app's panels in LCARS frame
  └─ WebSocket for live updates
```

## Panel Manifest

Each app exposes `GET /_panel` returning a JSON manifest:

```json
{
  "app": "signage",
  "name": "Skynet Signage",
  "icon": "monitor",
  "version": "1.0",
  "baseUrl": "http://localhost:3400",
  "panels": [
    {
      "id": "screen-status",
      "title": "SCREENS",
      "type": "status",
      "endpoint": "/api/screens",
      "refreshMs": 5000,
      "fields": [
        { "key": "id", "label": "ID" },
        { "key": "status", "label": "STATUS", "color": { "online": "success", "offline": "danger" } }
      ]
    },
    {
      "id": "quick-push",
      "title": "PUSH CONTENT",
      "type": "controls",
      "actions": [
        {
          "label": "RELOAD ALL",
          "method": "POST",
          "endpoint": "/api/reload-all",
          "color": "orange"
        },
        {
          "label": "OFFICE LOOP",
          "method": "POST",
          "endpoint": "/api/push",
          "body": { "target": "all", "type": "playlist", "content": "playlist-5d0c4f2a" },
          "color": "blue"
        }
      ]
    },
    {
      "id": "live-view",
      "title": "ADMIN",
      "type": "iframe",
      "url": "/admin-embed",
      "size": "full"
    }
  ]
}
```

## Manifest Fields

| Field     | Type   | Required | Description                         |
|-----------|--------|----------|-------------------------------------|
| `app`     | string | ✓        | Unique app identifier               |
| `name`    | string | ✓        | Display name                        |
| `icon`    | string |          | Icon name (monitor, cart, chart...) |
| `version` | string |          | App version                         |
| `baseUrl` | string | ✓        | Base URL for API calls              |
| `panels`  | array  | ✓        | Array of panel definitions          |

## Panel Types

### `status` — Data Readout Table

Polls an endpoint and renders data as LCARS readout rows.

```json
{
  "id": "screen-status",
  "title": "SCREENS",
  "type": "status",
  "endpoint": "/api/screens",
  "refreshMs": 5000,
  "dataPath": "data",
  "fields": [
    { "key": "id", "label": "ID" },
    { "key": "name", "label": "NAME" },
    {
      "key": "status",
      "label": "STATUS",
      "color": {
        "online": "success",
        "offline": "danger",
        "idle": "warning"
      }
    }
  ]
}
```

- `endpoint` — relative to `baseUrl`, returns JSON array or `{ data: [...] }`
- `dataPath` — optional dot-path to extract array from response (e.g. `"data"`, `"result.items"`)
- `refreshMs` — polling interval in milliseconds
- `fields[].color` — maps values to LCARS semantic colours

### `controls` — Action Buttons

Renders LCARS pill buttons that trigger API calls.

```json
{
  "id": "quick-push",
  "title": "PUSH CONTENT",
  "type": "controls",
  "actions": [
    {
      "label": "RELOAD ALL",
      "method": "POST",
      "endpoint": "/api/reload-all",
      "color": "orange",
      "confirm": false
    },
    {
      "label": "EMERGENCY STOP",
      "method": "POST",
      "endpoint": "/api/stop",
      "color": "red",
      "confirm": true,
      "confirmText": "CONFIRM EMERGENCY STOP?"
    }
  ]
}
```

- `method` — HTTP method (GET, POST, PUT, DELETE)
- `endpoint` — relative to `baseUrl`
- `body` — optional JSON body for POST/PUT
- `color` — LCARS colour name (orange, blue, amber, red, green, purple, peach, lavender)
- `confirm` — if true, show confirmation before executing
- `confirmText` — custom confirmation message

### `iframe` — Embedded View

Embeds a page from the app directly.

```json
{
  "id": "admin",
  "title": "ADMIN",
  "type": "iframe",
  "url": "/admin-embed",
  "size": "full"
}
```

- `url` — relative to `baseUrl` or absolute
- `size` — `"compact"` (200px), `"medium"` (400px), `"full"` (fills available space)

### `stats` — Metric Counters

Live metrics with animated number transitions.

```json
{
  "id": "today-stats",
  "title": "TODAY",
  "type": "stats",
  "endpoint": "/api/stats/today",
  "refreshMs": 10000,
  "metrics": [
    { "key": "revenue", "label": "REVENUE", "prefix": "£", "color": "green" },
    { "key": "transactions", "label": "TRANSACTIONS", "color": "blue" },
    { "key": "avgDwell", "label": "AVG DWELL", "suffix": "min", "color": "amber" }
  ]
}
```

- `metrics[].prefix` / `suffix` — value decorators
- `metrics[].format` — optional: `"number"`, `"currency"`, `"percent"`, `"duration"`

### `stream` — WebSocket Live Feed

Real-time data via WebSocket connection.

```json
{
  "id": "live-events",
  "title": "LIVE EVENTS",
  "type": "stream",
  "wsUrl": "ws://localhost:3400/ws/events",
  "maxItems": 20,
  "fields": [
    { "key": "timestamp", "label": "TIME", "format": "time" },
    { "key": "event", "label": "EVENT" },
    { "key": "source", "label": "SOURCE", "color": "blue" }
  ]
}
```

### `camera` — Video Stream

Embeds a video stream.

```json
{
  "id": "entrance-cam",
  "title": "ENTRANCE",
  "type": "camera",
  "streamUrl": "http://localhost:1984/api/stream.mp4?src=entrance",
  "size": "medium"
}
```

## Registry API

### Register App

```
POST /api/panels/register
Content-Type: application/json

{
  "app": "signage",
  "name": "Skynet Signage",
  "icon": "monitor",
  "version": "1.0",
  "baseUrl": "http://localhost:3400",
  "panels": [...]
}
```

Response: `{ "ok": true, "app": "signage", "ttl": 120 }`

### List All Panels

```
GET /api/panels
```

Response:
```json
{
  "apps": [
    {
      "app": "signage",
      "name": "Skynet Signage",
      "icon": "monitor",
      "version": "1.0",
      "baseUrl": "http://localhost:3400",
      "panels": [...],
      "registeredAt": "2025-02-06T12:00:00Z",
      "lastHeartbeat": "2025-02-06T12:01:00Z",
      "status": "online"
    }
  ]
}
```

### Deregister App

```
DELETE /api/panels/:appId
```

Response: `{ "ok": true, "removed": "signage" }`

### Health Check (per app)

The registry periodically pings each app's `baseUrl` + `/_panel` to verify liveness. Apps with no heartbeat for 2× TTL are marked offline but retained.

## Registration Flow

1. App starts up
2. App calls `POST /api/panels/register` with its manifest
3. Registry stores manifest with TTL (default: 120s)
4. App re-registers periodically (heartbeat)
5. Extension polls `GET /api/panels` to discover all apps
6. If an app misses heartbeats, registry marks it offline

## Static Registration

For apps that can't self-register, add static config to the registry:

```
POST /api/panels/register?static=true
```

Static registrations don't expire but are health-checked periodically.

## Colour Mapping

Panel colours map to LCARS design tokens:

| Colour Name | Hex       | Usage              |
|------------|-----------|---------------------|
| `orange`   | `#FF9900` | Primary, actions    |
| `amber`    | `#FFCC66` | Labels, secondary   |
| `blue`     | `#9999FF` | Data, information   |
| `purple`   | `#CC99CC` | Alerts, system      |
| `red`      | `#CC6666` | Errors, critical    |
| `green`    | `#66CC66` | Success, online     |
| `peach`    | `#FFCC99` | Backgrounds         |
| `lavender` | `#9999CC` | Secondary data      |
| `tan`      | `#CC9966` | Tertiary            |
| `success`  | `#66CC66` | Alias for green     |
| `warning`  | `#FFCC00` | Warning state       |
| `danger`   | `#CC4444` | Critical/error      |
