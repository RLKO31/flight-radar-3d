import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';




// --- CONFIGURATION & CONSTANTS ---
const EARTH_RADIUS = 5;
const MUNICH_COORDS = { lat: 48.3538, lon: 11.7861 }; // MUC / EDDM
const UPDATE_INTERVAL = 15000; // OpenSky limits anonymous requests to 10-15s

const AIRPORTS = [
  { name: "München (MUC / EDDM)", lat: 48.3538, lon: 11.7861, code: "EDDM" },
  { name: "Frankfurt (FRA / EDDF)", lat: 50.0379, lon: 8.5622, code: "EDDF" },
  { name: "London Heathrow (LHR / EGLL)", lat: 51.4700, lon: -0.4543, code: "EGLL" },
  { name: "Paris Charles de Gaulle (CDG / LFPG)", lat: 49.0097, lon: 2.5479, code: "LFPG" },
  { name: "Amsterdam Schiphol (AMS / EHAM)", lat: 52.3105, lon: 4.7683, code: "EHAM" },
  { name: "New York (JFK / KJFK)", lat: 40.6398, lon: -73.7789, code: "KJFK" },
  { name: "Dubai (DXB / OMDB)", lat: 25.2532, lon: 55.3657, code: "OMDB" },
  { name: "Singapore Changi (SIN / WSSS)", lat: 1.3644, lon: 103.9911, code: "WSSS" },
  { name: "Tokyo Haneda (HND / RJTT)", lat: 35.5494, lon: 139.7798, code: "RJTT" },
  { name: "Sydney (SYD / YSSY)", lat: -33.9461, lon: 151.1772, code: "YSSY" }
];

// Assets URLs
const TEXTURES = {
  day: 'https://unpkg.com/three-globe/example/img/earth-blue-marble.jpg',
  bump: 'https://unpkg.com/three-globe/example/img/earth-topology.png',
  specular: 'https://unpkg.com/three-globe/example/img/earth-water.png',
  clouds: 'https://clouds.matteason.co.uk/images/2048x1024/clouds.jpg',
  cloudsFallback: './clouds_backup.jpg'
};

// --- STATE VARIABLES ---
let scene, camera, renderer, controls;
let earthMesh, cloudsMesh, atmosphereMesh, stars;
let flightsGroup, radarGroup, detailMapOverlayLow, detailMapOverlayMedium, detailMapOverlayHigh, airportsGroup;
let allAirports = []; // Wird dynamisch aus airports.json geladen
let cachedDummyData = null; // Gecachte historische Flugdaten aus json-flight-dummydaten.txt
let activeAirport = AIRPORTS[0]; // München ist standardmäßig aktiv
let flightsData = new Map(); // Store flight objects (mesh, path, target data, lerp state)
let selectedFlightId = null;
let currentRange = 250; // Search radius around Munich in km
let autoRotate = false; // Deaktiviert, um Geokoordinaten perfekt auszurichten
let showClouds = true;
let showTrails = true;
let munichVector3 = new THREE.Vector3();
let apiTimer = null;

// Texture LOD dynamic loading states
let loadedTextures = { low: null, medium: null, high: null };
let loadingStates = { low: false, medium: false, high: false };

// Simulation state
let isSimulatedMode = false;
let simulatedFlights = [];

// UI Elements
const loaderScreen = document.getElementById('loader-screen');
const loadProgress = document.getElementById('load-progress');
const loaderStatus = document.getElementById('loader-status');
const statCount = document.getElementById('stat-count');
const detailsPanel = document.getElementById('details-panel');
const apiStatus = document.getElementById('api-status');

// --- INITIALIZATION ---
function init() {
  updateProgress(10, 'Erstelle 3D-Szene...');
  
  // 1. Setup Scene & Renderer
  scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x030712, 0.015);

  const container = document.getElementById('canvas-container');
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.shadowMap.enabled = true;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  container.appendChild(renderer.domElement);

  // 2. Setup Camera
  camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 0.001, 200);
  
  // 3. Setup OrbitControls
  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;
  controls.minDistance = 0.00005; // Set to 0.00005 for close airport focus at start (approx. 300m height)
  controls.maxDistance = 25.0;
  
  // Calculate Munich 3D Position
  latLonToVector3(activeAirport.lat, activeAirport.lon, 0, munichVector3);
  
  // Focus camera initially looking at Munich Airport
  controls.target.copy(munichVector3);
  camera.position.set(munichVector3.x * 2.2, munichVector3.y * 2.2, munichVector3.z * 2.2);
  controls.update();

  // 4. Setup Lighting
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
  scene.add(ambientLight);

  const sunLight = new THREE.DirectionalLight(0xffffff, 1.8);
  // Position the light to shine from the side, creating nice highlights
  sunLight.position.set(10, 10, 10);
  sunLight.castShadow = true;
  scene.add(sunLight);

  // 5. Add Flights Group
  flightsGroup = new THREE.Group();
  scene.add(flightsGroup);

  // Load Airports Database and ADS-B Replay Data in background concurrently
  fetch('./airports.json')
    .then(res => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    })
    .then(data => {
      allAirports = data;
      populateAirportsDatalist();
    })
    .catch(err => {
      console.warn('Fehler beim Laden der globalen Flughafendatenbank. Nutze Standard-Liste.', err);
      allAirports = AIRPORTS;
      populateAirportsDatalist();
    });

  fetch('./json-flight-dummydaten.txt')
    .then(res => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    })
    .then(data => {
      cachedDummyData = data;
      console.log(`Historische Flugdaten (${data.states ? data.states.length : 0} Flüge) vorab geladen.`);
    })
    .catch(err => console.warn('Preload Flugdaten fehlgeschlagen:', err));

  // 6. Build the universe
  buildStars();
  buildEarth().then(() => {
    updateProgress(80, 'Initialisiere Benutzeroberfläche...');
    setupEventListeners();
    
    // Hide loader
    setTimeout(() => {
      loaderScreen.style.opacity = 0;
      setTimeout(() => loaderScreen.style.display = 'none', 800);
    }, 500);

    // Initial API Fetch
    fetchLiveFlights();
    apiTimer = setInterval(fetchLiveFlights, UPDATE_INTERVAL);
  }).catch((err) => {
    console.error('Initialisierungsfehler:', err);
    updateProgress(100, 'Fehler bei der Initialisierung!');
    const errorDisplay = document.getElementById('error-display');
    if (errorDisplay) {
      errorDisplay.style.display = 'block';
      errorDisplay.textContent += `[Init Error] ${err.stack || err.message || err}\n`;
    }
  });

  // Render Loop
  animate();
}

function populateAirportsDatalist() {
  const datalist = document.getElementById('airports-list');
  if (!datalist) return;
  datalist.innerHTML = '';
  allAirports.forEach(ap => {
    const option = document.createElement('option');
    option.value = ap.name;
    datalist.appendChild(option);
  });
}

// --- MATHEMATICAL GEO-CALCULATIONS ---

/**
 * Converts Latitude, Longitude and Altitude to 3D Cartesian coordinates.
 * @param {number} lat - Latitude in degrees
 * @param {number} lon - Longitude in degrees
 * @param {number} alt - Altitude in meters
 * @param {THREE.Vector3} targetVector - Vector to store the result
 */
function latLonToVector3(lat, lon, alt = 0, targetVector) {
  // Umrechnung in Bogenmaß (phi = Breite, lambda = Länge)
  const phi = lat * (Math.PI / 180);
  const lambda = lon * (Math.PI / 180);
  
  // Skalierung der Flughöhe in den 3D-Weltraum (1 Einheit = Erdradius = 6371 km)
  const earthRadiusInMeters = 6371000;
  const exaggerationFactor = 20; // Überhöhung der Flughöhe für bessere Sichtbarkeit
  const scaledRadius = EARTH_RADIUS + (alt * exaggerationFactor) / earthRadiusInMeters;

  // Mathematische Projektion laut Formel:
  // X = (R+h)*cos(phi)*cos(lambda) -> Mapping auf Three.js x
  // Y = (R+h)*cos(phi)*sin(lambda) -> Mapping auf Three.js z (Äquatorebene) (gespiegelt auf -z für Three.js Ausrichtung)
  // Z = (R+h)*sin(phi)             -> Mapping auf Three.js y (Nordpol-Achse)
  targetVector.x = scaledRadius * Math.cos(phi) * Math.cos(lambda);
  targetVector.y = scaledRadius * Math.sin(phi);
  targetVector.z = -scaledRadius * Math.cos(phi) * Math.sin(lambda);
}

/**
 * Calculates a bounding box around the active airport in degrees.
 * @param {number} radiusKm - Search radius in km
 */
function getBoundingBox(radiusKm) {
  const latDegreeKm = 111.0;
  const lonDegreeKm = 111.0 * Math.cos(activeAirport.lat * (Math.PI / 180));
  
  const dLat = radiusKm / latDegreeKm;
  const dLon = radiusKm / lonDegreeKm;

  return {
    lamin: activeAirport.lat - dLat,
    lamax: activeAirport.lat + dLat,
    lomin: activeAirport.lon - dLon,
    lomax: activeAirport.lon + dLon
  };
}

// --- 3D ENVIRONMENT CREATION ---

function buildStars() {
  const starsGeometry = new THREE.BufferGeometry();
  const starsCount = 2000;
  const starPositions = new Float32Array(starsCount * 3);

  for (let i = 0; i < starsCount * 3; i += 3) {
    const u = Math.random();
    const v = Math.random();
    const theta = u * 2.0 * Math.PI;
    const phi = Math.acos(2.0 * v - 1.0);
    const radius = 80 + Math.random() * 40; // Shell of stars far away

    starPositions[i] = radius * Math.sin(phi) * Math.cos(theta);
    starPositions[i + 1] = radius * Math.sin(phi) * Math.sin(theta);
    starPositions[i + 2] = radius * Math.cos(phi);
  }

  starsGeometry.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
  const starsMaterial = new THREE.PointsMaterial({
    color: 0xffffff,
    size: 0.12,
    transparent: true,
    opacity: 0.7,
    sizeAttenuation: true
  });
  stars = new THREE.Points(starsGeometry, starsMaterial);
  scene.add(stars);
}

// Precision calculation of Web Mercator tile parameters and physical geometry radius
function getLODRadius(lat, zoom, pixelRadius = 460) {
  const R_earth_m = 6378137;
  const latRad = lat * Math.PI / 180;
  const cosLat = Math.cos(latRad);
  const n = Math.pow(2, zoom);
  const metersPerPixel = (2 * Math.PI * R_earth_m * cosLat) / (256 * n);
  const groundRadiusMeters = pixelRadius * metersPerPixel;
  return (groundRadiusMeters / 6371000) * EARTH_RADIUS;
}

