# 🛷 PowderLink

**Brand-agnostic snowmobile buddy system with true satellite coverage and safety-first design.**

Competing with Polaris Ride Command — but for *every* rider on *every* sled.

## Core Features
- 📡 **Satellite Bridge** — Garmin inReach + SPOT integration for off-grid tracking
- 🚨 **Dead Man's Switch** — Auto-alert if rider stops moving unexpectedly
- 💥 **Crash Detection** — Accelerometer-based with auto-SOS and emergency info card
- 🗺️ **Offline-First Maps** — Full trail maps downloadable, work with zero signal
- 👥 **Group Safety Roles** — Leader / Sweep designation, rally points, count-me-out timer
- ⚠️ **Avalanche Overlays** — Live danger zones from avalanche.org
- 🌨️ **Crowdsourced Trail Conditions** — Real-time trail reports from the community

## Stack
- **App:** React Native (iOS + Android)
- **Backend:** Node.js + Express + WebSocket
- **DB:** PostgreSQL + PostGIS
- **Maps:** Mapbox (offline tiles)
- **Satellite:** Garmin Explore API, SPOT API, Zoleo API
- **Infra:** Docker, Redis

## Repo Structure
```
app/        React Native mobile app
backend/    Node.js API + WebSocket server
shared/     Shared TypeScript types + utilities
docs/       Architecture + API docs
```
