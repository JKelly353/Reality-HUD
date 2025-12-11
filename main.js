// main.js
// R-OS: HUD + Camera + Consumer Overlay + Soft-Stabilized AR Heading

console.log("R-OS main.js loaded");

// ==============================
// GLOBAL STATE
// ==============================

let currentLat = null;
let currentLon = null;
let currentHeading = null;   // smoothed compass heading
let currentPitch = null;     // device tilt front-back (beta)
let currentRoll = null;      // device tilt left-right (gamma)

let smoothHeading = null;      // smoothed sensor heading
let displayHeading = null;     // heading actually used for UI (soft eased)
let lastRawHeading = null;
let lastHeadingTime = null;

let smoothPitch = null;
let smoothRoll  = null;

let lockedHeading = null;
let lockedPitch   = null;
let lastStableOrientationTime = null;

let smoothLat = null;
let smoothLon = null;

let testTags = [];          // auto-generated near user
let activeTag = null;       // tag we are tracking in consumer mode
let isConsumerActive = false;
let currentMode = "HUD";    // "HUD" | "CAMERA"

// ==============================
// TAG SHEET UI CONTROLS
// ==============================

function openTagSheet() {
  const backdrop = document.getElementById("tag-sheet-backdrop");
  const sheet = document.getElementById("tag-sheet");
  const input = document.getElementById("tag-name-input");

  if (!backdrop || !sheet || !input) return;

  // Show backdrop
  backdrop.style.pointerEvents = "auto";
  backdrop.style.opacity = "1";

  document.getElementById("hud-controls").style.pointerEvents = "none";
  document.getElementById("consumer-mode").style.pointerEvents = "none";

  // Slide sheet up
  sheet.style.transform = "translateY(0%)";
  sheet.style.opacity = "1";

  // Focus input
  setTimeout(() => input.focus(), 150);
}

function closeTagSheet() {
  const backdrop = document.getElementById("tag-sheet-backdrop");
  const sheet = document.getElementById("tag-sheet");
  if (!backdrop || !sheet) return;

  backdrop.style.pointerEvents = "none";
  backdrop.style.opacity = "0";

  document.getElementById("hud-controls").style.pointerEvents = "auto";
  document.getElementById("consumer-mode").style.pointerEvents = "auto";

  sheet.style.transform = "translateY(100%)";
  sheet.style.opacity = "0";
}

// ==============================
// DEBUG OVERLAY
// ==============================

function setDebug(msg) {
  const dbg = document.getElementById("debug-box");
  if (!dbg) return;
  dbg.textContent = msg;
}

// ==============================
// HUD INITIALIZATION
// ==============================

function initHUD() {
  const headingEl = document.getElementById("hud-heading-text");
  const zoneEl = document.getElementById("hud-zone-text");
  const statusEl = document.getElementById("hud-status-text");
  const tagsCountEl = document.getElementById("hud-tags-count");
  const tagsFeedEl = document.getElementById("hud-tags-feed");
  const intelBodyEl = document.getElementById("hud-intel-body");
  const aiBodyEl = document.getElementById("hud-ai-body");

  if (!headingEl) return;

  headingEl.textContent = "N ↑";
  zoneEl.textContent = "ZONE: BOOT_SEQUENCE";
  statusEl.textContent = "STATUS: ONLINE";
  tagsCountEl.textContent = "TAGS NEARBY: 0";

  tagsFeedEl.innerHTML = `
    <div class="hud-feed-item hud-muted">
      No spatial tags yet. Drop tags or move around.
    </div>
  `;

  intelBodyEl.innerHTML = `
    <div class="hud-feed-item">
      OBJECT: NONE
    </div>
    <div class="hud-feed-item hud-muted">
      Move around & add tags to see intel here.
    </div>
  `;

  aiBodyEl.innerHTML = `
    <div class="hud-feed-item hud-muted">
      AI ANALYSIS FEED STANDBY.
    </div>
  `;
}

// ==============================
// SIMPLE HUD TAG FEED (legacy drop-tag button)
// ==============================

const spatialTags = [];

