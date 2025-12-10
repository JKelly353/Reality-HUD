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
let testTags = [];

// Generate fake tags near the user's actual position
function generateNearbyTestTags() {
  if (!window.currentLat || !window.currentLon) return;

  const lat = window.currentLat;
  const lon = window.currentLon;

  // 0.00001 degrees ≈ 1.1 meters
  testTags = [
    {
      id: 1,
      name: "TEST OBJECT 1",
      lat: lat + 0.00005,  // ~5m north
      lon: lon + 0.00005   // ~5m east
    },
    {
      id: 2,
      name: "TEST OBJECT 2",
      lat: lat - 0.00003,  // ~3m south
      lon: lon - 0.00001   // ~1m west
    },
    {
      id: 3,
      name: "TEST OBJECT 3",
      lat: lat + 0.00002,  // ~2m north
      lon: lon - 0.00004   // ~4m west
    }
  ];
}
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
// R-OS MASTER ORIENTATION HANDLER (with on-screen debug)
// ======================================================

window.addEventListener("deviceorientation", (event) => {

  const dbg = document.getElementById("debug-box");

  // 1️⃣ Handler firing
  dbg.textContent = "MASTER HANDLER FIRED\n";

  let heading = null;

  // Try true compass first
  if (typeof event.webkitCompassHeading === "number") {
    heading = event.webkitCompassHeading;
  }
  // Fallback to alpha
  else if (typeof event.alpha === "number") {
    heading = 360 - event.alpha;
  }
  // No heading at all
  else {
    dbg.textContent += "NO HEADING AVAILABLE\n";
    return;
  }

  // 2️⃣ Raw heading
  dbg.textContent += "Raw heading chosen: " + heading + "\n";

  // Smooth heading
  const stableHeading = smoothCompassHeading(heading);

  // 3️⃣ Stable heading
  dbg.textContent += "Stable heading: " + stableHeading + "\n";

  // Tactical mode (camera arrows)
  if (window.currentLat && window.currentLon) {
    updateCameraTags(window.currentLat, window.currentLon, stableHeading);
  }

  // Consumer Mode logic
  const consumerModeActive = (document.getElementById("consumer-mode").style.display === "block");

  // 4️⃣ Consumer mode state
  dbg.textContent += "Consumer Mode active: " + consumerModeActive + "\n";

  if (consumerModeActive) {
    const tag = testTags[0];

    if (tag && window.currentLat && window.currentLon) {
      const d = distanceBetween(window.currentLat, window.currentLon, tag.lat, tag.lon);
      const bearing = bearingTo(window.currentLat, window.currentLon, tag.lat, tag.lon);

      let diff = ((bearing - stableHeading + 540) % 360) - 180;

      // 5️⃣ Angle diff
      dbg.textContent += "Diff (bearing difference): " + diff + "\n";

      updateConsumerDirection(diff);
      updateConsumerTagInfo(tag.name, d);
    }
  }
});

      
let smoothHeading = null;

function smoothCompassHeading(raw) {
  if (smoothHeading === null) smoothHeading = raw;

  // Reject wild compass jumps (>25°)
  if (Math.abs(raw - smoothHeading) > 25) {
    return smoothHeading; // ignore spike
  }

  const alpha = 0.05; // stronger smoothing
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
    // Create nearby test tags once GPS is available
if (testTags.length === 0) generateNearbyTestTags();


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
  if (typeof DeviceOrientationEvent.requestPermission === "function") {
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

  const consumer = document.getElementById("consumer-mode");
  if (consumer) consumer.style.display = "none";
}

function showCameraMode() {
  console.log("SHOW CAMERA MODE FIRED");

  document.getElementById("hud-root").style.display = "none";
  document.getElementById("camera-mode").style.display = "block";

  const el = document.getElementById("consumer-mode");
  console.log("consumer-mode element:", el);

  // 🔥 FORCE this ON
  document.getElementById("consumer-mode").style.display = "block";

  console.log("consumer-mode final display =", document.getElementById("consumer-mode").style.display);

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
  document.getElementById("btn-camera-mode").addEventListener("click", () => {
  console.log("CAMERA MODE BUTTON CLICKED");
  showCameraMode();
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
window.forceConsumerMode = () => {
  document.getElementById("consumer-mode").style.display = "block";
};




























