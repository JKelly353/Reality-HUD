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
let currentRoll = null;      // device tilt left-right (gamma);

let smoothHeading = null;      // smoothed sensor heading
let displayHeading = null;     // heading actually used for UI (soft eased)
let lastRawHeading = null;
let lastHeadingTime = null;

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

  // Slide sheet up
  sheet.style.bottom = "0px";

  // Auto-focus input after animation delay (iOS-safe)
  setTimeout(() => {
    input.focus();
  }, 250);
}

function closeTagSheet() {
  const backdrop = document.getElementById("tag-sheet-backdrop");
  const sheet = document.getElementById("tag-sheet");
  const input = document.getElementById("tag-name-input");

  if (!backdrop || !sheet || !input) return;

  input.blur(); // close keyboard
  backdrop.style.opacity = "0";
  backdrop.style.pointerEvents = "none";
  sheet.style.bottom = "-260px";
}

// ==============================
// UTILS
// ==============================

function toRad(x) {
  return (x * Math.PI) / 180;
}

// Haversine distance in meters
function distanceBetween(lat1, lon1, lat2, lon2) {
  const R = 6371e3; // meters
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

// Degrees → cardinal
function degreesToCardinal(deg) {
  deg = (deg + 360) % 360;
  if (deg >= 337.5 || deg < 22.5) return "N ↑";
  if (deg >= 22.5 && deg < 67.5) return "NE ↗";
  if (deg >= 67.5 && deg < 112.5) return "E →";
  if (deg >= 112.5 && deg < 157.5) return "SE ↘";
  if (deg >= 157.5 && deg < 202.5) return "S ↓";
  if (deg >= 202.5 && deg < 247.5) return "SW ↙";
  if (deg >= 247.5 && deg < 292.5) return "W ←";
  if (deg >= 292.5 && deg < 337.5) return "NW ↖";
}

// ==============================
// SMOOTHING HELPERS
// ==============================

// Smooth the raw heading from sensors
function smoothCompassHeading(rawDeg) {
  if (smoothHeading === null) {
    smoothHeading = rawDeg;
    return rawDeg;
  }

  // Time-based drift control
  const now = performance.now();
  const dt = lastHeadingTime ? (now - lastHeadingTime) : 0;
  lastHeadingTime = now;

  // Reject insane jumps (>70° in one frame)
  const diff = angleDiff(rawDeg, smoothHeading);
  if (Math.abs(diff) > 70) {
    return smoothHeading; // ignore spike
  }

  // If we haven't moved much in angle and time is short, freeze to reduce jitter
  if (Math.abs(diff) < 0.8 && dt < 150) {
    return smoothHeading;
  }

  const alpha = 0.16; // smoothing factor (balanced)
  smoothHeading = normalizeAngle(smoothHeading + alpha * diff);
  return smoothHeading;
}

// Soft-predictive easing from smoothed heading → displayed heading
function updateDisplayHeading(targetDeg) {
  if (displayHeading === null) {
    displayHeading = targetDeg;
    return targetDeg;
  }

  const diff = angleDiff(targetDeg, displayHeading);

  // If the target is very close, just snap to avoid micro-wiggle
  if (Math.abs(diff) < 0.4) {
    displayHeading = targetDeg;
    return displayHeading;
  }

  // Soft easing (Option 1: soft predictive smoothing)
  const easeFactor = 0.22; // higher = faster response, lower = smoother
  displayHeading = normalizeAngle(displayHeading + diff * easeFactor);

  return displayHeading;
}

// Angle helpers
function normalizeAngle(deg) {
  return ((deg % 360) + 360) % 360;
}

function angleDiff(target, current) {
  let diff = normalizeAngle(target) - normalizeAngle(current);
  if (diff > 180) diff -= 360;
  if (diff < -180) diff += 360;
  return diff;
}

// Smooth GPS
function smoothGPS(lat, lon) {
  if (smoothLat === null || smoothLon === null) {
    smoothLat = lat;
    smoothLon = lon;
    return { lat, lon };
  }

  // Reject huge jumps (~11m+)
  if (
    Math.abs(lat - smoothLat) > 0.0001 ||
    Math.abs(lon - smoothLon) > 0.0001
  ) {
    return { lat: smoothLat, lon: smoothLon };
  }

  const alpha = 0.1;
  smoothLat = alpha * lat + (1 - alpha) * smoothLat;
  smoothLon = alpha * lon + (1 - alpha) * smoothLon;

  return { lat: smoothLat, lon: smoothLon };
}

// ==============================
// HUD INIT
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
      Move around & add zones later to see intel here.
    </div>
  `;

  aiBodyEl.innerHTML = `
    <div class="hud-feed-item hud-muted">
      AI ANALYSIS FEED STANDBY.
    </div>
  `;
}

// ==============================
// DEBUG (Adaptive: HUD only)
// ==============================

function setDebug(text) {
  const dbg = document.getElementById("debug-box");
  if (!dbg) return;

  if (currentMode === "HUD") {
    dbg.style.display = "block";
    dbg.textContent = text;
  } else {
    dbg.style.display = "none";
  }
}

function updateModeDebug() {
  const box = document.getElementById("mode-debug");
  if (!box) return;

  if (currentMode === "HUD") {
    box.textContent = "MODE: HUD";
  } else if (currentMode === "CAMERA") {
    box.textContent =
      "MODE: CAMERA" + (isConsumerActive ? " + OVERLAY" : "");
  }
}

// ==============================
// SPATIAL TAG MOCK SYSTEM (HUD TAG FEED)
// ==============================

const spatialTags = [];

function dropSpatialTag() {
  const newTag = {
    id: Date.now(),
    label: "HUD Tag " + (spatialTags.length + 1),
    priority: "LOW",
    dist: Math.floor(Math.random() * 20) + 1
  };

  spatialTags.push(newTag);
  updateTagFeed();
}

function updateTagFeed() {
  const feed = document.getElementById("hud-tags-feed");
  const countEl = document.getElementById("hud-tags-count");
  if (!feed || !countEl) return;

  if (spatialTags.length === 0) {
    feed.innerHTML = `
      <div class="hud-feed-item hud-muted">No tags detected.</div>
    `;
    countEl.textContent = "TAGS NEARBY: 0";
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

  countEl.textContent = "TAGS NEARBY: " + spatialTags.length;
}

// ==============================
// GPS MODULE
// ==============================

function updateCoordsDisplay(lat, lon) {
  const el = document.getElementById("hud-coords-text");
  if (!el) return;
  el.textContent = `COORDS: ${lat.toFixed(5)}, ${lon.toFixed(5)}`;
}

function generateNearbyTestTags() {
  if (currentLat == null || currentLon == null) return;

  const lat = currentLat;
  const lon = currentLon;

  testTags = [
    {
      id: 1,
      name: "TEST OBJECT 1",
      lat: lat + 0.00005,
      lon: lon + 0.00005
    },
    {
      id: 2,
      name: "TEST OBJECT 2",
      lat: lat - 0.00003,
      lon: lon - 0.00001
    },
    {
      id: 3,
      name: "TEST OBJECT 3",
      lat: lat + 0.00002,
      lon: lon - 0.00004
    }
  ];

  activeTag = testTags[0] || null;
}

function initGPS() {
  if (!navigator.geolocation) {
    console.warn("GPS not supported.");
    setDebug("GPS not supported on this device.");
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
      timeout: 8000
    }
  );
}

// ==============================
// COMPASS / ORIENTATION (STABILIZED)
// ==============================

function updateHeadingDisplay(deg) {
  const headingTextEl = document.getElementById("hud-heading-text");
  if (!headingTextEl) return;
  headingTextEl.textContent = degreesToCardinal(deg) || "N ↑";
}

function updateConsumerDirection(diffDeg) {
  const line = document.getElementById("direction-line");
  if (!line) return;

  // Full 360° rotation; we let smoothing handle feel
  line.style.transform = `translateX(-50%) rotate(${diffDeg}deg)`;
}

function updateConsumerTagInfo(tagName, distance) {
  const card = document.getElementById("consumer-tag-card");
  const nameEl = document.getElementById("consumer-tag-name");
  const distEl = document.getElementById("consumer-tag-distance");
  if (!card || !nameEl || !distEl) return;

  nameEl.textContent = tagName;
  distEl.textContent = `${Math.round(distance)}m`;

  card.style.opacity = 1;
}

function clearConsumerTagInfo() {
  const card = document.getElementById("consumer-tag-card");
  if (!card) return;
  card.style.opacity = 0;
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
    const bearing = bearingTo(userLat, userLon, tag.lat, tag.lon);

    // Horizontal: angle difference based on heading
    let diff = ((bearing - userHeading + 540) % 360) - 180;

    // If more than 90° behind, show as behind-indicator
    if (Math.abs(diff) > 90) {
      const el = document.createElement("div");
      el.className = "camera-tag behind";
      el.textContent = `◀ ${tag.name} (${Math.round(d)}m)`;
      container.appendChild(el);
      return;
    }

    // Map -90..90° horizontally across the screen
    const xOffset = (diff / 90) * (screenWidth / 2);
    const x = (screenWidth / 2) + xOffset;

    // Vertical: use pitch difference if available
    let pitchDiff = 0;
    if (typeof tag.pitch === "number" && typeof currentPitch === "number") {
      // Positive pitchDiff means tag was placed above current view
      pitchDiff = tag.pitch - currentPitch;
    }

    // Map pitch difference into vertical pixels
    // Clamp to a safe range so things don't fly off-screen
    const maxPitchDiff = 40; // degrees
    const clampedPitch = Math.max(-maxPitchDiff, Math.min(maxPitchDiff, pitchDiff));

    // We'll shift up/down up to a quarter of the screen height
    const maxYOffset = screenHeight / 4;
    const yOffset = (clampedPitch / maxPitchDiff) * maxYOffset;

    const baseY = screenHeight * 0.5; // middle of screen
    const y = baseY - yOffset + index * 24; // stack slightly for multiple tags

    const tagEl = document.createElement("div");
    tagEl.className = "camera-tag";
    tagEl.style.left = `${x}px`;
    tagEl.style.top  = `${y}px`;

    tagEl.textContent = `▶ ${tag.name} (${Math.round(d)}m)`;
    container.appendChild(tagEl);
  });
}

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

  // Raw pitch/roll from deviceorientation
  // beta: front-back tilt, gamma: left-right tilt
  let pitch = typeof event.beta === "number" ? event.beta : 0;
  let roll  = typeof event.gamma === "number" ? event.gamma : 0;

  // Smooth heading as before
  const stableHeading = smoothCompassHeading(heading);

  // Store globally for tag creation
  currentHeading = stableHeading;
  currentPitch   = pitch;
  currentRoll    = roll;

  // Also keep old naming for compatibility
  window.displayHeading = stableHeading;

  // Debug
  if (dbg) {
    dbg.textContent += `Heading: ${stableHeading.toFixed(1)}\n`;
    dbg.textContent += `Pitch:   ${pitch.toFixed(1)}\n`;
    dbg.textContent += `Roll:    ${roll.toFixed(1)}\n`;
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
          setDebug("Motion access granted.");
          initOrientation();
        } else {
          alert("Motion access denied.");
          setDebug("Motion access denied.");
        }
      })
      .catch((err) => {
        console.error(err);
        setDebug("Motion access error.");
      });
  } else {
    // Non-iOS flow
    initOrientation();
  }
}

// ==============================
// CAMERA + MODES
// ==============================

let cameraStream = null;

function startCamera() {
  const video = document.getElementById("camera-feed");
  if (!video || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    setDebug("Camera not supported.");
    return;
  }

  navigator.mediaDevices
    .getUserMedia({
      video: { facingMode: "environment" },
      audio: false
    })
    .then((stream) => {
      cameraStream = stream;
      video.srcObject = stream;
    })
    .catch((err) => {
      console.error("Camera error:", err);
      alert("Unable to access camera: " + err.message);
      setDebug("Camera error: " + err.message);
    });
}

function stopCamera() {
  if (cameraStream) {
    cameraStream.getTracks().forEach((t) => t.stop());
    cameraStream = null;
  }
}

function showHUDMode() {
  currentMode = "HUD";

  document.getElementById("hud-root").style.display = "block";
  document.getElementById("camera-mode").style.display = "none";

  const cm = document.getElementById("consumer-mode");
  if (cm) {
    cm.classList.remove("active");
    cm.style.display = "none";
  }
  isConsumerActive = false;

  const dbg = document.getElementById("debug-box");
  if (dbg) dbg.style.display = "block";

  const modeDbg = document.getElementById("mode-debug");
  if (modeDbg) modeDbg.style.display = "block";

  stopCamera();
  updateModeDebug();
}

function showCameraMode() {
  currentMode = "CAMERA";

  document.getElementById("hud-root").style.display = "none";
  document.getElementById("camera-mode").style.display = "block";

  const dbg = document.getElementById("debug-box");
  if (dbg) dbg.style.display = "none";

  const modeDbg = document.getElementById("mode-debug");
  if (modeDbg) modeDbg.style.display = "block";

  const cm = document.getElementById("consumer-mode");
  if (cm) {
    cm.style.display = "block";
    if (!isConsumerActive) cm.classList.remove("active");
  }

  startCamera();
  updateModeDebug();
}

function toggleConsumerOverlay() {
  const cm = document.getElementById("consumer-mode");
  if (!cm) return;

  isConsumerActive = !isConsumerActive;

  if (isConsumerActive) {
    cm.classList.add("active");
  } else {
    cm.classList.remove("active");
    clearConsumerTagInfo();
  }

  updateModeDebug();
}

// ==============================
// INIT BUTTONS + OVERLAY TOGGLE
// ==============================

function initButtons() {
  const dropBtn = document.getElementById("btn-drop-tag");
  const motionBtn = document.getElementById("btn-request-motion");
  const hudBtn = document.getElementById("btn-hud-mode");
  const camBtn = document.getElementById("btn-camera-mode");

  if (dropBtn) dropBtn.addEventListener("click", dropSpatialTag);
  if (motionBtn) motionBtn.addEventListener("click", requestMotionAccess);
  if (hudBtn) hudBtn.addEventListener("click", showHUDMode);
  if (camBtn) camBtn.addEventListener("click", showCameraMode);

  // ==============================
  // AR OVERLAY toggle button
  // ==============================
  const toggleBtn = document.createElement("button");
  toggleBtn.id = "consumer-toggle";
  toggleBtn.textContent = "AR OVERLAY";
  toggleBtn.addEventListener("click", () => {
    if (currentMode !== "CAMERA") return;
    toggleConsumerOverlay();
  });
  document.body.appendChild(toggleBtn);

  // ==============================
  // TAG SHEET BUTTONS
  // ==============================
  const saveBtn = document.getElementById("tag-save-btn");
  const cancelBtn = document.getElementById("tag-cancel-btn");

  if (saveBtn) saveBtn.addEventListener("click", saveTagName);
  if (cancelBtn) cancelBtn.addEventListener("click", cancelTagCreation);

  // ==============================
  // + ADD TAG BUTTON (Camera mode only)
  // ==============================
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

  // 1. GPS fallback
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

  // 3. Build tag with full orientation
  const newTag = {
    id: Date.now(),
    name: "",
    lat: currentLat,
    lon: currentLon,
    heading: currentHeading,   // where you were facing
    pitch: currentPitch,       // up/down tilt
    roll: currentRoll          // side tilt (we may use later)
  };

  // 4. Keep it pending until user names it
  window._pendingTag = newTag;

  // 5. Open bottom sheet
  openTagSheet();
}

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

  input.value = "";
  closeTagSheet();
}

function cancelTagCreation() {
  window._pendingTag = null;
  const input = document.getElementById("tag-name-input");
  if (input) input.value = "";
  closeTagSheet();
}
// ==============================
// TAG CREATION (CROSSHAIR ANCHOR)
// ==============================

function createTagFromCrosshair() {

  // ⭐ 1. Fix GPS initializing — use last known location
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

  // ⭐ 2. Compass must be ready
  if (window.displayHeading == null) {
    alert("Compass not ready yet.");
    return;
  }

  // ⭐ 3. Build the new tag (no name yet)
  const newTag = {
    id: Date.now(),
    name: "",
    lat: currentLat,
    lon: currentLon,
    heading: displayHeading,
  };

  // Temporarily store until user names it
  window._pendingTag = newTag;

  // Open name sheet
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

  if (!window._pendingTag) {
    alert("No tag pending.");
    return;
  }

  // Finalize the tag
  window._pendingTag.name = name;

  // Load existing storage
  let stored = JSON.parse(localStorage.getItem("ros_tags") || "[]");

  // Add new tag
  stored.push(window._pendingTag);

  // Save permanently
  localStorage.setItem("ros_tags", JSON.stringify(stored));

  // Clear pending
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
// DOM READY
// ==============================

window.addEventListener("DOMContentLoaded", () => {
  initHUD();
  initButtons();
  initGPS();
  updateModeDebug();
  setDebug("HUD READY. Tap ENABLE MOTION, then CAMERA MODE.");
  loadSavedTags();
});