function dropSpatialTag() {
  const newTag = {
    id: Date.now(),
    label: "Test Tag " + (spatialTags.length + 1),
    priority: "LOW",
    dist: Math.floor(Math.random() * 20) + 1,
  };

  spatialTags.push(newTag);
  updateTagFeed();
}

function updateTagFeed() {
  const feed = document.getElementById("hud-tags-feed");
  if (!feed) return;

  if (spatialTags.length === 0) {
    feed.innerHTML = `
      <div class="hud-feed-item hud-muted">No tags detected.</div>
    `;
    return;
  }

  feed.innerHTML = spatialTags
    .map(
      (tag) => `
      <div class="hud-feed-item">
        ▶ <strong>${tag.label}</strong><br>
        DIST: ${tag.dist}m | PRIORITY: ${tag.priority}
      </div>
    `
    )
    .join("");

  const countEl = document.getElementById("hud-tags-count");
  if (countEl) {
    countEl.textContent = "TAGS NEARBY: " + spatialTags.length;
  }
}

// ==============================
// COORD DISPLAY
// ==============================

function updateCoordsDisplay(lat, lon) {
  const el = document.getElementById("hud-coords-text");
  if (!el) return;
  el.textContent = `COORDS: ${lat.toFixed(5)}, ${lon.toFixed(5)}`;
}

// ==============================
// GPS / LOCATION
// ==============================

function smoothGPS(lat, lon) {
  if (smoothLat == null) {
    smoothLat = lat;
    smoothLon = lon;
    return { lat, lon };
  }

  // Reject massive jumps (~11m)
  if (Math.abs(lat - smoothLat) > 0.0001 || Math.abs(lon - smoothLon) > 0.0001) {
    return { lat: smoothLat, lon: smoothLon };
  }

  const alpha = 0.03;
  smoothLat = alpha * lat + (1 - alpha) * smoothLat;
  smoothLon = alpha * lon + (1 - alpha) * smoothLon;

  return { lat: smoothLat, lon: smoothLon };
}

function initGPS() {
  if (!navigator.geolocation) {
    console.warn("GPS not supported on this device.");
    setDebug("GPS not supported.");
    return;
  }

  navigator.geolocation.watchPosition(
    (pos) => {
      const rawLat = pos.coords.latitude;
      const rawLon = pos.coords.longitude;

      const s = smoothGPS(rawLat, rawLon);
      currentLat = s.lat;
      currentLon = s.lon;

      updateCoordsDisplay(s.lat, s.lon);

      // Save last known good GPS coords
      localStorage.setItem(
        "ros_last_location",
        JSON.stringify({
          lat: s.lat,
          lon: s.lon,
        })
      );

      if (testTags.length === 0) {
        generateNearbyTestTags();
      }
    },
    (err) => {
      console.warn("GPS error:", err);
      setDebug("GPS error: " + err.message);
    },
    {
      enableHighAccuracy: true,
      maximumAge: 0,
      timeout: 8000,
    }
  );
}

// ==============================
// COMPASS / HEADING
// ==============================

function angularDiff(a, b) {
  // shortest angular distance between two headings
  let d = ((a - b + 540) % 360) - 180;
  return Math.abs(d);
}

function smoothCompassHeading(raw) {
  if (smoothHeading === null) {
    smoothHeading = raw;
    lastRawHeading = raw;
    lastHeadingTime = performance.now();
    return raw;
  }

  const now = performance.now();
  const dt = now - lastHeadingTime;
  const diff = angularDiff(raw, lastRawHeading);

  // Tiny jitter in short time? ignore
  if (diff < 0.8 && dt < 120) {
    return smoothHeading;
  }

  const alpha = 0.08; // <- HIGH stability
  smoothHeading = alpha * raw + (1 - alpha) * smoothHeading;

  lastRawHeading = raw;
  lastHeadingTime = now;

  return smoothHeading;
}

function smoothOrientation(raw, prev, alpha = 0.12) {
  if (prev === null) return raw;
  return alpha * raw + (1 - alpha) * prev;
}