function loadMergedSatelliteTexture(lat, lon, zoom = 11) {
  return new Promise((resolve) => {
    const n = Math.pow(2, zoom);
    const fx = (lon + 180) / 360 * n;
    const fy = (1 - Math.log(Math.tan(lat * Math.PI / 180) + 1 / Math.cos(lat * Math.PI / 180)) / Math.PI) * (n / 2);
    
    const tileCenter = { x: Math.floor(fx), y: Math.floor(fy) };
    const subX = fx - tileCenter.x;
    const subY = fy - tileCenter.y;

    // Shift offset to place the exact (lat, lon) at the center (512, 512) of a 1024x1024 texture canvas
    const offsetX = Math.round(512 - (512 + subX * 256));
    const offsetY = Math.round(512 - (512 + subY * 256));

    // Raw tiles canvas
    const rawCanvas = document.createElement('canvas');
    rawCanvas.width = 1280;
    rawCanvas.height = 1280;
    const rawCtx = rawCanvas.getContext('2d');
    rawCtx.fillStyle = '#060a16';
    rawCtx.fillRect(0, 0, 1280, 1280);

    // Final centered texture canvas (1024x1024)
    const finalCanvas = document.createElement('canvas');
    finalCanvas.width = 1024;
    finalCanvas.height = 1024;
    const finalCtx = finalCanvas.getContext('2d');

    const texture = new THREE.CanvasTexture(finalCanvas);
    texture.generateMipmaps = true;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.magFilter = THREE.LinearFilter;

    let loadedCount = 0;
    const totalTiles = 25;

    const composeFinalTexture = () => {
      finalCtx.clearRect(0, 0, 1024, 1024);
      // Draw raw grid shifted so (lat, lon) is at exactly (512, 512)
      finalCtx.drawImage(rawCanvas, offsetX, offsetY);

      // Apply soft circular vignette mask to blend smoothly into globe texture
      finalCtx.save();
      finalCtx.globalCompositeOperation = 'destination-in';
      const grad = finalCtx.createRadialGradient(512, 512, 340, 512, 512, 480);
      grad.addColorStop(0, 'rgba(0, 0, 0, 1)');
      grad.addColorStop(0.7, 'rgba(0, 0, 0, 0.9)');
      grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
      finalCtx.fillStyle = grad;
      finalCtx.fillRect(0, 0, 1024, 1024);
      finalCtx.restore();

      texture.needsUpdate = true;
    };

    for (let dx = -2; dx <= 2; dx++) {
      for (let dy = -2; dy <= 2; dy++) {
        const tileX = tileCenter.x + dx;
        const tileY = tileCenter.y + dy;
        const maxTiles = Math.pow(2, zoom);
        const wrappedX = (tileX % maxTiles + maxTiles) % maxTiles;

        if (tileY < 0 || tileY >= maxTiles) {
          loadedCount++;
          if (loadedCount === totalTiles) composeFinalTexture();
          continue;
        }

        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.src = `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${zoom}/${tileY}/${wrappedX}`;

        const posX = (dx + 2) * 256;
        const posY = (dy + 2) * 256;

        img.onload = () => {
          rawCtx.drawImage(img, posX, posY, 256, 256);
          loadedCount++;
          if (loadedCount === totalTiles) {
            composeFinalTexture();
            console.log(`Satelliten-Luftbilder für ${lat.toFixed(4)}, ${lon.toFixed(4)} bei Zoom ${zoom} zentriert geladen.`);
          }
        };

        img.onerror = () => {
          loadedCount++;
          if (loadedCount === totalTiles) composeFinalTexture();
        };
      }
    }

    resolve(texture);
  });
}

// Berechnet die Kachel-Koordinaten X/Y für das Web-Mercator-Kachelgitter
function getTileCoords(lat, lon, zoom) {
  const x = Math.floor((lon + 180) / 360 * Math.pow(2, zoom));
  const y = Math.floor((1 - Math.log(Math.tan(lat * Math.PI / 180) + 1 / Math.cos(lat * Math.PI / 180)) / Math.PI) * Math.pow(2, zoom - 1));
  return { x, y };
}

