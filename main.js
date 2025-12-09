// main.js

// Simple boot log so you know JS is running
console.log("Tactical HUD online.");

// On load, set some initial dummy values so you can see things change
window.addEventListener("DOMContentLoaded", () => {
  const headingEl = document.getElementById("hud-heading-text");
  const zoneEl = document.getElementById("hud-zone-text");
  const statusEl = document.getElementById("hud-status-text");
  const tagsCountEl = document.getElementById("hud-tags-count");
  const tagsFeedEl = document.getElementById("hud-tags-feed");
  const intelBodyEl = document.getElementById("hud-intel-body");
  const aiBodyEl = document.getElementById("hud-ai-body");

  // Fake some initial data for now
  headingEl.textContent = "N ↑"; // later this can be compass-driven
  zoneEl.textContent = "ZONE: BOOT_SEQUENCE";
  statusEl.textContent = "STATUS: ONLINE";
  tagsCountEl.textContent = "TAGS NEARBY: 0";

  // Replace the placeholder feeds
  tagsFeedEl.innerHTML = `
    <div class="hud-feed-item hud-muted">
      No spatial tags yet. We'll add creation next.
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
});
// TEMPORARY TEST TAGS (Replace with real tags later)
const testTags = [
  { id: 1, name: "DESK", lat: 44.2601, lon: -72.5758 },
  { id: 2, name: "CLOSET", lat: 44.2600, lon: -72.5750 },
  { id: 3, name: "ROUTER", lat: 44.2605, lon: -72.5762 }
];

// ==============================
// SPATIAL TAG MOCK SYSTEM
// ==============================

// Simple list of tags (temporary storage)
const spatialTags = [];

// Add a new tag (fake location for now)
function dropSpatialTag() {
  const newTag = {
    id: Date.now(),
    label: "Test Tag " + (spatialTags.length + 1),
    priority: "LOW",
    dist: Math.floor(Math.random() * 20) + 1, // fake distance
  };

  spatialTags.push(newTag);
  updateTagFeed();
}

// Update the HUD tag feed UI
function updateTagFeed() {
  const feed = document.getElementById("hud-tags-feed");

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

  // Update nearby count
  document.getElementById("hud-tags-count").textContent =
    "TAGS NEARBY: " + spatialTags.length;
}

// Hook the button to the function
window.addEventListener("DOMContentLoaded", () => {
  document
    .getElementById("btn-drop-tag")
    .addEventListener("click", dropSpatialTag);
});

// ==============================
// REAL COMPASS / HEADING MODULE
// ==============================

// Convert degrees to cardinal direction
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

// ======================================================
// R-OS MASTER ORIENTATION HANDLER
// Supports Consumer Mode + Tactical Mode
// ======================================================

window.addEventListener("deviceorientation", (event) => {
  let heading = null;

  // iOS compass
  if (event.webkitCompassHeading) {
    heading = event.webkitCompassHeading;
  }
  // Android + fallback
  else if (event.alpha !== null) {
    heading = 360 - event.alpha;
  }

  if (heading !== null) {

    // Smooth heading for stability
    const stableHeading = smoothCompassHeading(heading);

    // =============================
    // Tactical Mode Updates (if active)
    // =============================
    updateHeading(stableHeading);

    if (window.currentLat && window.currentLon) {
      updateCameraTags(window.currentLat, window.currentLon, stableHeading);
    }

    // =============================
    // Consumer Mode Updates
    // =============================
    if (document.getElementById("consumer-mode").style.display === "block") {

      const tag = testTags[0];  // temporary target

      if (tag && window.currentLat && window.currentLon) {

        const d = distanceBetween(window.currentLat, window.currentLon, tag.lat, tag.lon);
        const bearing = bearingTo(window.currentLat, window.currentLon, tag.lat, tag.lon);

        // Final angle difference normalization
        let diff = ((bearing - stableHeading + 540) % 360) - 180;

        // Update UI
        updateConsumerDirection(diff);
        updateConsumerTagInfo(tag.name, d);
      }
    }
  }
});

let smoothHeading = null;

function smoothCompassHeading(raw) {
  if (smoothHeading === null) smoothHeading = raw;
  const alpha = 0.15; // smoothing factor
  smoothHeading = alpha * raw + (1 - alpha) * smoothHeading;
  return smoothHeading;
}
function updateConsumerDirection(diff) {
  const line = document.getElementById("direction-line");
  if (!line) return;

  // Clamp rotation for UX (avoids spinning 180 degrees)
  const angle = Math.max(-90, Math.min(90, diff));

  // Rotate the line
  line.style.transform = `translateX(-50%) rotate(${angle}deg)`;
}
// ================================
// Tag Card Update System (Consumer Mode)
// ================================

function updateConsumerTagInfo(tagName, distance) {
  const card = document.getElementById("consumer-tag-card");
  const nameEl = document.getElementById("consumer-tag-name");
  const distEl = document.getElementById("consumer-tag-distance");

  if (!card || !nameEl || !distEl) return;

  nameEl.textContent = tagName;
  distEl.textContent = `${Math.round(distance)}m`;

  // Fade in tag card
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
// REAL GPS LOCATION MODULE
// ==============================

function updateCoords(lat, lon) {
  const el = document.getElementById("hud-coords-text");
  el.textContent = `COORDS: ${lat.toFixed(5)}, ${lon.toFixed(5)}`;
}

// Request location
function initGPS() {
  if (!navigator.geolocation) {
    console.warn("GPS not supported on this device.");
    return;
  }

  navigator.geolocation.watchPosition(
  (pos) => {
    const rawLat = pos.coords.latitude;
    const rawLon = pos.coords.longitude;

    // 🔥 Apply GPS smoothing
    const smooth = smoothGPS(rawLat, rawLon);

    // 🔥 Store smoothed values globally
    window.currentLat = smooth.lat;
    window.currentLon = smooth.lon;

    // 🔥 Update HUD with smoothed values
    updateCoords(smooth.lat, smooth.lon);
  },
  (err) => {
    console.warn("GPS error:", err);
  },
  {
    enableHighAccuracy: true,
    maximumAge: 0,
    timeout: 5000
  }
);
}

// Start GPS on page load
window.addEventListener("DOMContentLoaded", initGPS);

// ==============================
// COMPASS / MOTION PERMISSION + LIVE HEADING
// ==============================

function initCompass() {
  if (window.DeviceOrientationEvent) {
    window.addEventListener("deviceorientation", (event) => {
      let heading = null;

      // iOS uses webkitCompassHeading
      if (event.webkitCompassHeading) {
        heading = event.webkitCompassHeading;
      } else if (event.alpha !== null) {
        // alpha = 0° facing north, 180° facing south
        heading = 360 - event.alpha;
      }

      if (heading !== null) {
    const stableHeading = smoothCompassHeading(heading);
updateHeading(stableHeading);

    // 🔥 NEW: Update directional arrows in Camera Mode
    if (window.currentLat && window.currentLon) {
      updateCameraTags(window.currentLat, window.currentLon, stableHeading);
    }
  }
});
  } else {
    console.warn("DeviceOrientationEvent not supported.");
  }
}

function updateHeading(deg) {
  const headingTextEl = document.getElementById("hud-heading-text");
  headingTextEl.textContent = degreesToCardinal(deg) || "N ↑";
}

// Same cardinal conversion function you added earlier:
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

// Must be triggered by user interaction on iOS
function requestMotionAccess() {
  if (typeof DeviceMotionEvent.requestPermission === "function") {
    DeviceMotionEvent.requestPermission()
      .then((response) => {
        if (response === "granted") {
          console.log("Motion access granted.");
          initCompass();
        } else {
          alert("Motion access denied.");
        }
      })
      .catch(console.error);
  } else {
    // Android & desktops don't require permission
    initCompass();
  }
}

// Hook up the button
window.addEventListener("DOMContentLoaded", () => {
  const btn = document.getElementById("btn-request-motion");
  if (btn) {
    btn.addEventListener("click", requestMotionAccess);
  }
});

// =========================
// MODE SWITCHING
// =========================

function showHUDMode() {
  document.getElementById("hud-root").style.display = "block";
  document.getElementById("camera-mode").style.display = "none";
}

function showCameraMode() {
  document.getElementById("hud-root").style.display = "none";
  document.getElementById("camera-mode").style.display = "block";

  // 🔥 Show Consumer overlay
  const consumer = document.getElementById("consumer-mode");
  if (consumer) consumer.style.display = "block";

  startCamera();
}


function startCamera() {
  const video = document.getElementById("camera-feed");

  navigator.mediaDevices.getUserMedia({
    video: { facingMode: "environment" }
  })
  .then(stream => {
    video.srcObject = stream;
  })
  .catch(err => {
    console.error("Camera error:", err);
    alert("Unable to access camera.");
  });
}

window.addEventListener("DOMContentLoaded", () => {
  document.getElementById("btn-hud-mode").addEventListener("click", showHUDMode);
  document.getElementById("btn-camera-mode").addEventListener("click", showCameraMode);
});

function toRad(x) {
  return x * Math.PI / 180;
}

// Haversine distance in meters
function distanceBetween(lat1, lon1, lat2, lon2) {
  const R = 6371e3; // meters
  const φ1 = toRad(lat1);
  const φ2 = toRad(lat2);
  const Δφ = toRad(lat2 - lat1);
  const Δλ = toRad(lon2 - lon1);

  const a = Math.sin(Δφ/2)**2 +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ/2)**2;

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

  return R * c;
}

// Bearing from you → tag, in degrees
function bearingTo(lat1, lon1, lat2, lon2) {
  const φ1 = toRad(lat1);
  const φ2 = toRad(lat2);
  const λ1 = toRad(lon1);
  const λ2 = toRad(lon2);

  const y = Math.sin(λ2 - λ1) * Math.cos(φ2);
  const x = Math.cos(φ1)*Math.sin(φ2) -
            Math.sin(φ1)*Math.cos(φ2)*Math.cos(λ2 - λ1);
  
  let brng = Math.atan2(y, x) * 180 / Math.PI;
  return (brng + 360) % 360;
}

function updateCameraTags(userLat, userLon, userHeading) {
  const container = document.getElementById("camera-tags");
  container.innerHTML = ""; // clear old indicators

  testTags.forEach((tag, index) => {
    const d = distanceBetween(userLat, userLon, tag.lat, tag.lon);
    const bearing = bearingTo(userLat, userLon, tag.lat, tag.lon);

    // Angle difference
   let diff = ((bearing - userHeading + 540) % 360) - 180;

    // Behind indicator
    if (Math.abs(diff) > 90) {
      const el = document.createElement("div");
      el.className = "camera-tag behind";
      el.textContent = `◀ ${tag.name} (${Math.round(d)}m)`;
      container.appendChild(el);
      return;
    }

    // Position arrow horizontally
    const screenWidth = window.innerWidth;
    const x = (diff / 90) * (screenWidth / 2); // -90° left, +90° right

    const tagEl = document.createElement("div");
    tagEl.className = "camera-tag";
    tagEl.style.left = `${(screenWidth / 2) + x}px`;
    tagEl.style.top = `${55 + (index * 6)}%`; // adjust as needed
    tagEl.textContent = `▶ ${tag.name} (${Math.round(d)}m)`;

    container.appendChild(tagEl);
  });
}

let smoothLat = null;
let smoothLon = null;

function smoothGPS(lat, lon) {
  if (smoothLat === null) {
    // first time: initialize smoothing
    smoothLat = lat;
    smoothLon = lon;
    return { lat, lon };
  }

  const alpha = 0.1; // smoothing factor
  smoothLat = alpha * lat + (1 - alpha) * smoothLat;
  smoothLon = alpha * lon + (1 - alpha) * smoothLon;

  return { lat: smoothLat, lon: smoothLon };
}