// High-stability orientation with micro-motion freezing
function getStabilizedOrientation(rawHeading, rawPitch) {
  const now = performance.now();

  const stableHeading = smoothCompassHeading(rawHeading);
  smoothPitch = smoothOrientation(rawPitch, smoothPitch, 0.14);

  const stablePitch = smoothPitch;

  if (lockedHeading === null) {
    lockedHeading = stableHeading;
    lockedPitch   = stablePitch;
    lastStableOrientationTime = now;
    return { heading: stableHeading, pitch: stablePitch };
  }

  const hDelta = angularDiff(stableHeading, lockedHeading);
  const pDelta = Math.abs(stablePitch - lockedPitch);

  const verySmallMotion = hDelta < 0.6 && pDelta < 0.4;
  const recentlyStable  = now - lastStableOrientationTime < 250;

  // 🔒 Freeze when motion is tiny (micro-jitter zone)
  if (verySmallMotion || recentlyStable) {
    lastStableOrientationTime = now;
    return { heading: lockedHeading, pitch: lockedPitch };
  }

  // Significant motion → update lock
  lockedHeading = stableHeading;
  lockedPitch   = stablePitch;
  lastStableOrientationTime = now;

  return { heading: stableHeading, pitch: stablePitch };
}

function degreesToCardinal(deg) {
  if (deg >= 337.5 || deg < 22.5) return "N ↑";
  if (deg >= 22.5 && deg < 67.5) return "NE ↗";
  if (deg >= 67.5 && deg < 112.5) return "E →";
  if (deg >= 112.5 && deg < 157.5) return "SE ↘";
  if (deg >= 157.5 && deg < 202.5) return "S ↓";
  if (deg >= 202.5 && deg < 247.5) return "SW ↙";
  if (deg >= 247.5 && deg < 292.5) return "W ←";
  if (deg >= 292.5 && deg < 337.5) return "NW ↖";
}

function updateHeading(deg) {
  const headingTextEl = document.getElementById("hud-heading-text");
  if (!headingTextEl) return;
  headingTextEl.textContent = degreesToCardinal(deg) || "N ↑";
}

// ==============================
// AR CAMERA TAG RENDERING
// ==============================

function toRad(x) {
  return (x * Math.PI) / 180;
}

