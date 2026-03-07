# TrailGuard — App Store Screenshots Spec

## Device Sizes
| Size | Device | Resolution |
|------|--------|------------|
| 6.7" | iPhone 15 Pro Max | 1290 × 2796 px |
| 6.5" | iPhone 11 Pro Max | 1242 × 2688 px |

Both sizes are required for App Store submission. Capture at 3× scale, portrait orientation.

---

## Screenshot 1 — Group Map View (Hero)
**Screen:** MapScreen  
**Title overlay:** "Never ride alone"  
**Subtitle:** Track your crew in real time on any trail  
**Mock data to show:**
- 4 group members pinned on map at different trail positions (e.g., Marquette, MI area)
- Trail difficulty overlay visible (green easy / orange moderate lines)
- "LIVE" green HUD indicator top-right
- "Group 4" in HUD
- Avalanche zones lightly visible in background
- User centered on trail

---

## Screenshot 2 — Safety / Dead Man's Switch
**Screen:** SafetyScreen (DMSSettings)  
**Title overlay:** "Your safety net on the trail"  
**Subtitle:** Automatic alerts if you stop moving unexpectedly  
**Mock data to show:**
- DMS toggle ON (active)
- Timer set to 30 minutes
- Status: "Monitoring — 28:14 remaining"
- Group name: "Sunday Crew"
- Last check-in: "2 min ago"

---

## Screenshot 3 — Group Dashboard
**Screen:** GroupDashboardScreen  
**Title overlay:** "Stay in sync with your group"  
**Subtitle:** Share location, start rides, and message the crew  
**Mock data to show:**
- Group: "Sunday Crew" (4 members)
- Active ride timer: "1:24:07"
- Member list: Alex (Leader), Jordan, Sam, Casey
- All members showing green status (in range)
- "Ride Active" banner at top

---

## Screenshot 4 — Ride History
**Screen:** RideHistoryScreen  
**Title overlay:** "Every trail remembered"  
**Subtitle:** Your rides, stats, and routes — always at hand  
**Mock data to show:**
- 4–5 ride entries:
  - "Dec 14, 2024 — Sunday Crew | 12.3 mi · 1h 42m · 38 mph"
  - "Dec 7, 2024 — Solo Ride | 8.1 mi · 58m · 29 mph"
  - "Nov 30, 2024 — Family Trip | 21.5 mi · 2h 15m · 41 mph"
  - "Nov 23, 2024 — Sunday Crew | 15.8 mi · 1h 55m · 44 mph"
- Clean list with stats chips in trail orange

---

## Screenshot 5 — SOS Emergency Screen
**Screen:** SOSScreen  
**Title overlay:** "Emergency? Help is one tap away"  
**Subtitle:** Sends your GPS location to emergency contacts instantly  
**Mock data to show:**
- Large SOS button prominent in center
- Emergency contacts listed: "Mom (248-555-0182)", "Jake (313-555-0147)"
- GPS coordinates visible
- "Location sharing: Active" status

---

## Screenshot 6 — Trail Conditions Panel
**Screen:** MapScreen with RecentConditionsPanel open  
**Title overlay:** "Real-time trail conditions from riders like you"  
**Subtitle:** Groomed, icy, hazards — crowd-sourced and up to date  
**Mock data to show:**
- Conditions panel slid up from bottom
- 3–4 recent reports:
  - "Groomed ✓ — Hwy 2 connector — 12 min ago"
  - "Icy ⚠️ — River Road crossing — 34 min ago"
  - "Powder 🎿 — North loop — 1h ago"
- Map visible behind panel with condition dots

---

## Screenshot 7 — Create / Join Group
**Screen:** GroupHomeScreen  
**Title overlay:** "Join your crew in seconds"  
**Subtitle:** Create a group or jump in with a code  
**Mock data to show:**
- Clean screen with TrailGuard logo / title
- "Create Group" primary button (trail orange)
- "Join Group" secondary button
- No members yet — welcoming first-use state

---

## Screenshot 8 — Offline Maps
**Screen:** OfflineMapsScreen  
**Title overlay:** "Trails work even without signal"  
**Subtitle:** Download maps before you go — ride confidently off-grid  
**Mock data to show:**
- 2 downloaded regions: "Upper Peninsula, MI — 847 MB" and "Porcupine Mountains — 312 MB"
- Storage usage bar
- "Download new region" button
- Last synced timestamps

---

## Screenshot 9 — Compass Navigation
**Screen:** CompassNavScreen  
**Title overlay:** "Stay oriented. Always."  
**Subtitle:** Bearing, heading, and trail direction in one glance  
**Mock data to show:**
- Live compass rose
- Current heading: "NNE 22°"
- Altitude: "1,247 ft"
- Speed: "18 mph"
- Minimal, clean UI with dark background

---

## Screenshot 10 — Member Radar / Group Radar
**Screen:** GroupRadarScreen  
**Title overlay:** "See who's near. Know who's behind."  
**Subtitle:** Radar view of every rider relative to your position  
**Mock data to show:**
- Radar circle with 4 member pings
- Distances: "Alex — 0.3 mi NE", "Jordan — 0.8 mi N", "Sam — 1.2 mi SW"
- Sweep line animation frame
- "All riders accounted for" status badge

---

## Screenshot Overlay Design Notes
- Background: use actual app screenshots (not mockups)
- Overlay text: white bold title + lighter subtitle on gradient footer bar
- Footer gradient: `rgba(27,67,50,0.85)` (deep forest green) → transparent
- Title font: SF Pro Display Bold, ~44pt
- Subtitle font: SF Pro Text Regular, ~26pt
- No device frames needed (App Store uses them automatically)
- Keep overlay text in bottom 25% of screenshot

## Tools for Capture
```bash
# Run on simulator — iPhone 15 Pro Max
xcrun simctl io booted screenshot screenshot.png

# Or use Xcode Simulator: Device → Screenshot (⌘S)
```

For overlay text, use Figma or Sketch with the app screenshot as the base layer.
