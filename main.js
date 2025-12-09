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

// Listen for compass heading
window.addEventListener("deviceorientation", (event) => {
  let heading = event.alpha; // 0–360 degrees

  if (heading !== null) {
    const headingText = degreesToCardinal(heading);
    document.getElementById("hud-heading-text").textContent = headingText;
  }
});

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
      const lat = pos.coords.latitude;
      const lon = pos.coords.longitude;
      updateCoords(lat, lon);
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
        updateHeading(heading);
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