// Haversine distance in meters
function distanceBetween(lat1, lon1, lat2, lon2) {
  const R = 6371e3;
  const φ1 = toRad(lat1);
  const φ2 = toRad(lat2);
  const Δφ = toRad(lat2 - lat1);
  const Δλ = toRad(lon2 - lon1);

  const a =
    Math.sin(Δφ / 2) ** 2 +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

// Bearing from you → tag, in degrees
function bearingTo(lat1, lon1, lat2, lon2) {
  const φ1 = toRad(lat1);
  const φ2 = toRad(lat2);
  const λ1 = toRad(lon1);
  const λ2 = toRad(lon2);

  const y = Math.sin(λ2 - λ1) * Math.cos(φ2);
  const x =
    Math.cos(φ1) * Math.sin(φ2) -
    Math.sin(φ1) * Math.cos(φ2) * Math.cos(λ2 - λ1);

  let brng = (Math.atan2(y, x) * 180) / Math.PI;
  return (brng + 360) % 360;
}

function updateCameraTags(userLat, userLon, userHeading) {
  const container = document.getElementById("camera-tags");
  if (!container) return;

  container.innerHTML = ""; // clear old indicators
  if (!testTags || testTags.length === 0) return;

  const screenWidth  = window.innerWidth;
  const screenHeight = window.innerHeight;

  testTags.forEach((tag, index) => {
    const d = distanceBetween(userLat, userLon, tag.lat, tag.lon);

    // Horizontal anchoring:
    // Prefer the heading at placement; fallback to bearing if not saved.
    let anchorHeading;
    if (typeof tag.heading === "number") {
      anchorHeading = tag.heading;
    } else {
      anchorHeading = bearingTo(userLat, userLon, tag.lat, tag.lon);
    }

    // How far off are we from the placement heading?
    let headingDiff = ((anchorHeading - userHeading + 540) % 360) - 180;

    // If it's far behind you, show behind indicator
    if (Math.abs(headingDiff) > 95) {
      const behindEl = document.createElement("div");
      behindEl.className = "camera-tag behind";
      behindEl.textContent = `◀ ${tag.name || "TAG"} (${Math.round(d)}m)`;
      container.appendChild(behindEl);
      return;
    }

    // Map heading difference to horizontal position
    // -90..90 → left..right
    const maxAngle = 60; // degrees of strong response
    const clampedHeading = Math.max(-maxAngle, Math.min(maxAngle, headingDiff));
    const xNorm = clampedHeading / maxAngle; // -1..1
    const x = screenWidth / 2 + xNorm * (screenWidth / 2 * 0.8);

    // Vertical anchoring using pitch difference if available
    let y = screenHeight * 0.5; // base vertical center
    if (typeof tag.pitch === "number" && typeof currentPitch === "number") {
      const pitchDiff = tag.pitch - currentPitch; // + means tag was above current view
      const maxPitchRange = 40; // degrees
      const clampedPitch = Math.max(-maxPitchRange, Math.min(maxPitchRange, pitchDiff));
      const yNorm = clampedPitch / maxPitchRange; // -1..1
      const maxYOffset = screenHeight / 4;
      y = screenHeight * 0.5 - yNorm * maxYOffset;
    }

    // Slight stacking offset for multiple tags
    y += index * 26;

    const tagEl = document.createElement("div");
    tagEl.className = "camera-tag";
    tagEl.style.left = `${x}px`;
    tagEl.style.top  = `${y}px`;
    tagEl.textContent = `▶ ${tag.name || "TAG"} (${Math.round(d)}m)`;

    container.appendChild(tagEl);
  });
}

// ==============================
// ORIENTATION HANDLER
// ==============================

function initOrientation() {
  if (!window.DeviceOrientationEvent) {
    setDebug("DeviceOrientationEvent not supported.");
    return;
  }

  window.addEventListener("deviceorientation", (event) => {
    const dbg = document.getElementById("debug-box");
    if (dbg) dbg.textContent = "";

    let heading = null;

    // True compass on iPhone
    if (typeof event.webkitCompassHeading === "number") {
      heading = event.webkitCompassHeading;
    }
    // Fallback to alpha if needed
    else if (typeof event.alpha === "number") {
      heading = 360 - event.alpha;
    } else {
      if (dbg) dbg.textContent += "NO HEADING\n";
      return;
    }

    // Raw pitch/roll
    let rawPitch = typeof event.beta === "number" ? event.beta : 0;
    let rawRoll  = typeof event.gamma === "number" ? event.gamma : 0;

    // 🔥 High-stability orientation
    const { heading: stableHeading, pitch: stablePitch } =
      getStabilizedOrientation(heading, rawPitch);

    // Store globally
    currentHeading = stableHeading;
    currentPitch   = stablePitch;
    currentRoll    = smoothOrientation(rawRoll, smoothRoll, 0.18);
    smoothRoll     = currentRoll;

    window.displayHeading = stableHeading;

    if (dbg) {
      dbg.textContent += `H: ${stableHeading.toFixed(1)}\n`;
      dbg.textContent += `P: ${stablePitch.toFixed(1)}\n`;
      dbg.textContent += `R: ${currentRoll.toFixed(1)}\n`;
    }

    // HUD compass text
    updateHeading(stableHeading);

    // Camera AR tags
    if (currentLat != null && currentLon != null) {
      updateCameraTags(currentLat, currentLon, stableHeading);
    }

    // Consumer directional line / card
    if (isConsumerActive && activeTag && currentLat != null && currentLon != null) {
      const d = distanceBetween(currentLat, currentLon, activeTag.lat, activeTag.lon);

      const bearing = bearingTo(currentLat, currentLon, activeTag.lat, activeTag.lon);
      let diff = ((bearing - stableHeading + 540) % 360) - 180;

      updateConsumerDirection(diff);
      updateConsumerTagInfo(activeTag.name, d);
    }
  });
}


// ==============================
// MOTION PERMISSION (iOS)
// ==============================

function requestMotionAccess() {
  if (
    typeof DeviceOrientationEvent !== "undefined" &&
    typeof DeviceOrientationEvent.requestPermission === "function"
  ) {
    DeviceOrientationEvent.requestPermission()
      .then((response) => {
        if (response === "granted") {
          console.log("Motion access granted");
        } else {
          alert("Motion access denied.");
        }
      })
      .catch(console.error);
  } else {
    console.log("Motion access not required on this device.");
  }
}

// ==============================
// CONSUMER MODE (LINE + CARD)
// ==============================

function updateConsumerDirection(diff) {
  const line = document.getElementById("direction-line");
  if (!line) return;

  const angle = Math.max(-90, Math.min(90, diff));
  line.style.transform = `translateX(-50%) rotate(${angle}deg)`;
}

function updateConsumerTagInfo(tagName, distance) {
  const card = document.getElementById("consumer-tag-card");
  const nameEl = document.getElementById("consumer-tag-name");
  const distEl = document.getElementById("consumer-tag-distance");

  if (!card || !nameEl || !distEl) return;

  nameEl.textContent = tagName;
  distEl.textContent = `${Math.round(distance)}m`;

  card.style.opacity = 1;
  card.style.transform = "translateX(-50%)";
}

function hideConsumerTagInfo() {
  const card = document.getElementById("consumer-tag-card");
  if (card) {
    card.style.opacity = 0;
    card.style.transform = "translateX(-50%) translateY(10px)";
  }
}

// ==============================
// CAMERA + MODE SWITCHING
// ==============================

function startCamera() {
  const video = document.getElementById("camera-feed");
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    alert("Camera not supported in this browser.");
    return;
  }

  navigator.mediaDevices
    .getUserMedia({
      video: { facingMode: "environment" },
    })
    .then((stream) => {
      video.srcObject = stream;
    })
    .catch((err) => {
      console.error("Camera error:", err);
      alert("Unable to access camera.");
    });
}