async function buildEarth() {
  updateProgress(30, 'Lade Texturen...');
  const textureLoader = new THREE.TextureLoader();

  // Create loading manager to track texture progress with a 2-second timeout per texture
  const loadTexture = (type, url, fallbackUrl = null) => {
    return new Promise((resolve) => {
      let resolved = false;

      const tryFallback = () => {
        if (fallbackUrl) {
          textureLoader.load(
            fallbackUrl,
            (tex) => {
              if (!resolved) {
                resolved = true;
                resolve(tex);
              }
            },
            undefined,
            () => {
              if (!resolved) {
                resolved = true;
                resolve(createFallbackTexture(type));
              }
            }
          );
        } else {
          if (!resolved) {
            resolved = true;
            resolve(createFallbackTexture(type));
          }
        }
      };

      // 3 seconds timeout to prevent hanging on slow connections or firewalls
      const timeout = setTimeout(() => {
        if (!resolved) {
          console.warn(`Timeout beim Laden der Textur: ${type}. Nutze Fallback.`);
          tryFallback();
        }
      }, 3000);

      textureLoader.load(
        url,
        (texture) => {
          if (!resolved) {
            resolved = true;
            clearTimeout(timeout);
            resolve(texture);
          }
        },
        undefined,
        (err) => {
          if (!resolved) {
            clearTimeout(timeout);
            console.warn(`Fehler beim Laden der Textur: ${type}. Versuche Fallback.`, err);
            tryFallback();
          }
        }
      );
    });
  };

  const [dayTex, bumpTex, specTex, cloudsTex] = await Promise.all([
    loadTexture('day', TEXTURES.day),
    loadTexture('bump', TEXTURES.bump),
    loadTexture('specular', TEXTURES.specular),
    loadTexture('clouds', TEXTURES.clouds, TEXTURES.cloudsFallback)
  ]);



  updateProgress(60, 'Generiere 3D-Globus...');

  // 1. Earth Mesh (Erhöht auf 128 Segmente für perfekte Rundung bei nahem Zoom)
  const earthGeo = new THREE.SphereGeometry(EARTH_RADIUS, 128, 128);
  const earthMat = new THREE.MeshStandardMaterial({
    map: dayTex,
    bumpMap: bumpTex,
    bumpScale: 0.04,
    roughnessMap: specTex, // High specularity on oceans (dark in water map), low on land
    roughness: 0.6,
    metalness: 0.1
  });
  
  // Customizing standard material to react beautifully with light
  if (specTex !== null) {
    earthMat.onBeforeCompile = (shader) => {
      // Modify shader for premium specular highlights
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <roughnessmap_fragment>',
        `
        #include <roughnessmap_fragment>
        // Invert water map to get high specular reflexions on oceans and none on land
        roughnessFactor = roughnessFactor * (1.0 - texelRoughness.g * 0.9);
        `
      );
    };
  }

  earthMesh = new THREE.Mesh(earthGeo, earthMat);
  earthMesh.receiveShadow = true;
  earthMesh.scale.z = 1; // Keine Spiegelung der Geometrie, um Länder richtig herum anzuzeigen!
  scene.add(earthMesh);

  // 2. Clouds Layer (Erhöht auf 128 Segmente)
  const cloudsGeo = new THREE.SphereGeometry(EARTH_RADIUS * 1.012, 128, 128);
  const cloudsMat = new THREE.MeshStandardMaterial({
    alphaMap: cloudsTex,
    transparent: true,
    depthWrite: false,
    color: 0xffffff,
    blending: THREE.NormalBlending
  });
  cloudsMesh = new THREE.Mesh(cloudsGeo, cloudsMat);
  cloudsMesh.scale.z = 1; // Keine Wolken-Spiegelung der Geometrie
  scene.add(cloudsMesh);

  // 3. Atmosphere Glow (Shader)
  const glowGeo = new THREE.SphereGeometry(EARTH_RADIUS * 1.04, 64, 64);
  
  // Custom atmospheric shader
  const glowMat = new THREE.ShaderMaterial({
    vertexShader: `
      varying vec3 vNormal;
      varying vec3 vViewPosition;
      void main() {
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        vNormal = normalize(normalMatrix * normal);
        vViewPosition = -mvPosition.xyz;
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: `
      varying vec3 vNormal;
      varying vec3 vViewPosition;
      void main() {
        vec3 normal = normalize(vNormal);
        vec3 viewDir = normalize(vViewPosition);
        // Calculate rim glow based on surface angle to camera
        float intensity = pow(0.65 - dot(normal, viewDir), 2.5);
        // Clean cyber-blue atmosphere glow
        gl_FragColor = vec4(0.02, 0.45, 0.8, 1.0) * intensity;
      }
    `,
    blending: THREE.AdditiveBlending,
    side: THREE.BackSide,
    transparent: true,
    depthWrite: false
  });

  atmosphereMesh = new THREE.Mesh(glowGeo, glowMat);
  scene.add(atmosphereMesh);

  // Initialize Airport Radar Group with concentric range rings scaled to currentRange
  radarGroup = new THREE.Group();
  scene.add(radarGroup);
  rebuildRadarGroup(currentRange);

  // Position and orient flat to the globe surface at active Airport
  radarGroup.position.copy(munichVector3);
  const upVector = munichVector3.clone().normalize();
  radarGroup.lookAt(munichVector3.clone().add(upVector));

  // Add a small pulsing light source above Munich
  const munichLight = new THREE.PointLight(0x06b6d4, 1.2, 1.5);
  munichLight.position.copy(munichVector3).multiplyScalar(1.05);
  scene.add(munichLight);

  // Detaillierte Karten-Overlays (LOD) für den aktiven Flughafen
  // Detaillierte Karten-Overlays (LOD) für den aktiven Flughafen
  // Initialize meshes with transparent materials. Maps will be loaded on demand.
  // 1. Low LOD (Zoom 11)
  const lowRadius = getLODRadius(activeAirport.lat, 11, 460);
  const lowGeo = new THREE.CircleGeometry(lowRadius, 64);
  const lowMat = new THREE.MeshStandardMaterial({
    map: null,
    transparent: true,
    opacity: 0.0,
    roughness: 0.8,
    metalness: 0.1,
    side: THREE.DoubleSide,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1
  });
  detailMapOverlayLow = new THREE.Mesh(lowGeo, lowMat);
  detailMapOverlayLow.position.copy(munichVector3).multiplyScalar(1.0001);
  orientOverlayMesh(detailMapOverlayLow, munichVector3);
  detailMapOverlayLow.scale.set(1, 1, 1); // Exact 1:1 scale (no distorted ellipse)
  scene.add(detailMapOverlayLow);

  // 2. Medium LOD (Zoom 13)
  const medRadius = getLODRadius(activeAirport.lat, 13, 460);
  const medGeo = new THREE.CircleGeometry(medRadius, 64);
  const medMat = new THREE.MeshStandardMaterial({
    map: null,
    transparent: true,
    opacity: 0.0,
    roughness: 0.8,
    metalness: 0.1,
    side: THREE.DoubleSide,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -1
  });
  detailMapOverlayMedium = new THREE.Mesh(medGeo, medMat);
  detailMapOverlayMedium.position.copy(munichVector3).multiplyScalar(1.0002);
  orientOverlayMesh(detailMapOverlayMedium, munichVector3);
  detailMapOverlayMedium.scale.set(1, 1, 1);
  scene.add(detailMapOverlayMedium);

  // 3. High LOD (Zoom 16)
  const highRadius = getLODRadius(activeAirport.lat, 16, 460);
  const highGeo = new THREE.CircleGeometry(highRadius, 64);
  const highMat = new THREE.MeshStandardMaterial({
    map: null,
    transparent: true,
    opacity: 0.0,
    roughness: 0.8,
    metalness: 0.1,
    side: THREE.DoubleSide,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -3,
    polygonOffsetUnits: -1
  });
  detailMapOverlayHigh = new THREE.Mesh(highGeo, highMat);
  detailMapOverlayHigh.position.copy(munichVector3).multiplyScalar(1.0003);
  orientOverlayMesh(detailMapOverlayHigh, munichVector3);
  detailMapOverlayHigh.scale.set(1, 1, 1);
  scene.add(detailMapOverlayHigh);
}

/**
 * Dynamically rebuilds concentric radar range rings and sweep to match currentRange exactly.
 */
function rebuildRadarGroup(rangeKm) {
  if (!radarGroup) return;

  // Clear existing radar meshes and geometries
  while (radarGroup.children.length > 0) {
    const child = radarGroup.children[0];
    radarGroup.remove(child);
    if (child.geometry) child.geometry.dispose();
    if (child.material) {
      if (Array.isArray(child.material)) child.material.forEach(m => m.dispose());
      else child.material.dispose();
    }
  }

  // Globe radius is 5.0 (Earth radius ~ 6371 km). Outer ring matches rangeKm exactly:
  const maxWorldRadius = (rangeKm / 6371.0) * 5.0;
  
  // Concentric Radar Rings proportionally spaced
  const fractions = [0.15, 0.35, 0.65, 1.0];
  fractions.forEach((frac, index) => {
    const radius = maxWorldRadius * frac;
    const ringGeo = new THREE.RingGeometry(Math.max(0.001, radius - 0.0012), radius + 0.0012, 64);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x06b6d4,
      transparent: true,
      opacity: frac === 1.0 ? 0.75 : 0.35 / (index + 1),
      side: THREE.DoubleSide
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    radarGroup.add(ring);
  });

  // Center airport runways representation: Two parallel lines oriented 080°
  const runwayGeo = new THREE.BufferGeometry();
  const runwayVertices = new Float32Array([
    -0.008, 0.0015, 0,
     0.008, 0.0015, 0,
    -0.008, -0.0015, 0,
     0.008, -0.0015, 0
  ]);
  runwayGeo.setAttribute('position', new THREE.BufferAttribute(runwayVertices, 3));
  const runwayMat = new THREE.LineBasicMaterial({
    color: 0x06b6d4,
    transparent: true,
    opacity: 0.85,
    linewidth: 1.5
  });
  const runways = new THREE.LineSegments(runwayGeo, runwayMat);
  runways.rotateZ(80 * Math.PI / 180);
  radarGroup.add(runways);

  // Radar sweep line (cone sector) matching exact outer radius
  const sweepGeo = new THREE.RingGeometry(0, maxWorldRadius, 32, 1, 0, Math.PI / 6);
  const sweepMat = new THREE.MeshBasicMaterial({
    color: 0x06b6d4,
    transparent: true,
    opacity: 0.15,
    side: THREE.DoubleSide
  });
  const sweep = new THREE.Mesh(sweepGeo, sweepMat);
  radarGroup.add(sweep);
  radarGroup.userData = { sweep };
}

// Orients a flat circle overlay tangent to the sphere with North pointing Up (+Y)
function orientOverlayMesh(mesh, position) {
  const up = position.clone().normalize(); // surface normal
  const north = new THREE.Vector3(0, 1, 0);
  let tangentNorth = north.clone().projectOnPlane(up).normalize();
  if (tangentNorth.lengthSq() < 0.001) {
    tangentNorth = new THREE.Vector3(0, 0, 1).projectOnPlane(up).normalize();
  }
  const tangentEast = new THREE.Vector3().crossVectors(tangentNorth, up).normalize();
  
  // Matrix columns: X = East, Y = North, Z = Up (normal)
  const mat = new THREE.Matrix4();
  mat.makeBasis(tangentEast, tangentNorth, up);
  mesh.quaternion.setFromRotationMatrix(mat);
}

// Fallback Texture generator in case unpkg is offline or slow
function createFallbackTexture(type) {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');
  
  if (type === 'day') {
    // Fill deep cosmic blue background
    ctx.fillStyle = '#0a0f1d';
    ctx.fillRect(0, 0, 1024, 512);

    // Draw grid lines (latitude and longitude lines)
    ctx.strokeStyle = 'rgba(6, 182, 212, 0.1)';
    ctx.lineWidth = 0.5;
    for (let i = 0; i < 1024; i += 32) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i, 512);
      ctx.stroke();
    }
    for (let j = 0; j < 512; j += 32) {
      ctx.beginPath();
      ctx.moveTo(0, j);
      ctx.lineTo(1024, j);
      ctx.stroke();
    }

    // Draw organic procedural landmasses
    ctx.fillStyle = '#111e38';
    for (let x = 0; x < 1024; x += 4) {
      for (let y = 0; y < 512; y += 4) {
        const lon = (x / 1024) * 360 - 180;
        const lat = (y / 512) * 180 - 90;
        
        // Simple organic land noise formula
        const val = Math.sin(lat * 0.04) * Math.sin(lon * 0.03) + 
                    Math.cos(lat * 0.08 + lon * 0.04) * 0.45 + 
                    Math.sin(lat * 0.15) * Math.cos(lon * 0.15) * 0.25;
        
        if (val > -0.05) {
          ctx.fillRect(x, y, 4, 4);
        }
      }
    }
  } 
  else if (type === 'bump') {
    // Flat neutral gray bump map
    ctx.fillStyle = '#808080';
    ctx.fillRect(0, 0, 1024, 512);
  } 
  else if (type === 'specular') {
    // Oceans reflective (white), land matte (black)
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, 1024, 512);
    
    ctx.fillStyle = '#000000';
    for (let x = 0; x < 1024; x += 8) {
      for (let y = 0; y < 512; y += 8) {
        const lon = (x / 1024) * 360 - 180;
        const lat = (y / 512) * 180 - 90;
        
        const val = Math.sin(lat * 0.04) * Math.sin(lon * 0.03) + 
                    Math.cos(lat * 0.08 + lon * 0.04) * 0.45 + 
                    Math.sin(lat * 0.15) * Math.cos(lon * 0.15) * 0.25;
        
        if (val > -0.05) {
          ctx.fillRect(x, y, 8, 8);
        }
      }
    }
  } 
  else if (type === 'clouds') {
    // Transparent layer with fluffy white procedural clouds
    ctx.fillStyle = 'rgba(0,0,0,0)';
    ctx.fillRect(0, 0, 1024, 512);
    
    for (let i = 0; i < 25; i++) {
      const cx = Math.random() * 1024;
      const cy = Math.random() * 512;
      const r = 40 + Math.random() * 80;
      
      const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
      grad.addColorStop(0, 'rgba(255, 255, 255, 0.22)');
      grad.addColorStop(0.5, 'rgba(255, 255, 255, 0.1)');
      grad.addColorStop(1, 'rgba(255, 255, 255, 0)');
      
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  return texture;
}

// --- PROCEDURAL 3D AIRPLANE CREATION ---

/**
 * Creates a beautiful stylized low-poly airplane Group in Three.js.
 * @param {string} category - Airplane category ('heavy', 'medium', 'light', 'military')
 * @returns {THREE.Group}
 */
function createAirplaneMesh(category, onGround = false) {
  const planeGroup = new THREE.Group();

  // Premium Cyberpunk colors
  const fuselageColor = 0xe2e8f0; // Off-white
  let wingColor = 0x0ea5e9; // Blue for standard medium
  let exhaustColor = 0xf43f5e; // Neon Red/Pink

  // Custom colors depending on category/ground state
  if (onGround) {
    wingColor = 0xf59e0b; // Amber/Orange for planes on the ground
  } else if (category === 'heavy') {
    wingColor = 0x06b6d4; // Cyan for heavy jumbo jets
  } else if (category === 'light') {
    wingColor = 0x10b981; // Green for light private planes
  } else if (category === 'military') {
    wingColor = 0x64748b; // Slate for jets
    exhaustColor = 0xf59e0b; // Amber exhaust
  }

  const matFuselage = new THREE.MeshStandardMaterial({ color: fuselageColor, roughness: 0.3, metalness: 0.1 });
  const matWings = new THREE.MeshStandardMaterial({ color: wingColor, roughness: 0.4, metalness: 0.4 });
  const matWindows = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.1 });
  const matEngine = new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.8, roughness: 0.2 });
  const matExhaust = new THREE.MeshBasicMaterial({ color: exhaustColor });

  // 1. Fuselage (centered along Z axis)
  const fuselageGeo = new THREE.CylinderGeometry(0.04, 0.02, 0.5, 6);
  fuselageGeo.rotateX(Math.PI / 2); // Make it point along Z axis
  const fuselage = new THREE.Mesh(fuselageGeo, matFuselage);
  fuselage.name = "part_fuselage";
  planeGroup.add(fuselage);

  // Nose cone (Z+)
  const noseGeo = new THREE.ConeGeometry(0.04, 0.12, 6);
  noseGeo.rotateX(Math.PI / 2);
  const nose = new THREE.Mesh(noseGeo, matFuselage);
  nose.position.set(0, 0, 0.31);
  nose.name = "part_nose";
  planeGroup.add(nose);

  // Cockpit window
  const windowGeo = new THREE.BoxGeometry(0.045, 0.02, 0.05);
  const windowMesh = new THREE.Mesh(windowGeo, matWindows);
  windowMesh.position.set(0, 0.025, 0.22);
  windowMesh.rotation.x = -Math.PI / 8;
  planeGroup.add(windowMesh);

  // 2. Solid 3D Wings (Left & Right boxes, slanting back and slanting up dihedral)
  let wingSpan = 0.65;
  let wingChord = 0.08;
  if (category === 'heavy') {
    wingSpan = 0.85;
    wingChord = 0.12;
  } else if (category === 'light') {
    wingSpan = 0.45;
    wingChord = 0.06;
  }

  // Left wing
  const leftWingGeo = new THREE.BoxGeometry(wingSpan / 2, 0.015, wingChord);
  leftWingGeo.translate(-wingSpan / 4, 0, 0); // shift origin to wing root
  const leftWing = new THREE.Mesh(leftWingGeo, matWings);
  leftWing.position.set(0, -0.01, 0.05);
  leftWing.rotation.y = -0.15; // Sweep back
  leftWing.rotation.z = 0.05;  // Dihedral angle (slanted up)
  leftWing.name = "part_wings_left";
  planeGroup.add(leftWing);

  // Right wing
  const rightWingGeo = new THREE.BoxGeometry(wingSpan / 2, 0.015, wingChord);
  rightWingGeo.translate(wingSpan / 4, 0, 0); // shift origin to wing root
  const rightWing = new THREE.Mesh(rightWingGeo, matWings);
  rightWing.position.set(0, -0.01, 0.05);
  rightWing.rotation.y = 0.15;  // Sweep back
  rightWing.rotation.z = -0.05; // Dihedral angle (slanted up)
  rightWing.name = "part_wings_right";
  planeGroup.add(rightWing);

  // 3. Solid 3D Tail horizontal stabilizers
  const tailHSpan = wingSpan * 0.35;
  const tailHChord = wingChord * 0.7;

  // Left tail stabilizer
  const leftTailHGeo = new THREE.BoxGeometry(tailHSpan / 2, 0.01, tailHChord);
  leftTailHGeo.translate(-tailHSpan / 4, 0, 0);
  const leftTailH = new THREE.Mesh(leftTailHGeo, matWings);
  leftTailH.position.set(0, 0.01, -0.2);
  leftTailH.rotation.y = -0.25; // Sweep back
  leftTailH.name = "part_tailH_left";
  planeGroup.add(leftTailH);

  // Right tail stabilizer
  const rightTailHGeo = new THREE.BoxGeometry(tailHSpan / 2, 0.01, tailHChord);
  rightTailHGeo.translate(tailHSpan / 4, 0, 0);
  const rightTailH = new THREE.Mesh(rightTailHGeo, matWings);
  rightTailH.position.set(0, 0.01, -0.2);
  rightTailH.rotation.y = 0.25; // Sweep back
  rightTailH.name = "part_tailH_right";
  planeGroup.add(rightTailH);

  // Solid 3D Vertical fin
  const finHeight = 0.14;
  const finGeo = new THREE.BoxGeometry(0.01, finHeight, tailHChord);
  finGeo.translate(0, finHeight / 2, -tailHChord / 4);
  const fin = new THREE.Mesh(finGeo, matWings);
  fin.position.set(0, 0.02, -0.2);
  fin.rotation.x = -0.2; // Slant backward
  fin.name = "part_fin";
  planeGroup.add(fin);

  // 4. Engines & Jet Exhaust (under wings)
  if (category === 'heavy' || category === 'medium' || category === 'military') {
    const engineCount = category === 'heavy' ? 2 : 1; // engines per wing
    const offsets = category === 'heavy' ? [0.12, 0.22] : [0.12];

    offsets.forEach((offsetX) => {
      // Left and Right engines
      [-1, 1].forEach((side) => {
        const engineGeo = new THREE.CylinderGeometry(0.015, 0.012, 0.1, 5);
        engineGeo.rotateX(Math.PI / 2);
        const engine = new THREE.Mesh(engineGeo, matEngine);
        engine.position.set(offsetX * side, -0.03, 0.08);
        engine.name = `part_engine_${side}_${offsetX}`;
        planeGroup.add(engine);

        // Exhaust glow
        const glowEngineGeo = new THREE.CylinderGeometry(0.01, 0.005, 0.02, 5);
        glowEngineGeo.rotateX(Math.PI / 2);
        const glowEngine = new THREE.Mesh(glowEngineGeo, matExhaust);
        glowEngine.position.set(offsetX * side, -0.03, 0.025);
        planeGroup.add(glowEngine);
      });
    });
  }

  // Casting shadows
  planeGroup.traverse((child) => {
    if (child.isMesh) {
      child.castShadow = true;
      child.receiveShadow = true;
    }
  });

  return planeGroup;
}

// --- FLIGHT TRAILS CREATION ---

function createTrail(startPos) {
  const maxPoints = 50;
  const positions = new Float32Array(maxPoints * 3);
  
  // Fill all initial points with the start position
  for (let i = 0; i < maxPoints; i++) {
    positions[i * 3] = startPos.x;
    positions[i * 3 + 1] = startPos.y;
    positions[i * 3 + 2] = startPos.z;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

  // Create gradient trail material using standard line basic
  // (In a more advanced setup we could use Line2 for thickness, but Line is very performant)
  const material = new THREE.LineBasicMaterial({
    color: 0x06b6d4,
    transparent: true,
    opacity: 0.6,
    blending: THREE.AdditiveBlending,
    linewidth: 2 // Note: linewidth > 1 is ignored by most WebGL implementations
  });

  const line = new THREE.Line(geometry, material);
  line.visible = showTrails;
  scene.add(line);

  return {
    line,
    geometry,
    positions,
    maxPoints,
    currentCount: 1
  };
}

function updateTrailPositions(trail, newPos) {
  const positions = trail.positions;
  
  // Shift old positions back
  for (let i = trail.maxPoints - 1; i > 0; i--) {
    positions[i * 3] = positions[(i - 1) * 3];
    positions[i * 3 + 1] = positions[(i - 1) * 3 + 1];
    positions[i * 3 + 2] = positions[(i - 1) * 3 + 2];
  }

  // Put new position at index 0
  positions[0] = newPos.x;
  positions[1] = newPos.y;
  positions[2] = newPos.z;

  trail.geometry.attributes.position.needsUpdate = true;
}

// --- OPENSKY API SERVICE ---

async function fetchLiveFlights() {
  const isLocalServer = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
  const bbox = getBoundingBox(currentRange);
  const proxyUrl = `/api/flights?lamin=${bbox.lamin.toFixed(4)}&lomin=${bbox.lomin.toFixed(4)}&lamax=${bbox.lamax.toFixed(4)}&lomax=${bbox.lomax.toFixed(4)}`;

  if (isLocalServer) {
    updateApiIndicator('loading');
    try {
      const response = await fetch(proxyUrl);
      if (response.ok) {
        const data = await response.json();
        if (data.states && data.states.length > 0) {
          if (isSimulatedMode) {
            isSimulatedMode = false;
            simulatedFlights = [];
          }
          processFlightStates(data.states);
          updateApiIndicator('success');
          const toast = document.getElementById('api-error-toast');
          if (toast) toast.classList.remove('active');
          return;
        }
      }
    } catch (e) {
      console.log('Lokaler Proxy nicht aktiv, wechsle auf ADS-B Replay-Engine.');
    }
  }

  // Auf GitHub Pages / statischem Hosting oder bei Offline-Proxy:
  // Schneller und zuverlässiger Start der Replay-Engine
  startSimulation();
}

// --- SIMULATION & REPLAY FALLBACK ENGINE ---

async function startSimulation(customMessage = null) {
  if (isSimulatedMode) {
    updateSimulation();
    updateApiIndicator('success');
    return;
  }
  isSimulatedMode = true;
  updateApiIndicator('loading');

  // Falls Dummy-Daten noch nicht geladen sind, lade sie
  if (!cachedDummyData) {
    try {
      const res = await fetch('./json-flight-dummydaten.txt');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      cachedDummyData = await res.json();
      console.log(`Historische Flugdaten (${cachedDummyData.states ? cachedDummyData.states.length : 0} Flüge) geladen.`);
    } catch (err) {
      console.error("Konnte Dummy-Daten nicht laden, nutze prozedurale Flüge.", err);
      // Fallback: Prozedurale Flüge
      generateProceduralFlights();
      feedSimulatedData();
      return;
    }
  }

  // Filter reale Flüge um den aktiven Flughafen präzise nach dem ausgewählten Suchradius
  simulatedFlights = [];
  const bbox = getBoundingBox(currentRange);

  let filteredStates = cachedDummyData.states.filter(state => {
    const lon = state[5];
    const lat = state[6];
    if (lat === null || lon === null) return false;
    // 1. Schneller Bounding-Box Vorabcheck
    if (lat < bbox.lamin || lat > bbox.lamax || lon < bbox.lomin || lon > bbox.lomax) return false;
    // 2. Exakter sphärischer Radius-Check (verhindert Verzerrung an den Box-Ecken)
    const dist = getDistanceKm(lat, lon, activeAirport.lat, activeAirport.lon);
    return dist <= currentRange;
  });

  // Begrenzen auf max 40 Flüge für flüssige 60 FPS Performance
  filteredStates = filteredStates.slice(0, 40);
  
  if (filteredStates.length === 0) {
    // Falls selbst im Radius keine Flüge vorliegen:
    generateProceduralFlights();
  } else {
    filteredStates.forEach(state => {
      const icao = state[0].trim();
      const callsign = state[1] ? state[1].trim() : `N/A (${icao})`;
      const country = state[2] || 'Unbekannt';
      const lon = state[5];
      const lat = state[6];
      const alt = state[7] || 3000;
      const onGround = state[8] || false;
      const speed = state[9] ? Math.round(state[9] * 3.6) : 400; // m/s zu km/h
      const heading = state[10] || 0;
      const categoryVal = state[17];

      simulatedFlights.push({
        icao,
        callsign,
        country,
        lat,
        lon,
        initialLat: lat,
        initialLon: lon,
        alt,
        speed,
        heading,
        categoryVal,
        onGround
      });
    });
    console.log(`${simulatedFlights.length} reale Flugdaten innerhalb von ${currentRange} km um ${activeAirport.name} geladen.`);
  }

  feedSimulatedData();
}

function generateProceduralFlights() {
  simulatedFlights = [];
  const numFlights = 10;
  const carriers = [
    { call: 'DLH', country: 'Germany' },
    { call: 'EWG', country: 'Germany' },
    { call: 'RYR', country: 'Ireland' },
    { call: 'EJU', country: 'Austria' },
    { call: 'BAW', country: 'United Kingdom' }
  ];

  for (let i = 0; i < numFlights; i++) {
    const carrier = carriers[i % carriers.length];
    const flightNumber = Math.floor(100 + Math.random() * 9000);
    const icao = 'sim' + Math.floor(100000 + Math.random() * 900000).toString(16);
    
    const angle = Math.random() * Math.PI * 2;
    const distanceKm = 30 + Math.random() * (currentRange * 0.85);
    
    const latOffset = (distanceKm * Math.cos(angle)) / 111.0;
    const lonOffset = (distanceKm * Math.sin(angle)) / (111.0 * Math.cos(activeAirport.lat * Math.PI / 180));
    
    const lat = activeAirport.lat + latOffset;
    const lon = activeAirport.lon + lonOffset;
    
    const angleToAirport = Math.atan2(activeAirport.lon - lon, activeAirport.lat - lat) * 180 / Math.PI;
    const heading = (angleToAirport + 360 + (Math.random() * 90 - 45)) % 360;
    const speed = 300 + Math.floor(Math.random() * 550);
    const alt = 1500 + Math.floor(Math.random() * 8000);
    
    simulatedFlights.push({
      icao,
      callsign: `${carrier.call}${flightNumber}`,
      country: carrier.country,
      lat,
      lon,
      initialLat: lat,
      initialLon: lon,
      alt,
      speed,
      heading,
      categoryVal: 4,
      onGround: false
    });
  }
}

function updateSimulation() {
  if (simulatedFlights.length === 0) return;
  
  const dt = UPDATE_INTERVAL / 3600000; // 15s in Stunden
  
  simulatedFlights.forEach((flight) => {
    // Geflogene Distanz in 15 Sekunden
    const distKm = flight.speed * dt;
    const headingRad = flight.heading * Math.PI / 180;
    
    // Geografische Verschiebung berechnen
    const dLat = (distKm * Math.cos(headingRad)) / 111.0;
    const dLon = (distKm * Math.sin(headingRad)) / (111.0 * Math.cos(flight.lat * Math.PI / 180));
    
    flight.lat += dLat;
    flight.lon += dLon;
    
    const distToAirport = getDistanceKm(flight.lat, flight.lon, activeAirport.lat, activeAirport.lon);
    
    // Sinkflug bei Annäherung
    if (distToAirport < 45 && flight.alt > 1200) {
      flight.alt = Math.max(1000, flight.alt - 400);
      flight.speed = Math.max(220, flight.speed - 30);
    }
    
    // Wenn das Flugzeug den gewählten Radar-Suchbereich verlässt, setzen wir es zurück
    const maxBound = currentRange * 1.12;
    if (distToAirport > maxBound) {
      respawnSimulatedFlight(flight);
    }
  });
  
  feedSimulatedData();
}

function respawnSimulatedFlight(flight) {
  // Zurücksetzen auf Startkoordinaten, um reale Bewegungsmuster beizubehalten
  flight.lat = flight.initialLat;
  flight.lon = flight.initialLon;
  flight.speed = 350 + Math.floor(Math.random() * 450);
  flight.alt = 2500 + Math.floor(Math.random() * 6000);
}

function feedSimulatedData() {
  const states = simulatedFlights.map((f) => [
    f.icao,
    f.callsign,
    f.country,
    null,
    null,
    f.lon,
    f.lat,
    f.alt,
    f.onGround || false,
    f.speed / 3.6, // km/h zu m/s
    f.heading,
    null,
    null,
    f.alt,
    null,
    false,
    0,
    f.categoryVal
  ]);
  
  processFlightStates(states);
  updateApiIndicator('replay');
}

function getDistanceKm(lat1, lon1, lat2, lon2) {
  const R = 6371; // Erdradius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

function processFlightStates(states) {
  const activeIds = new Set();
  const now = performance.now();

  states.forEach((state) => {
    const icao = state[0].trim();
    const callsign = state[1] ? state[1].trim() : `N/A (${icao})`;
    const country = state[2] || 'Unbekannt';
    const lon = state[5];
    const lat = state[6];
    const alt = state[7] || state[13] || 3000; // fallback to 3000m
    const onGround = state[8];
    const speed = state[9] ? Math.round(state[9] * 3.6) : 0; // m/s to km/h
    const heading = state[10] || 0; // degrees
    const verticalRate = state[11] || 0; // m/s
    const categoryVal = state[17];

    if (lat === null || lon === null) return; // Ignore missing coordinates

    activeIds.add(icao);

    // Map OpenSky category to a text label and scale
    let catName = 'Passagierflugzeug';
    let catKey = 'medium';
    let modelScale = 1.0;

    switch (categoryVal) {
      case 2:
        catName = 'Leichtflugzeug';
        catKey = 'light';
        modelScale = 0.6;
        break;
      case 3:
        catName = 'Kleinflugzeug';
        catKey = 'light';
        modelScale = 0.8;
        break;
      case 4:
      case 5:
        catName = 'Mittelstreckenjet';
        catKey = 'medium';
        modelScale = 1.0;
        break;
      case 6:
        catName = 'Großraumjet / Heavy';
        catKey = 'heavy';
        modelScale = 1.35;
        break;
      case 7:
        catName = 'Militärjet';
        catKey = 'military';
        modelScale = 0.7;
        break;
      case 8:
        catName = 'Hubschrauber';
        catKey = 'light';
        modelScale = 0.5;
        break;
      default:
        // Attempt heuristics based on speed or callsign
        if (speed > 950) {
          catName = 'Militärjet';
          catKey = 'military';
          modelScale = 0.7;
        } else if (speed < 250) {
          catName = 'Leichtflugzeug';
          catKey = 'light';
          modelScale = 0.65;
        }
    }

    // Convert coordinates to 3D positions. Sit on ground (alt=0) if plane is on ground
    const actualAlt = onGround ? 0 : alt;
    const newPos = new THREE.Vector3();
    latLonToVector3(lat, lon, actualAlt, newPos);

    if (flightsData.has(icao)) {
      // UPDATE EXISTING FLIGHT
      const flight = flightsData.get(icao);
      
      // Update data details
      flight.callsign = callsign;
      flight.country = country;
      flight.altitude = alt;
      flight.speed = speed;
      flight.heading = heading;
      flight.category = catName;
      flight.verticalRate = verticalRate;
      flight.lat = lat;
      flight.lon = lon;
      
      // Update wing color if onGround state changed
      if (flight.onGround !== onGround) {
        flight.onGround = onGround;
        resetPlaneHighlight(flight.mesh);
      }
      
      // Store current pos/rotation as starting point for smooth transition (lerp)
      flight.startPosition.copy(flight.mesh.position);
      flight.startRotation = flight.mesh.rotation.y;
      
      // Target state
      flight.targetPosition.copy(newPos);
      flight.targetHeading = heading;
      
      // Reset interpolation timer
      flight.lastUpdateTime = now;
      
      // Update trail history
      updateTrailPositions(flight.trail, newPos);

      // If active focus is on this plane, update HUD details dynamically
      if (selectedFlightId === icao) {
        updateHudDetails(flight);
      }
    } else {
      // CREATE NEW FLIGHT
      const mesh = createAirplaneMesh(catKey, onGround);
      
      // Exaggerate scale slightly in visual 3D view
      const displayScale = modelScale * 0.45;
      mesh.scale.set(displayScale, displayScale, displayScale);
      
      // Position mesh initially
      mesh.position.copy(newPos);
      
      // Rotate mesh tangent to the sphere pointing in heading direction
      orientMesh(mesh, newPos, heading);

      flightsGroup.add(mesh);

      // Create trails
      const trail = createTrail(newPos);

      const flightInfo = {
        id: icao,
        callsign,
        country,
        altitude: alt,
        speed,
        heading,
        category: catName,
        mesh,
        trail,
        baseScale: displayScale,
        onGround,
        verticalRate,
        lat,
        lon,
        
        // Lerp Interpolation state
        startPosition: newPos.clone(),
        targetPosition: newPos.clone(),
        startRotation: mesh.rotation.y,
        targetHeading: heading,
        lastUpdateTime: now
      };

      // Tag the mesh with the ID for Raycaster detection
      mesh.userData = { id: icao };
      mesh.traverse(child => {
        child.userData = { id: icao };
      });

      flightsData.set(icao, flightInfo);
    }
  });

  // DELETE FLIGHTS NO LONGER DETECTED BY THE API
  for (const [id, flight] of flightsData.entries()) {
    if (!activeIds.has(id)) {
      // Remove mesh
      flightsGroup.remove(flight.mesh);
      flight.mesh.traverse((child) => {
        if (child.isMesh) {
          child.geometry.dispose();
          if (Array.isArray(child.material)) {
            child.material.forEach(m => m.dispose());
          } else {
            child.material.dispose();
          }
        }
      });
      
      // Remove trails
      scene.remove(flight.trail.line);
      flight.trail.geometry.dispose();
      flight.trail.line.material.dispose();

      flightsData.delete(id);

      // Deselect if active
      if (selectedFlightId === id) {
        deselectFlight();
      }
    }
  }

  // Update UI Stats
  statCount.textContent = flightsData.size;

  // Update FIDS board
  updateFlightBoard();
}

/**
 * Orients a mesh tangent to the Earth's surface pointing in the heading direction.
 */
function orientMesh(mesh, position, headingDegrees) {
  // 1. Point mesh upwards away from center of the earth (normal vector)
  const up = position.clone().normalize();
  
  // 2. Find a forward direction vector tangent to surface pointing North
  // Projection of global North (0, 1, 0) onto tangent plane
  const north = new THREE.Vector3(0, 1, 0);
  const forward = north.clone().projectOnPlane(up).normalize();
  
  // 3. Rotate forward vector around normal (up) by heading angle (adding 180 degrees to flip direction)
  const headingRadians = -(headingDegrees + 180) * (Math.PI / 180);
  forward.applyAxisAngle(up, headingRadians);

  // 4. Align mesh
  const matrix = new THREE.Matrix4();
  matrix.lookAt(new THREE.Vector3(), forward, up);
  mesh.quaternion.setFromRotationMatrix(matrix);
}

// --- SMOOTH POSITION INTERPOLATION (LERP) ---

function updateFlightsInterpolation() {
  const now = performance.now();
  const lerpDuration = UPDATE_INTERVAL; // Duration of API cycle

  flightsData.forEach((flight) => {
    const timeElapsed = now - flight.lastUpdateTime;
    const t = Math.min(timeElapsed / lerpDuration, 1.0); // interpolation value between 0.0 and 1.0

    // Smooth position lerp
    flight.mesh.position.lerpVectors(flight.startPosition, flight.targetPosition, t);

    // Dynamic rotation alignment
    orientMesh(flight.mesh, flight.mesh.position, THREE.MathUtils.lerp(flight.heading, flight.targetHeading, t));

    // Dynamic scale based on distance to target (zoom)
    const distanceToTarget = camera.position.distanceTo(controls.target);
    let scaleFactor = 1.0;
    if (distanceToTarget < 8.0) {
      const norm = distanceToTarget / 8.0;
      scaleFactor = Math.pow(norm, 1.0); // Linear scaling (changed from 1.8 to 1.0) so they shrink slower
    }
    // Set a higher lower bound so planes remain clearly visible at extreme close-up (changed from 0.00003 to 0.005)
    scaleFactor = Math.max(0.005, scaleFactor);
    
    const baseScale = flight.baseScale || 0.45;
    const currentScale = baseScale * scaleFactor;
    flight.mesh.scale.set(currentScale, currentScale, currentScale);

    // Update trail line first point to match current plane position in real time
    if (showTrails && flight.trail) {
      flight.trail.line.visible = showTrails && !flight.onGround; // Hide trails for ground planes
      if (flight.trail.line.visible) {
        flight.trail.positions[0] = flight.mesh.position.x;
        flight.trail.positions[1] = flight.mesh.position.y;
        flight.trail.positions[2] = flight.mesh.position.z;
        flight.trail.geometry.attributes.position.needsUpdate = true;
      }
    }

    // Camera following feature
    if (selectedFlightId === flight.id && detailsPanel.classList.contains('active')) {
      // Smoothly update camera controls target to follow plane
      controls.target.lerp(flight.mesh.position, 0.05);
    }
  });
}

// --- INTERACTIVE RAYCASTING (SELECTION) ---

const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

function onPointerDown(event) {
  // Only detect left clicks
  if (event.button !== 0) return;

  // Calculate mouse position in normalized device coordinates (-1 to +1)
  const container = document.getElementById('canvas-container');
  const rect = renderer.domElement.getBoundingClientRect();
  mouse.x = ((event.clientX - rect.left) / container.clientWidth) * 2 - 1;
  mouse.y = -((event.clientY - rect.top) / container.clientHeight) * 2 + 1;

  raycaster.setFromCamera(mouse, camera);

  // Raycast all child meshes inside flightsGroup
  const intersects = raycaster.intersectObjects(flightsGroup.children, true);

  if (intersects.length > 0) {
    // Found a plane click! Traverse up to find user data ID
    let clickedObj = intersects[0].object;
    while (clickedObj && clickedObj.parent && !clickedObj.userData.id) {
      clickedObj = clickedObj.parent;
    }
    
    if (clickedObj && clickedObj.userData.id) {
      selectFlight(clickedObj.userData.id);
    }
  }
}

function selectFlight(id) {
  controls.minDistance = 0.00005; // Set to flight focus
  const flight = flightsData.get(id);
  if (!flight) return;

  // Visual feedback: deselect old selection colors, highlight new one
  if (selectedFlightId && flightsData.has(selectedFlightId)) {
    resetPlaneHighlight(flightsData.get(selectedFlightId).mesh);
  }

  selectedFlightId = id;
  highlightPlane(flight.mesh);

  // Update details panel content & animate in
  updateHudDetails(flight);
  
  const boardPanel = document.getElementById('flight-board-panel');
  if (boardPanel) boardPanel.classList.remove('active');
  detailsPanel.classList.add('active');

  // Smooth camera zoom & center
  const targetCamPos = flight.mesh.position.clone().multiplyScalar(1.4);
  
  // Simple tweening for camera
  let steps = 0;
  const maxSteps = 30;
  function animateCameraFocus() {
    if (steps < maxSteps && selectedFlightId === id) {
      camera.position.lerp(targetCamPos, 0.08);
      controls.target.lerp(flight.mesh.position, 0.08);
      controls.update();
      steps++;
      requestAnimationFrame(animateCameraFocus);
    }
  }
  animateCameraFocus();
}

function deselectFlight() {
  if (selectedFlightId && flightsData.has(selectedFlightId)) {
    resetPlaneHighlight(flightsData.get(selectedFlightId).mesh);
  }
  selectedFlightId = null;
  detailsPanel.classList.remove('active');
  
  const boardPanel = document.getElementById('flight-board-panel');
  if (boardPanel) boardPanel.classList.add('active');
  
  // Return camera center to Munich Airport
  let steps = 0;
  function animateCameraReset() {
    if (steps < 30 && selectedFlightId === null) {
      controls.target.lerp(munichVector3, 0.08);
      controls.update();
      steps++;
      requestAnimationFrame(animateCameraReset);
    }
  }
  animateCameraReset();
}

function highlightPlane(mesh) {
  // Highlight wings and tail with glowing neon cyan color
  mesh.traverse((child) => {
    if (child.isMesh && child.name.includes('wings')) {
      child.material = new THREE.MeshStandardMaterial({
        color: 0x00ffff,
        emissive: 0x06b6d4,
        emissiveIntensity: 0.8,
        roughness: 0.2
      });
    }
  });
}

function resetPlaneHighlight(mesh) {
  // Restore normal textures/colors by re-creating it or resetting material
  if (!mesh) return;
  
  mesh.traverse((child) => {
    if (child.isMesh && child.name.includes('wings')) {
      let color = 0x0ea5e9;
      const flightId = mesh.userData.id;
      const flight = flightsData.get(flightId);
      
      if (flight) {
        if (flight.onGround) {
          color = 0xf59e0b; // Amber/Orange für Bodenmaschinen
        } else {
          const route = getFlightRoute(flight);
          if (route.isOverflight) {
            color = 0x38bdf8; // Helleres Cyan für Überflüge / En-route
          } else {
            if (mesh.scale.x > 0.5) color = 0x06b6d4; // Heavy
            else if (mesh.scale.x < 0.3) color = 0x10b981; // Light
          }
        }
      }
      
      child.material = new THREE.MeshStandardMaterial({
        color: color,
        roughness: 0.4,
        metalness: 0.4
      });
    }
  });
}

// --- USER INTERFACE UPDATES ---

function updateProgress(percent, statusText) {
  loadProgress.style.width = `${percent}%`;
  loaderStatus.textContent = statusText;
}

function updateApiIndicator(status) {
  apiStatus.className = '';
  const indicator = apiStatus.querySelector('.status-indicator') || document.createElement('span');
  indicator.className = 'status-indicator';
  apiStatus.innerHTML = '';
  apiStatus.appendChild(indicator);

  switch (status) {
    case 'loading':
      apiStatus.classList.add('text-amber');
      apiStatus.innerHTML += '<i class="fa-solid fa-spinner fa-spin"></i> Lade Daten...';
      break;
    case 'success':
      apiStatus.classList.add('text-green');
      apiStatus.innerHTML += 'Bereit (Live)';
      break;
    case 'replay':
      apiStatus.classList.add('text-cyan');
      indicator.style.backgroundColor = 'var(--color-cyan)';
      apiStatus.innerHTML += 'Bereit (ADS-B)';
      break;
    case 'error':
      apiStatus.classList.add('text-rose');
      apiStatus.innerHTML += 'Fehler / Timeout';
      break;
  }
}

/**
 * Finds the best-matching airport along a given ray direction from a coordinate.
 */
function findAirportAlongRay(fromLat, fromLon, rayAngle, excludeCode, minKm = 150, maxKm = 3500) {
  if (!allAirports || allAirports.length === 0) return null;
  let bestScore = Infinity;
  let bestAirport = null;

  for (let i = 0; i < allAirports.length; i++) {
    const a = allAirports[i];
    if (a.code === excludeCode || a.iata === excludeCode) continue;
    const d = getDistanceKm(fromLat, fromLon, a.lat, a.lon);
    if (d < minKm || d > maxKm) continue;

    const b = getBearing(fromLat, fromLon, a.lat, a.lon);
    const angleDiff = Math.abs((b - rayAngle + 180) % 360 - 180);
    if (angleDiff < 26) {
      const score = angleDiff * 12 + Math.abs(d - 900) * 0.04;
      if (score < bestScore) {
        bestScore = score;
        bestAirport = a;
      }
    }
  }

  return bestAirport;
}

function formatAirportLabel(airport, fallbackCountry, fallbackAngle) {
  if (airport) {
    const code = airport.iata || airport.code;
    const city = airport.city || airport.name.split('(')[0].trim();
    return code ? `${code} (${city})` : city;
  }
  return fallbackCountry ? `${fallbackCountry} (${getDirectionString(fallbackAngle)})` : getDirectionString(fallbackAngle);
}

function getFlightRoute(flight) {
  const currentAp = activeAirport || { code: 'EDDM', name: 'München (MUC)' };
  const currentCode = currentAp.iata || currentAp.code || 'MUC';
  const currentName = currentAp.city || currentAp.name.split('(')[0].trim() || 'München';

  if (!flight || !flight.lat || !flight.lon) {
    return {
      origin: flight && flight.country ? flight.country : 'Startflughafen',
      destination: currentCode,
      isArrival: true,
      isOverflight: false,
      flightType: 'Anflug'
    };
  }

  const distToAp = getDistanceKm(flight.lat, flight.lon, currentAp.lat, currentAp.lon);
  const bearingToAp = getBearing(flight.lat, flight.lon, currentAp.lat, currentAp.lon);
  const headingDiff = Math.abs((flight.heading - bearingToAp + 180) % 360 - 180);

  // Ein Flugzeug ist ein reiner Überflug (Transit / En-route), wenn es in Reiseflughöhe fliegt
  // ODER wenn es nicht auf den Flughafen zufliegt und nicht am Boden ist
  const isOverflight = !flight.onGround && (flight.altitude > 6200 || (distToAp > 45 && headingDiff > 50));

  if (isOverflight) {
    // Überflug: Weder Herkunft noch Ziel werden auf den aktiven Flughafen forciert!
    const originRay = (flight.heading + 180) % 360;
    const destRay = flight.heading;

    const originAp = findAirportAlongRay(flight.lat, flight.lon, originRay, currentAp.code, 150, 4000);
    const destAp = findAirportAlongRay(flight.lat, flight.lon, destRay, currentAp.code, 150, 4000);

    return {
      origin: formatAirportLabel(originAp, flight.country, originRay),
      destination: formatAirportLabel(destAp, null, destRay),
      isArrival: false,
      isOverflight: true,
      flightType: 'Überflug'
    };
  }

  // Lokaler Flugbezug (Anflug oder Abflug)
  const isArrival = (headingDiff < 75) || flight.onGround;
  const rayAngle = isArrival ? (flight.heading + 180) % 360 : flight.heading;
  const remoteAp = findAirportAlongRay(flight.lat, flight.lon, rayAngle, currentAp.code, 150, 3500);
  const remoteLabel = formatAirportLabel(remoteAp, flight.country, rayAngle);

  return {
    origin: isArrival ? remoteLabel : `${currentCode} (${currentName})`,
    destination: isArrival ? `${currentCode} (${currentName})` : remoteLabel,
    isArrival,
    isOverflight: false,
    flightType: isArrival ? 'Anflug' : 'Abflug'
  };
}

function updateHudDetails(flight) {
  document.getElementById('detail-callsign').textContent = flight.callsign;
  document.getElementById('detail-operator').textContent = getOperatorByCallsign(flight.callsign);
  
  // Cleanly resolved route & flight category
  const route = getFlightRoute(flight);
  const startSpan = document.getElementById('detail-route-start');
  const endSpan = document.getElementById('detail-route-end');
  if (startSpan) startSpan.textContent = route.origin;
  if (endSpan) endSpan.textContent = route.destination;

  // Category badge
  const categoryEl = document.getElementById('detail-category');
  if (categoryEl) {
    if (route.isOverflight) {
      categoryEl.textContent = `Überflug (Transit) • ${flight.category}`;
      categoryEl.style.borderColor = 'rgba(6, 182, 212, 0.6)';
    } else {
      categoryEl.textContent = flight.category;
      categoryEl.style.borderColor = 'rgba(6, 182, 212, 0.3)';
    }
  }

  // Registration country & vertical rate
  const countryEl = document.getElementById('detail-country');
  if (countryEl) countryEl.textContent = flight.country || "Unbekannt";
  
  const vrateEl = document.getElementById('detail-vrate');
  if (vrateEl) {
    const vr = flight.verticalRate !== undefined && flight.verticalRate !== null ? Number(flight.verticalRate).toFixed(1) : 0;
    const sign = vr > 0 ? '+' : '';
    vrateEl.textContent = `${sign}${vr} m/s`;
  }

  document.getElementById('detail-altitude').textContent = `${flight.altitude.toLocaleString()} m`;
  document.getElementById('detail-speed').textContent = `${flight.speed} km/h`;
  document.getElementById('detail-heading').textContent = `${flight.heading}° (${getDirectionString(flight.heading)})`;
  document.getElementById('detail-icao').textContent = flight.id.toUpperCase();
}

function getOperatorByCallsign(callsign) {
  if (!callsign) return 'Privatflug / Allgemeine Luftfahrt';
  const clean = callsign.trim().toUpperCase();
  const code = clean.substring(0, 3);
  const airlines = {
    'DLH': 'Deutsche Lufthansa',
    'DLX': 'Lufthansa CityLine',
    'EWG': 'Eurowings',
    'GWI': 'Germanwings',
    'EJU': 'EasyJet Europe',
    'EZY': 'EasyJet UK',
    'EZS': 'EasyJet Switzerland',
    'RYR': 'Ryanair',
    'RYS': 'Ryanair Sun / Buzz',
    'BER': 'Air Berlin',
    'AEE': 'Aegean Airlines',
    'AFR': 'Air France',
    'BAW': 'British Airways',
    'KLM': 'KLM Royal Dutch Airlines',
    'KLC': 'KLM Cityhopper',
    'SWR': 'Swiss International Air Lines',
    'AUA': 'Austrian Airlines',
    'UAE': 'Emirates',
    'QTR': 'Qatar Airways',
    'ETD': 'Etihad Airways',
    'THY': 'Turkish Airlines',
    'SAS': 'Scandinavian Airlines',
    'TAP': 'TAP Air Portugal',
    'IBE': 'Iberia',
    'IBS': 'Iberia Express',
    'LZB': 'Bulgaria Air',
    'CSA': 'Czech Airlines',
    'LOT': 'LOT Polish Airlines',
    'WZZ': 'Wizz Air',
    'WUK': 'Wizz Air UK',
    'VLG': 'Vueling Airlines',
    'TVF': 'Transavia France',
    'TRA': 'Transavia',
    'AAL': 'American Airlines',
    'DAL': 'Delta Air Lines',
    'UAL': 'United Airlines',
    'SWA': 'Southwest Airlines',
    'ASA': 'Alaska Airlines',
    'ACA': 'Air Canada',
    'ANA': 'All Nippon Airways',
    'JAL': 'Japan Airlines',
    'SIA': 'Singapore Airlines',
    'QFA': 'Qantas',
    'VOZ': 'Virgin Australia',
    'VIR': 'Virgin Atlantic',
    'FIN': 'Finnair',
    'TOM': 'TUI Airways',
    'TUI': 'TUIfly',
    'EXS': 'Jet2.com',
    'IGO': 'IndiGo',
    'AIC': 'Air India',
    'CES': 'China Eastern Airlines',
    'CCA': 'Air China',
    'CSN': 'China Southern Airlines',
    'CPA': 'Cathay Pacific'
  };
  return airlines[code] || (clean.length >= 3 ? `Fluggesellschaft (${code})` : 'Privatflug');
}

function getDirectionString(heading) {
  if (heading >= 337.5 || heading < 22.5) return 'Nord';
  if (heading >= 22.5 && heading < 67.5) return 'Nord-Ost';
  if (heading >= 67.5 && heading < 112.5) return 'Ost';
  if (heading >= 112.5 && heading < 157.5) return 'Süd-Ost';
  if (heading >= 157.5 && heading < 202.5) return 'Süd';
  if (heading >= 202.5 && heading < 247.5) return 'Süd-West';
  if (heading >= 247.5 && heading < 292.5) return 'West';
  return 'Nord-West';
}

// --- DEPARTURES & ARRIVALS FLIGHT BOARD (FIDS) ---

// Calculates the initial bearing from point 1 to point 2 on a sphere
function getBearing(lat1, lon1, lat2, lon2) {
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const lat1Rad = lat1 * Math.PI / 180;
  const lat2Rad = lat2 * Math.PI / 180;
  const y = Math.sin(dLon) * Math.cos(lat2Rad);
  const x = Math.cos(lat1Rad) * Math.sin(lat2Rad) - Math.sin(lat1Rad) * Math.cos(lat2Rad) * Math.cos(dLon);
  const brng = Math.atan2(y, x) * 180 / Math.PI;
  return (brng + 360) % 360;
}

// Generates realistic scheduled flights for the airport board (+/- 1 hour)
function getProceduralFlightsForBoard(airport, type, countNeeded) {
  const list = [];
  const destinations = [
    { code: "EDDF", name: "Frankfurt (FRA)" },
    { code: "EGLL", name: "London (LHR)" },
    { code: "LFPG", name: "Paris (CDG)" },
    { code: "EHAM", name: "Amsterdam (AMS)" },
    { code: "KJFK", name: "New York (JFK)" },
    { code: "OMDB", name: "Dubai (DXB)" },
    { code: "WSSS", name: "Singapur (SIN)" },
    { code: "RJTT", name: "Tokio (HND)" },
    { code: "YSSY", name: "Sydney (SYD)" },
    { code: "EDDM", name: "München (MUC)" }
  ];
  
  const carriers = [
    { call: 'DLH', name: 'Lufthansa' },
    { call: 'BAW', name: 'British Airways' },
    { call: 'AFR', name: 'Air France' },
    { call: 'KLM', name: 'KLM' },
    { call: 'AAL', name: 'American Airlines' },
    { call: 'UAE', name: 'Emirates' },
    { call: 'SIA', name: 'Singapore Airlines' },
    { call: 'ANA', name: 'All Nippon Airways' },
    { call: 'QFA', name: 'Qantas' }
  ];

  const currentHour = new Date().getHours();
  const airportSeed = airport.code || "EDDM";
  
  for (let i = 0; i < countNeeded; i++) {
    // Semi-stable seed based on active airport and current hour
    const seed = (airportSeed.charCodeAt(0) + airportSeed.charCodeAt(1) + currentHour + i * 17) % 100;
    
    const carrier = carriers[seed % carriers.length];
    let dest = destinations[(seed + 3) % destinations.length];
    if (dest.code === airport.code) {
      dest = destinations[(seed + 4) % destinations.length];
    }
    
    const flightNum = (seed * 13 + 100) % 9000;
    const callsign = `${carrier.call}${flightNum}`;
    
    // Distribute times across +/- 1 hour
    const minutes = (seed * 7) % 60;
    let hour = currentHour;
    if (seed % 3 === 0) hour = (currentHour - 1 + 24) % 24;
    else if (seed % 3 === 1) hour = (currentHour + 1) % 24;
    
    const timeStr = `${String(hour).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
    
    list.push({
      time: timeStr,
      callsign: callsign,
      airline: carrier.name,
      airportInfo: dest.name,
      status: type === 'arrival' ? 'Pünktlich' : 'Scheduled',
      isLive: false,
      id: null
    });
  }
  
  list.sort((a, b) => a.time.localeCompare(b.time));
  return list;
}

// Updates the HTML flight board combining live and scheduled flights
function updateFlightBoard() {
  const arrivalsList = document.getElementById('arrivals-list');
  const departuresList = document.getElementById('departures-list');
  if (!arrivalsList || !departuresList) return;

  const liveArrivals = [];
  const liveDepartures = [];

  // 1. Process and classify all active live flights
  flightsData.forEach((flight) => {
    if (!flight.lat || !flight.lon) return;

    const dist = getDistanceKm(flight.lat, flight.lon, activeAirport.lat, activeAirport.lon);
    
    // Only classify flights within 150km of the active airport
    if (dist < 150) {
      const bearing = getBearing(flight.lat, flight.lon, activeAirport.lat, activeAirport.lon);
      const headingDiff = Math.abs((flight.heading - bearing + 180) % 360 - 180);
      
      const isArrival = (headingDiff < 90) || flight.onGround;
      
      const minutesOffset = Math.round(dist / (flight.speed || 400) * 60);
      const currentTime = new Date();
      let flightTime = new Date(currentTime.getTime());
      
      if (isArrival) {
        flightTime.setMinutes(currentTime.getMinutes() + minutesOffset);
      } else {
        flightTime.setMinutes(currentTime.getMinutes() - minutesOffset);
      }
      
      const timeStr = `${String(flightTime.getHours()).padStart(2, '0')}:${String(flightTime.getMinutes()).padStart(2, '0')}`;
      let statusStr = "Im Anflug";
      
      if (flight.onGround) {
        statusStr = isArrival ? "Gelandet" : "Startbereit";
      } else if (!isArrival) {
        statusStr = "Steigflug";
      }

      const route = getFlightRoute(flight);
      const flightItem = {
        time: timeStr,
        callsign: flight.callsign,
        airline: getOperatorByCallsign(flight.callsign),
        airportInfo: isArrival ? route.origin : route.destination,
        status: statusStr,
        isLive: true,
        id: flight.id,
        onGround: flight.onGround,
        dist: dist
      };

      if (isArrival) {
        liveArrivals.push(flightItem);
      } else {
        liveDepartures.push(flightItem);
      }
    }
  });

  // Sort live lists: arrivals closest first, departures closest (just took off) first
  liveArrivals.sort((a, b) => a.dist - b.dist);
  liveDepartures.sort((a, b) => a.dist - b.dist);

  // 2. Generate scheduled flights to fill the board up to 8 items
  const scheduledArrivalsCount = Math.max(0, 8 - liveArrivals.length);
  const scheduledDeparturesCount = Math.max(0, 8 - liveDepartures.length);

  const schedArrivals = getProceduralFlightsForBoard(activeAirport, 'arrival', scheduledArrivalsCount);
  const schedDepartures = getProceduralFlightsForBoard(activeAirport, 'departure', scheduledDeparturesCount);

  // Combine lists
  const finalArrivals = [...liveArrivals, ...schedArrivals].slice(0, 8);
  const finalDepartures = [...liveDepartures, ...schedDepartures].slice(0, 8);

  // Render Arrivals
  arrivalsList.innerHTML = '';
  finalArrivals.forEach(f => {
    const row = document.createElement('div');
    row.className = `board-row ${f.isLive ? 'live' : 'scheduled'}`;
    if (f.isLive) {
      row.addEventListener('click', () => selectFlight(f.id));
    }
    
    let badgeClass = f.onGround ? 'onground' : 'live';
    if (!f.isLive) badgeClass = 'scheduled';
    
    row.innerHTML = `
      <span class="col-time">${f.time}</span>
      <span class="col-flight">${f.callsign}</span>
      <span class="col-origin">${f.airportInfo}</span>
      <span><span class="status-badge ${badgeClass}">${f.status}</span></span>
    `;
    arrivalsList.appendChild(row);
  });

  // Render Departures
  departuresList.innerHTML = '';
  finalDepartures.forEach(f => {
    const row = document.createElement('div');
    row.className = `board-row ${f.isLive ? 'live' : 'scheduled'}`;
    if (f.isLive) {
      row.addEventListener('click', () => selectFlight(f.id));
    }
    
    let badgeClass = f.onGround ? 'onground' : 'live';
    if (!f.isLive) badgeClass = 'scheduled';

    row.innerHTML = `
      <span class="col-time">${f.time}</span>
      <span class="col-flight">${f.callsign}</span>
      <span class="col-dest">${f.airportInfo}</span>
      <span><span class="status-badge ${badgeClass}">${f.status}</span></span>
    `;
    departuresList.appendChild(row);
  });
}

// --- EVENT LISTENERS & UI CONTROLS ---

function setupEventListeners() {
  // Close details panel button
  document.getElementById('btn-close-details').addEventListener('click', deselectFlight);

  // Tab handling for flight board
  const btnTabArrivals = document.getElementById('btn-tab-arrivals');
  const btnTabDepartures = document.getElementById('btn-tab-departures');
  const boardArrivals = document.getElementById('board-arrivals');
  const boardDepartures = document.getElementById('board-departures');

  if (btnTabArrivals && btnTabDepartures && boardArrivals && boardDepartures) {
    btnTabArrivals.addEventListener('click', () => {
      btnTabArrivals.classList.add('active');
      btnTabDepartures.classList.remove('active');
      boardArrivals.classList.add('active');
      boardDepartures.classList.remove('active');
    });

    btnTabDepartures.addEventListener('click', () => {
      btnTabDepartures.classList.add('active');
      btnTabArrivals.classList.remove('active');
      boardDepartures.classList.add('active');
      boardArrivals.classList.remove('active');
    });
  }

  // Range Slider change
  const rangeSlider = document.getElementById('range-slider');
  const rangeValue = document.getElementById('range-value');
  rangeSlider.addEventListener('input', (e) => {
    currentRange = parseInt(e.target.value);
    rangeValue.textContent = `${currentRange} km`;
    rebuildRadarGroup(currentRange);
  });
  
  // Range Slider finished sliding - immediately trigger new API fetch with new range
  rangeSlider.addEventListener('change', () => {
    clearInterval(apiTimer);
    rebuildRadarGroup(currentRange);
    if (isSimulatedMode) {
      isSimulatedMode = false;
      startSimulation();
    } else {
      fetchLiveFlights();
    }
    apiTimer = setInterval(fetchLiveFlights, UPDATE_INTERVAL);
  });

  // Toggle Clouds Layer
  document.getElementById('toggle-clouds').addEventListener('change', (e) => {
    showClouds = e.target.checked;
    if (cloudsMesh) cloudsMesh.visible = showClouds;
  });

  // Toggle Flight Trails
  document.getElementById('toggle-trails').addEventListener('change', (e) => {
    showTrails = e.target.checked;
    flightsData.forEach((flight) => {
      if (flight.trail) flight.trail.line.visible = showTrails;
    });
  });

  // Toggle Auto-Rotation
  document.getElementById('toggle-rotation').addEventListener('change', (e) => {
    autoRotate = e.target.checked;
  });

  // Airport Selector Input Autocomplete Listener
  const airportInput = document.getElementById('airport-selector');
  if (airportInput) {
    airportInput.addEventListener('input', (e) => {
      const val = e.target.value;
      const ap = allAirports.find(a => a.name === val);
      if (ap) {
        changeActiveAirport(ap);
      }
    });
  }

  // Focus Airport Button click
  document.getElementById('btn-focus-airport').addEventListener('click', () => {
    controls.minDistance = 0.00005;
    if (airportInput) {
      const val = airportInput.value;
      const ap = findAirportBySearch(val);
      if (ap) {
        airportInput.value = ap.name;
        changeActiveAirport(ap);
      } else {
        deselectFlight();
        let steps = 0;
        const targetCamPos = munichVector3.clone().multiplyScalar(1.5);
        function zoomToCurrent() {
          if (steps < 30) {
            camera.position.lerp(targetCamPos, 0.1);
            controls.target.lerp(munichVector3, 0.1);
            controls.update();
            steps++;
            requestAnimationFrame(zoomToCurrent);
          }
        }
        zoomToCurrent();
      }
    }
  });

  // Reset Globus button
  document.getElementById('btn-reset-earth').addEventListener('click', () => {
    controls.minDistance = 5.05;
    deselectFlight();
    let steps = 0;
    const defaultCamPos = new THREE.Vector3(0, 0, 13);
    const center = new THREE.Vector3(0, 0, 0);
    function zoomToEarth() {
      if (steps < 30) {
        camera.position.lerp(defaultCamPos, 0.1);
        controls.target.lerp(center, 0.1);
        controls.update();
        steps++;
        requestAnimationFrame(zoomToEarth);
      }
    }
    zoomToEarth();
  });

  // Track Flight details focus button
  document.getElementById('btn-track-flight').addEventListener('click', () => {
    controls.minDistance = 0.00005;
    if (selectedFlightId && flightsData.has(selectedFlightId)) {
      const flight = flightsData.get(selectedFlightId);
      const targetCamPos = flight.mesh.position.clone().multiplyScalar(1.25);
      
      let steps = 0;
      function zoomClose() {
        if (steps < 35 && selectedFlightId === flight.id) {
          camera.position.lerp(targetCamPos, 0.1);
          controls.target.lerp(flight.mesh.position, 0.1);
          controls.update();
          steps++;
          requestAnimationFrame(zoomClose);
        }
      }
      zoomClose();
    }
  });

  // Window Resize
  window.addEventListener('resize', onWindowResize);

  // Click handler on WebGL Renderer for selecting flights
  renderer.domElement.addEventListener('pointerdown', onPointerDown);

  // Close API Error Toast event listener
  const closeToastBtn = document.getElementById('btn-close-toast');
  if (closeToastBtn) {
    closeToastBtn.addEventListener('click', () => {
      document.getElementById('api-error-toast').classList.remove('active');
    });
  }

  // Legal Modal (Impressum & Datenquellen) open/close listeners
  const legalModal = document.getElementById('legal-modal');
  const openLegalBtn = document.getElementById('btn-open-legal');
  const closeLegalBtn = document.getElementById('btn-close-legal');

  if (openLegalBtn && legalModal) {
    openLegalBtn.addEventListener('click', () => {
      legalModal.style.display = 'flex';
    });
  }

  if (closeLegalBtn && legalModal) {
    closeLegalBtn.addEventListener('click', () => {
      legalModal.style.display = 'none';
    });
  }

  if (legalModal) {
    legalModal.addEventListener('click', (e) => {
      if (e.target === legalModal) {
        legalModal.style.display = 'none';
      }
    });
  }
}

// --- AIRPORT SWITCHING HELPER FUNCTIONS ---

function findAirportBySearch(searchString) {
  if (!searchString) return null;
  const search = searchString.trim().toLowerCase();
  
  // 1. Genaue Übereinstimmung Name
  let match = allAirports.find(ap => ap.name.toLowerCase() === search);
  if (match) return match;
  
  // 2. IATA Code Übereinstimmung
  match = allAirports.find(ap => ap.iata.toLowerCase() === search);
  if (match) return match;
  
  // 3. ICAO Code Übereinstimmung
  match = allAirports.find(ap => ap.code.toLowerCase() === search);
  if (match) return match;
  
  // 4. Teilweise Übereinstimmung Stadt/Name
  match = allAirports.find(ap => ap.name.toLowerCase().includes(search) || (ap.city && ap.city.toLowerCase().includes(search)));
  if (match) return match;
  
  return null;
}

function changeActiveAirport(ap) {
  controls.minDistance = 0.00005; // Set to airport focus
  activeAirport = ap;
  console.log(`Fokussiere auf Flughafen: ${ap.name} (${ap.lat.toFixed(4)}, ${ap.lon.toFixed(4)})`);
  
  // 1. UI-Texte aktualisieren
  const regionStat = document.getElementById('stat-region');
  if (regionStat) regionStat.textContent = ap.name;

  // 2. 3D-Position neu berechnen
  latLonToVector3(ap.lat, ap.lon, 0, munichVector3);

  // 3. Radar-Gruppe verschieben und ausrichten
  if (radarGroup) {
    radarGroup.position.copy(munichVector3);
    const upVector = munichVector3.clone().normalize();
    radarGroup.lookAt(munichVector3.clone().add(upVector));
  }

  // 4. Satellitenkarten für neuen Flughafen aktualisieren (3 Zoomstufen)
  // Reset texture loading states and dispose existing textures
  Object.keys(loadedTextures).forEach(key => {
    if (loadedTextures[key]) {
      loadedTextures[key].dispose();
      loadedTextures[key] = null;
    }
    loadingStates[key] = false;
  });

  if (detailMapOverlayLow && detailMapOverlayMedium && detailMapOverlayHigh) {
    // Low LOD
    detailMapOverlayLow.geometry.dispose();
    detailMapOverlayLow.geometry = new THREE.CircleGeometry(getLODRadius(ap.lat, 11, 460), 64);
    if (detailMapOverlayLow.material.map) detailMapOverlayLow.material.map = null;
    detailMapOverlayLow.material.opacity = 0.0;
    detailMapOverlayLow.material.needsUpdate = true;
    detailMapOverlayLow.position.copy(munichVector3).multiplyScalar(1.0001);
    orientOverlayMesh(detailMapOverlayLow, munichVector3);
    detailMapOverlayLow.scale.set(1, 1, 1);

    // Medium LOD
    detailMapOverlayMedium.geometry.dispose();
    detailMapOverlayMedium.geometry = new THREE.CircleGeometry(getLODRadius(ap.lat, 13, 460), 64);
    if (detailMapOverlayMedium.material.map) detailMapOverlayMedium.material.map = null;
    detailMapOverlayMedium.material.opacity = 0.0;
    detailMapOverlayMedium.material.needsUpdate = true;
    detailMapOverlayMedium.position.copy(munichVector3).multiplyScalar(1.0002);
    orientOverlayMesh(detailMapOverlayMedium, munichVector3);
    detailMapOverlayMedium.scale.set(1, 1, 1);

    // High LOD
    detailMapOverlayHigh.geometry.dispose();
    detailMapOverlayHigh.geometry = new THREE.CircleGeometry(getLODRadius(ap.lat, 16, 460), 64);
    if (detailMapOverlayHigh.material.map) detailMapOverlayHigh.material.map = null;
    detailMapOverlayHigh.material.opacity = 0.0;
    detailMapOverlayHigh.material.needsUpdate = true;
    detailMapOverlayHigh.position.copy(munichVector3).multiplyScalar(1.0003);
    orientOverlayMesh(detailMapOverlayHigh, munichVector3);
    detailMapOverlayHigh.scale.set(1, 1, 1);
  }

  // 5. Alte Flüge entfernen
  flightsData.forEach((flight) => {
    flightsGroup.remove(flight.mesh);
    scene.remove(flight.trail.line);
    flight.trail.geometry.dispose();
    flight.trail.line.material.dispose();
  });
  flightsData.clear();
  if (selectedFlightId) {
    deselectFlight();
  }
  updateFlightBoard(); // Clear and update board for the new airport

  // 6. Kamera sanft ausrichten
  deselectFlight();
  let steps = 0;
  const targetCamPos = munichVector3.clone().multiplyScalar(1.5);
  function zoomToNewAirport() {
    if (steps < 30) {
      camera.position.lerp(targetCamPos, 0.1);
      controls.target.lerp(munichVector3, 0.1);
      controls.update();
      steps++;
      requestAnimationFrame(zoomToNewAirport);
    }
  }
  zoomToNewAirport();

  // 7. API-Abfrage / Simulationskreis neu starten
  clearInterval(apiTimer);
  if (isSimulatedMode) {
    // Falls wir in der Simulation sind, löschen und neu initialisieren um neuen Standort
    isSimulatedMode = false;
    startSimulation();
  } else {
    fetchLiveFlights();
  }
  apiTimer = setInterval(fetchLiveFlights, UPDATE_INTERVAL);
}

function onWindowResize() {
  const container = document.getElementById('canvas-container');
  camera.aspect = container.clientWidth / container.clientHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(container.clientWidth, container.clientHeight);
}

// --- RENDER LOOP ---

function animate() {
  requestAnimationFrame(animate);

  // 1. Clouds keep moving slowly
  if (cloudsMesh && showClouds) {
    cloudsMesh.rotation.y += 0.00015;
  }

  // Faded die Wolken dynamisch aus, wenn die Kamera nah an die Oberfläche zoomt
  if (cloudsMesh && cloudsMesh.material) {
    const dist = camera.position.length();
    // Erd-Radius ist 5.0. Wir blenden zwischen Abstand 8.5 (voll sichtbar) und 5.6 (vollständig transparent) aus.
    const minFade = 5.6;
    const maxFade = 8.5;
    const opacity = THREE.MathUtils.clamp((dist - minFade) / (maxFade - minFade), 0.0, 1.0);
    cloudsMesh.material.opacity = opacity;
    
    // Optimierung: Unsichtbar schalten, falls Deckkraft nahe 0, um GPU-Draw-Calls zu sparen
    cloudsMesh.visible = showClouds && (opacity > 0.01);
  }

  // Blende die 3 LOD detailMapOverlays (Satellitenbilder) basierend auf der Target-Distanz fließend ein/aus
  const distanceToTarget = camera.position.distanceTo(controls.target);

  // 1. Low LOD (Zoom 11)
  if (detailMapOverlayLow && detailMapOverlayLow.material) {
    if (distanceToTarget <= 5.0 && !loadedTextures.low && !loadingStates.low) {
      loadingStates.low = true;
      console.log(`Lade Low LOD Satelliten-Kachel (Zoom 11) für ${activeAirport.name}...`);
      loadMergedSatelliteTexture(activeAirport.lat, activeAirport.lon, 11).then(texture => {
        loadedTextures.low = texture;
        detailMapOverlayLow.material.map = texture;
        detailMapOverlayLow.material.needsUpdate = true;
        loadingStates.low = false;
      }).catch(err => {
        console.error("Fehler beim Laden von Low LOD:", err);
        loadingStates.low = false;
      });
    }
    const opacity = THREE.MathUtils.clamp((5.0 - distanceToTarget) / (5.0 - 2.5), 0.0, 0.85);
    detailMapOverlayLow.material.opacity = opacity;
    detailMapOverlayLow.visible = opacity > 0.01 && loadedTextures.low !== null;
  }

  // 2. Medium LOD (Zoom 13)
  if (detailMapOverlayMedium && detailMapOverlayMedium.material) {
    if (distanceToTarget <= 2.0 && !loadedTextures.medium && !loadingStates.medium) {
      loadingStates.medium = true;
      console.log(`Lade Medium LOD Satelliten-Kachel (Zoom 13) für ${activeAirport.name}...`);
      loadMergedSatelliteTexture(activeAirport.lat, activeAirport.lon, 13).then(texture => {
        loadedTextures.medium = texture;
        detailMapOverlayMedium.material.map = texture;
        detailMapOverlayMedium.material.needsUpdate = true;
        loadingStates.medium = false;
      }).catch(err => {
        console.error("Fehler beim Laden von Medium LOD:", err);
        loadingStates.medium = false;
      });
    }
    const opacity = THREE.MathUtils.clamp((2.0 - distanceToTarget) / (2.0 - 0.8), 0.0, 0.9);
    detailMapOverlayMedium.material.opacity = opacity;
    detailMapOverlayMedium.visible = opacity > 0.01 && loadedTextures.medium !== null;
  }

  // 3. High LOD (Zoom 16)
  if (detailMapOverlayHigh && detailMapOverlayHigh.material) {
    if (distanceToTarget <= 0.6 && !loadedTextures.high && !loadingStates.high) {
      loadingStates.high = true;
      console.log(`Lade High LOD Satelliten-Kachel (Zoom 16) für ${activeAirport.name}...`);
      loadMergedSatelliteTexture(activeAirport.lat, activeAirport.lon, 16).then(texture => {
        loadedTextures.high = texture;
        detailMapOverlayHigh.material.map = texture;
        detailMapOverlayHigh.material.needsUpdate = true;
        loadingStates.high = false;
      }).catch(err => {
        console.error("Fehler beim Laden von High LOD:", err);
        loadingStates.high = false;
      });
    }
    const opacity = THREE.MathUtils.clamp((0.6 - distanceToTarget) / (0.6 - 0.15), 0.0, 1.0);
    detailMapOverlayHigh.material.opacity = opacity;
    detailMapOverlayHigh.visible = opacity > 0.01 && loadedTextures.high !== null;
  }

  // 5. Rotate radar sweep
  if (radarGroup && radarGroup.userData && radarGroup.userData.sweep) {
    radarGroup.userData.sweep.rotation.z += 0.015;
  }

  // 2. Smoothly move airplanes
  updateFlightsInterpolation();

  // 3. Update Camera controls
  controls.update();

  // 4. Render
  renderer.render(scene, camera);
}

// Start application immediately since type="module" is already deferred
init();