function showHUDMode() {
  const hudRoot = document.getElementById("hud-root");
  const camMode = document.getElementById("camera-mode");
  const consumer = document.getElementById("consumer-mode");

  currentMode = "HUD";

  if (hudRoot) hudRoot.style.display = "block";
  if (camMode) camMode.style.display = "none";
  if (consumer) consumer.style.display = "none";
}

function showCameraMode() {
  const hudRoot = document.getElementById("hud-root");
  const camMode = document.getElementById("camera-mode");
  const consumer = document.getElementById("consumer-mode");

  currentMode = "CAMERA";

  if (hudRoot) hudRoot.style.display = "none";
  if (camMode) camMode.style.display = "block";
  if (consumer) consumer.style.display = "block";

  startCamera();
}

// ==============================
// BUTTON WIRING
// ==============================

function initButtons() {
  const dropBtn   = document.getElementById("btn-drop-tag");
  const motionBtn = document.getElementById("btn-request-motion");
  const hudBtn    = document.getElementById("btn-hud-mode");
  const camBtn    = document.getElementById("btn-camera-mode");
  const saveBtn   = document.getElementById("tag-save-btn");
  const cancelBtn = document.getElementById("tag-cancel-btn");

  if (dropBtn)   dropBtn.addEventListener("click", dropSpatialTag);
  if (motionBtn) motionBtn.addEventListener("click", requestMotionAccess);
  if (hudBtn)    hudBtn.addEventListener("click", showHUDMode);
  if (camBtn)    camBtn.addEventListener("click", showCameraMode);

  // ⭐ Wire up the tag sheet buttons
  if (saveBtn)   saveBtn.addEventListener("click", saveTagName);
  if (cancelBtn) cancelBtn.addEventListener("click", cancelTagCreation);

  // AR OVERLAY toggle button
  const toggleBtn = document.getElementById("consumer-toggle");
  if (toggleBtn) {
    toggleBtn.addEventListener("click", () => {
      if (currentMode !== "CAMERA") return;
      isConsumerActive = !isConsumerActive;

      const consumer = document.getElementById("consumer-mode");
      if (consumer) {
        consumer.style.display = isConsumerActive ? "block" : "none";
      }
    });
  }

  // + ADD TAG floating button (top-right)
  const addBtn = document.createElement("button");
  addBtn.id = "add-tag-btn";
  addBtn.textContent = "+ ADD TAG";

  addBtn.style.position = "fixed";
  addBtn.style.top = "22px";
  addBtn.style.right = "22px";
  addBtn.style.left = "auto";
  addBtn.style.bottom = "auto";
  addBtn.style.zIndex = "999999";
  addBtn.style.padding = "10px 16px";
  addBtn.style.borderRadius = "12px";
  addBtn.style.border = "1px solid rgba(255,255,255,0.5)";
  addBtn.style.background = "rgba(255,255,255,0.25)";
  addBtn.style.color = "white";
  addBtn.style.fontSize = "16px";
  addBtn.style.backdropFilter = "blur(10px)";
  addBtn.style.webkitBackdropFilter = "blur(10px)";

  addBtn.addEventListener("click", () => {
    if (currentMode === "CAMERA") {
      createTagFromCrosshair();
    }
  });

  document.body.appendChild(addBtn);
}

// ==============================
// TAG CREATION (CROSSHAIR ANCHOR)
// ==============================

function createTagFromCrosshair() {
  // 1. GPS fallback — use last known location if live fix not ready
  if (currentLat == null || currentLon == null) {
    console.warn("GPS not ready, using last known location...");

    let saved = JSON.parse(localStorage.getItem("ros_last_location") || "null");

    if (saved) {
      currentLat = saved.lat;
      currentLon = saved.lon;
    } else {
      alert("GPS still initializing… try near a window.");
      return;
    }
  }

  // 2. Heading + pitch must be ready
  if (currentHeading == null || window.displayHeading == null) {
    alert("Compass not ready yet.");
    return;
  }

  if (currentPitch == null) {
    alert("Device orientation not ready. Move your phone a bit.");
    return;
  }

  // 3. Build tag with full orientation snapshot
  const newTag = {
    id: Date.now(),
    name: "",
    lat: currentLat,
    lon: currentLon,
    heading: currentHeading, // where you were facing
    pitch: currentPitch,     // up/down tilt
    roll: currentRoll,       // side tilt
  };

  // 4. Keep it pending until user names it
  window._pendingTag = newTag;

  // 5. Open bottom sheet
  openTagSheet();
}

// Save button — finalize the tag
function saveTagName() {
  const input = document.getElementById("tag-name-input");
  if (!input) return;

  const name = input.value.trim();
  if (!name) {
    alert("Please enter a name.");
    return;
  }

  if (!window._pendingTag) return;

  // Finalize tag
  window._pendingTag.name = name;

  // Load tag list
  let stored = JSON.parse(localStorage.getItem("ros_tags") || "[]");

  // Save new tag
  stored.push(window._pendingTag);
  localStorage.setItem("ros_tags", JSON.stringify(stored));

  // Clear working memory
  window._pendingTag = null;

  // Reset UI
  input.value = "";
  closeTagSheet();

  // Reload tags into AR system
  loadSavedTags();
}

// Cancel button — discard pending tag
function cancelTagCreation() {
  window._pendingTag = null;
  const input = document.getElementById("tag-name-input");
  if (input) input.value = "";
  closeTagSheet();
}

// Load saved tags from localStorage
function loadSavedTags() {
  let saved = JSON.parse(localStorage.getItem("ros_tags") || "[]");

  if (saved.length > 0) {
    testTags = saved;
    activeTag = saved[0]; // default to first tag for consumer mode
  } else {
    testTags = [];
    activeTag = null;
  }
}

// ==============================
// NEARBY TEST TAGS (AUTO GEN)
// ==============================

function generateNearbyTestTags() {
  if (currentLat == null || currentLon == null) return;

  const lat = currentLat;
  const lon = currentLon;

  testTags = [
    {
      id: 1,
      name: "TEST OBJECT 1",
      lat: lat + 0.00005,
      lon: lon + 0.00005,
    },
    {
      id: 2,
      name: "TEST OBJECT 2",
      lat: lat - 0.00003,
      lon: lon - 0.00001,
    },
    {
      id: 3,
      name: "TEST OBJECT 3",
      lat: lat + 0.00002,
      lon: lon - 0.00004,
    },
  ];
}

// ==============================
// DOMCONTENTLOADED
// ==============================

window.addEventListener("DOMContentLoaded", () => {
  setDebug("DEBUG READY");

  initHUD();
  initGPS();
  initOrientation();
  initButtons();
  loadSavedTags();
});







