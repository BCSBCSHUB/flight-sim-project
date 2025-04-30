import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import GUI from 'lil-gui';

const clock = new THREE.Clock();

// --- Variables ---
let aircraftModel;
let actualModelMeshGroup; // The actual mesh group from the GLTF
let playerVelocity = new THREE.Vector3();
let playerAngularVelocity = new THREE.Vector3();
const INITIAL_AIRCRAFT_POS = new THREE.Vector3(); // To store the starting position
const INITIAL_AIRCRAFT_QUAT = new THREE.Quaternion(); // To store starting rotation
let isCrashing = false; // Flag to manage crash state
let crashResetTimeout = null; // Timeout ID for delayed reset

// --- Trail Variables ---
let leftWingTrail, rightWingTrail; // THREE.Points objects
let leftWingTip, rightWingTip;     // THREE.Object3D helpers
let particleTexture = null;        // Loaded from 'assets/particle.png'
const MAX_TRAIL_PARTICLES = 500;
let currentTrailIndex = { left: 0, right: 0 };
const OFF_SCREEN_POS = new THREE.Vector3(1e10, 1e10, 1e10);
let trailEmitLogTimer = 0;
const TRAIL_EMIT_LOG_INTERVAL = 1.0;

// --- Volcano Smoke Variables ---
let volcanoSmokeSystem; // THREE.Points object
const MAX_SMOKE_PARTICLES = 2000;
let currentSmokeIndex = 0;
const smokeParticlePosition = new THREE.Vector3();
const smokeParticleVelocity = new THREE.Vector3();

// --- Engine Burn Variables ---
let engineBurnSystem;             // Single THREE.Points object for both engines
let engineNozzleLeft, engineNozzleRight; // TWO THREE.Object3D helpers for emission points
const MAX_ENGINE_PARTICLES = 400;
let currentEngineIndex = 0;
const engineParticleVelocity = new THREE.Vector3();

// --- Crash Explosion Variables ---
let crashExplosionSystem;
const MAX_EXPLOSION_PARTICLES = 2500; // *** INCREASED MAX to accommodate more particles ***
let currentExplosionIndex = 0;
const explosionParticleVelocity = new THREE.Vector3();

// --- Scene Objects ---
const VOLCANO_PEAK_POS = new THREE.Vector3(0, 0, 0); // Set during terrain gen
const VOLCANO_CRATER_CENTER_Y = new THREE.Vector3(); // Set during lava gen
let volcanoLight;
let lavaPoolMesh;
let sunMesh; // Mesh for the visual sun

// --- Scenery Variables ---
let terrainMesh;
const TERRAIN_SIZE = 2500;
const TERRAIN_SEGMENTS = 100;
const TERRAIN_NOISE_SCALE = 0.008;
const TERRAIN_NOISE_HEIGHT = 60;
const VOLCANO_RADIUS = 600;
const VOLCANO_HEIGHT = 450;
const VOLCANO_SLOPE_FACTOR = 1.8;
const CRATER_RADIUS = 250;
const CRATER_DEPTH = 80;
const CRATER_RIM_WIDTH_FACTOR = 0.2;
const LAVA_POOL_Y_OFFSET = 0.5;
const WATER_LEVEL = 5.0;
const TREE_COUNT = 4000;
const AIRCRAFT_GROUND_BUFFER = 1.5;
const WORLD_BOUNDARY = TERRAIN_SIZE / 2 * 0.95; // Boundary slightly inside terrain edge
const CRASH_VELOCITY_THRESHOLD = -15.0; // Min downward velocity (Y) to trigger crash reset
const CRASH_RESET_DELAY = 500; // Delay in milliseconds before resetting after crash

// --- Control Parameters ---
// *** Using values from user's last provided screenshot as defaults ***
const controlParams = {
    // Flight
    thrustAcceleration: 50.0, afterburnerMultiplier: 2.5, maxSpeed: 80.0,
    linearDragFactor: 0.5, brakeForce: 60.0, minSpeed: 0.5,
    pitchRate: Math.PI * 0.9, rollRate: Math.PI * 1.2, yawRate: Math.PI * 0.6,
    angularAdjustFactor: 6.0, angularDamping: 0.94, cameraSmoothness: 0.12,
    // Trails
    trailEmissionRate: 225, trailParticleLifetime: 1.5, trailSize: 45.6,
    trailOpacity: 0.1, trailColor: 0xffffff, trailTriggerSpeed: 118, trailTriggerAngularVel: 1.0,
    // Volcano Smoke
    smokeEmissionRate: 240, smokeLifetime: 15.0, smokeBaseVelocityY: 44.0,
    smokeVelocitySpread: 35.0, smokeTurbulence: 0.25, smokeColor: 0x710e0e,
    smokeSize: 65.0, smokeOpacity: 0.7, smokeEmissionRadius: 195.0,
    // Engine Burn
    engineEmissionRate: 1500, engineLifetime: 0.17, engineBaseVelocity: -32.0,
    engineVelocitySpread: 7.5, engineColor: 0xffcc33, engineSize: 18.5, engineOpacity: 0.6,
    // World Boundary / Fog
    edgeFogStartDistance: WORLD_BOUNDARY * 0.8, edgeFogFullDistance: WORLD_BOUNDARY,
    baseFogNear: 500, baseFogFar: 3500, edgeFogNearFactor: 0.2, edgeFogFarFactor: 0.5,
    // Crash Explosion
    explosionParticleCount: 2400, // *** INCREASED default particle count ***
    explosionLifetime: 0.8,      // How long explosion lasts (seconds)
    explosionBaseVelocity: 80.0, // How fast particles fly outwards
    explosionVelocitySpread: 40.0,
    explosionColor: 0xff8800,    // Orange/Yellow
    explosionSize: 45.0,         // *** INCREASED default size ***
    explosionOpacity: 1.0,
};

// --- Helper Vectors ---
const forwardDirection = new THREE.Vector3();
const accelerationVector = new THREE.Vector3();
const brakingVector = new THREE.Vector3();
const rotationQuaternion = new THREE.Quaternion();
const wingTipWorldPosition = new THREE.Vector3();
const tempVector3 = new THREE.Vector3();

// --- GUI Setup ---
// NOTE: The spacebar key is NOT bound to toggle the GUI in this script.
// If space toggles your GUI, check your HTML file or other scripts for custom listeners.
// The default lil-gui toggle key is usually 'H'.
try {
    const gui = new GUI();
    gui.title("Flight Control Tuning (Physics)");
    const flightFolder = gui.addFolder('Speed & Forces'); flightFolder.add(controlParams, 'thrustAcceleration', 10.0, 150.0); flightFolder.add(controlParams, 'afterburnerMultiplier', 1.1, 5.0, 0.1); flightFolder.add(controlParams, 'maxSpeed', 10.0, 200.0); flightFolder.add(controlParams, 'linearDragFactor', 0.0, 2.0, 0.01); flightFolder.add(controlParams, 'brakeForce', 10.0, 150.0); flightFolder.add(controlParams, 'minSpeed', 0, 5.0, 0.1); flightFolder.close();
    const ratesFolder = gui.addFolder('Target Rotation Rates (rad/s)'); ratesFolder.add(controlParams, 'pitchRate', 0.5, Math.PI * 2.0, 0.1); ratesFolder.add(controlParams, 'rollRate', 0.5, Math.PI * 2.5, 0.1); ratesFolder.add(controlParams, 'yawRate', 0.5, Math.PI * 2.0, 0.1); ratesFolder.close();
    const physicsFolder = gui.addFolder('Physics Tuning'); physicsFolder.add(controlParams, 'angularAdjustFactor', 1.0, 15.0, 0.1); physicsFolder.add(controlParams, 'angularDamping', 0.85, 0.999, 0.001); physicsFolder.close();
    const trailFolder = gui.addFolder('Wingtip Trails'); trailFolder.add(controlParams, 'trailEmissionRate', 10, 500, 5); trailFolder.add(controlParams, 'trailParticleLifetime', 0.2, 5.0, 0.1).onChange(updateTrailMaterialUniforms); trailFolder.add(controlParams, 'trailSize', 0.1, 50.0, 0.5).onChange(updateTrailMaterialUniforms); trailFolder.add(controlParams, 'trailOpacity', 0.0, 1.0, 0.05).onChange(updateTrailMaterialUniforms); trailFolder.addColor(controlParams, 'trailColor').onChange(updateTrailMaterialColor); trailFolder.add(controlParams, 'trailTriggerSpeed', 10, 150, 1); trailFolder.add(controlParams, 'trailTriggerAngularVel', 0.1, 5.0, 0.1); trailFolder.open();
    const smokeFolder = gui.addFolder('Volcano Smoke'); smokeFolder.add(controlParams, 'smokeEmissionRate', 10, 1000, 10); smokeFolder.add(controlParams, 'smokeLifetime', 1.0, 20.0, 0.5).onChange(updateSmokeMaterialUniforms); smokeFolder.add(controlParams, 'smokeBaseVelocityY', 5.0, 50.0, 1.0); smokeFolder.add(controlParams, 'smokeVelocitySpread', 0.0, 50.0, 1.0); smokeFolder.add(controlParams, 'smokeTurbulence', 0.0, 2.0, 0.05); smokeFolder.add(controlParams, 'smokeSize', 5.0, 100.0, 1.0).onChange(updateSmokeMaterialUniforms); smokeFolder.add(controlParams, 'smokeOpacity', 0.0, 1.0, 0.05).onChange(updateSmokeMaterialUniforms); smokeFolder.addColor(controlParams, 'smokeColor').onChange(updateSmokeMaterialColor); smokeFolder.add(controlParams, 'smokeEmissionRadius', 5, CRATER_RADIUS, 5); smokeFolder.open();
    const engineFolder = gui.addFolder('Engine Burn'); engineFolder.add(controlParams, 'engineEmissionRate', 50, 1500, 10); engineFolder.add(controlParams, 'engineLifetime', 0.05, 0.5, 0.01).onChange(updateEngineMaterialUniforms); engineFolder.add(controlParams, 'engineBaseVelocity', -100.0, -10.0, 1.0); engineFolder.add(controlParams, 'engineVelocitySpread', 0.0, 20.0, 0.5); engineFolder.add(controlParams, 'engineSize', 1.0, 20.0, 0.1).onChange(updateEngineMaterialUniforms); engineFolder.add(controlParams, 'engineOpacity', 0.1, 1.0, 0.05).onChange(updateEngineMaterialUniforms); engineFolder.addColor(controlParams, 'engineColor').onChange(updateEngineMaterialColor); engineFolder.open();
    const worldFolder = gui.addFolder('World Effects'); worldFolder.add(controlParams, 'edgeFogStartDistance', 100, WORLD_BOUNDARY, 10); worldFolder.add(controlParams, 'edgeFogNearFactor', 0.0, 1.0, 0.05); worldFolder.add(controlParams, 'edgeFogFarFactor', 0.0, 1.0, 0.05); worldFolder.close();
    const explosionFolder = gui.addFolder('Crash Explosion');
    // *** Updated GUI range for explosion count ***
    explosionFolder.add(controlParams, 'explosionParticleCount', 100, MAX_EXPLOSION_PARTICLES, 50);
    explosionFolder.add(controlParams, 'explosionLifetime', 0.2, 2.0, 0.1).onChange(updateExplosionMaterialUniforms);
    explosionFolder.add(controlParams, 'explosionBaseVelocity', 10.0, 200.0, 5.0);
    explosionFolder.add(controlParams, 'explosionVelocitySpread', 0.0, 100.0, 5.0);
    // *** Updated GUI range for explosion size ***
    explosionFolder.add(controlParams, 'explosionSize', 5.0, 100.0, 1.0).onChange(updateExplosionMaterialUniforms); // Increased max size
    explosionFolder.add(controlParams, 'explosionOpacity', 0.1, 1.0, 0.05).onChange(updateExplosionMaterialUniforms);
    explosionFolder.addColor(controlParams, 'explosionColor').onChange(updateExplosionMaterialColor);
    explosionFolder.close();
    gui.add(controlParams, 'cameraSmoothness', 0.01, 0.5, 0.01);
} catch (e) { console.error("Error initializing lil-gui:", e); }
//---------------------

// --- Scene, Camera, Renderer, etc. ---
// (Setup remains the same)
const MODEL_SCALE = 1.0; const INITIAL_Y_ROTATION = Math.PI; const scene = new THREE.Scene(); scene.background = new THREE.Color(0x87ceeb); const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 8000); camera.position.set(0, 300, TERRAIN_SIZE * 0.8); const renderer = new THREE.WebGLRenderer({ antialias: true }); renderer.setSize(window.innerWidth, window.innerHeight); renderer.setPixelRatio(window.devicePixelRatio); document.body.appendChild(renderer.domElement); renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap; window.addEventListener('resize', () => { camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix(); renderer.setSize(window.innerWidth, window.innerHeight); renderer.setPixelRatio(window.devicePixelRatio); });

// --- Lighting ---
// (Setup remains the same)
const ambientLight = new THREE.AmbientLight(0xffffff, 0.7); scene.add(ambientLight); const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8); directionalLight.position.set(150, 250, 200); directionalLight.castShadow = true; directionalLight.shadow.mapSize.width = 2048; directionalLight.shadow.mapSize.height = 2048; directionalLight.shadow.camera.near = 10; directionalLight.shadow.camera.far = 1000; directionalLight.shadow.camera.left = -TERRAIN_SIZE * 0.6; directionalLight.shadow.camera.right = TERRAIN_SIZE * 0.6; directionalLight.shadow.camera.top = TERRAIN_SIZE * 0.6; directionalLight.shadow.camera.bottom = -TERRAIN_SIZE * 0.6; scene.add(directionalLight);

// --- Fog ---
scene.fog = new THREE.Fog(scene.background, controlParams.baseFogNear, controlParams.baseFogFar);
console.log(`Initial scene fog: Near=${scene.fog.near}, Far=${scene.fog.far}`);

// --- Sun ---
// (Function remains the same)
function createSun() { const sunGeometry = new THREE.SphereGeometry(50, 32, 32); const sunMaterial = new THREE.MeshBasicMaterial({ color: 0xffffdd, fog: false }); sunMesh = new THREE.Mesh(sunGeometry, sunMaterial); sunMesh.scale.set(3, 3, 3); const sunDistance = 5000; sunMesh.position.copy(directionalLight.position).normalize().multiplyScalar(sunDistance); scene.add(sunMesh); console.log("Sun mesh created and scaled at:", sunMesh.position); }

console.log("Base scene setup complete.");


// --- Load Assets ---
// (Loading logic remains the same, includes updated nozzle pos)
const loadingManager = new THREE.LoadingManager( () => { console.log("LOADER: All assets loaded successfully."); initPhysicsAndScenery(); }, undefined, (url) => { console.error("Loading Manager Error loading:", url); } );
const loader = new GLTFLoader(loadingManager);
const textureLoader = new THREE.TextureLoader(loadingManager);
textureLoader.load( 'assets/particle.png', (texture) => { particleTexture = texture; particleTexture.needsUpdate = true; particleTexture.magFilter = THREE.LinearFilter; particleTexture.minFilter = THREE.LinearMipmapLinearFilter; console.log("Particle texture loaded successfully ('assets/particle.png') and configured."); }, undefined, (err) => { console.error("FAILED to load particle texture 'assets/particle.png'. Effects will fail.", err); particleTexture = null; } );
loader.load( './models/f16.gltf', (gltf) => {
        try {
            console.log("GLTF loaded, setting up model...");
            actualModelMeshGroup = gltf.scene;
            actualModelMeshGroup.scale.set(MODEL_SCALE, MODEL_SCALE, MODEL_SCALE);
            actualModelMeshGroup.rotation.y = INITIAL_Y_ROTATION;
            leftWingTip = new THREE.Object3D(); rightWingTip = new THREE.Object3D();
            leftWingTip.position.set(-6, 0.5, 1); rightWingTip.position.set(6, 0.5, 1);
            actualModelMeshGroup.add(leftWingTip); actualModelMeshGroup.add(rightWingTip);
            console.log("Wingtip helper objects added.");
            engineNozzleLeft = new THREE.Object3D(); engineNozzleRight = new THREE.Object3D();
            engineNozzleLeft.position.set(-0.8, 1.9, 7.0); // Using user's values
            engineNozzleRight.position.set(0.8, 1.9, 7.0); // Using user's values
            actualModelMeshGroup.add(engineNozzleLeft); actualModelMeshGroup.add(engineNozzleRight);
            console.log("UPDATED Engine nozzle helper objects (Left & Right) added.");
            actualModelMeshGroup.traverse((child) => { if (child.isMesh) { child.castShadow = true; } });
            aircraftModel = new THREE.Group(); aircraftModel.add(actualModelMeshGroup);
            scene.add(aircraftModel);
            console.log("Aircraft model container added to scene (initial position pending terrain).");
            INITIAL_AIRCRAFT_QUAT.copy(aircraftModel.quaternion);
        } catch (e) { console.error("Error setting up model after GLTF load:", e); aircraftModel = undefined; }
    }, undefined, (e) => { console.error("GLTF Load Error:", e); aircraftModel = undefined; }
);
console.log("Asset loading initiated...");


// --- Key tracking ---
// (Key tracking remains the same)
const keys = {}; document.addEventListener('keydown', (event) => { const key = event.key.toLowerCase(); keys[key] = true; if (event.code === 'ShiftLeft' || event.code === 'ShiftRight') keys['shift'] = true; }); document.addEventListener('keyup', (event) => { const key = event.key.toLowerCase(); keys[key] = false; if (event.code === 'ShiftLeft' || event.code === 'ShiftRight') keys['shift'] = false; }); console.log("Keyboard listeners added.");

// --- Get Procedural Terrain Height ---
// (Function remains the same)
function getProceduralTerrainHeight(worldX, worldZ) { if (typeof THREE === 'undefined' || !THREE.MathUtils) { console.error("GPTH: THREE undefined"); return 0; } let baseHeight = Math.sin(worldX * TERRAIN_NOISE_SCALE) * Math.cos(worldZ * TERRAIN_NOISE_SCALE) * TERRAIN_NOISE_HEIGHT; baseHeight += (Math.sin(worldX * TERRAIN_NOISE_SCALE * 5) + Math.cos(worldZ * TERRAIN_NOISE_SCALE * 7)) * (TERRAIN_NOISE_HEIGHT * 0.2); const distSqFromCenter = worldX * worldX + worldZ * worldZ; const volcanoShape = Math.exp(-distSqFromCenter / (VOLCANO_RADIUS * VOLCANO_RADIUS * VOLCANO_SLOPE_FACTOR)); const coneHeight = volcanoShape * VOLCANO_HEIGHT; const craterFloorRadius = CRATER_RADIUS * (1.0 - CRATER_RIM_WIDTH_FACTOR); const craterFloorRadiusSq = craterFloorRadius * craterFloorRadius; const craterOuterRadiusSq = CRATER_RADIUS * CRATER_RADIUS; const rimTargetHeight = VOLCANO_HEIGHT; const craterFloorTarget = rimTargetHeight - CRATER_DEPTH; let volcanoHeightModifier; if (distSqFromCenter < craterFloorRadiusSq) { volcanoHeightModifier = craterFloorTarget; } else if (distSqFromCenter >= craterFloorRadiusSq && distSqFromCenter < craterOuterRadiusSq) { const distFromCenter = Math.sqrt(distSqFromCenter); const t = (distFromCenter - craterFloorRadius) / (CRATER_RADIUS - craterFloorRadius); const smooth_t = THREE.MathUtils.smoothstep(t, 0, 1); volcanoHeightModifier = THREE.MathUtils.lerp(craterFloorTarget, rimTargetHeight, smooth_t); } else { volcanoHeightModifier = coneHeight; } let finalHeight = baseHeight + volcanoHeightModifier; const maxHeight = VOLCANO_HEIGHT + TERRAIN_NOISE_HEIGHT * 1.5; const minHeight = -TERRAIN_NOISE_HEIGHT * 2; return THREE.MathUtils.clamp(finalHeight, minHeight, maxHeight); }

// --- Create Procedural Terrain ---
// (Function remains the same)
function createProceduralTerrain() { console.log("--- DEBUG: THREE object at start of createProceduralTerrain:", THREE); if (typeof THREE === 'undefined' || !THREE.PlaneGeometry) { console.error("ABORTING createProceduralTerrain: THREE undefined"); return; } const terrainGeo = new THREE.PlaneGeometry(TERRAIN_SIZE, TERRAIN_SIZE, TERRAIN_SEGMENTS, TERRAIN_SEGMENTS); const positions = terrainGeo.attributes.position; const colors = []; let peakY = -Infinity, peakX = 0, peakPlaneY = 0; console.log("Generating terrain mesh heights and colors..."); for (let i = 0; i < positions.count; i++) { const x = positions.getX(i); const y_plane = positions.getY(i); const h = getProceduralTerrainHeight(x, y_plane); positions.setZ(i, h); if (h > peakY) { peakY = h; peakX = x; peakPlaneY = y_plane; } try { const color = new THREE.Color(); if (h < WATER_LEVEL + 2) color.set(0x668844); else if (h < TERRAIN_NOISE_HEIGHT * 1.5) color.setHSL(0.3, 0.5, 0.3 + Math.random() * 0.15); else if (h < VOLCANO_HEIGHT * 0.7) color.setHSL(0.1, 0.3, 0.3 + Math.random() * 0.1); else color.setHSL(0.05, 0.1, 0.25 + Math.random() * 0.1); colors.push(color.r, color.g, color.b); } catch (e) { console.error("Error setting vertex color at index", i, ":", e); colors.push(1, 0, 1); } } terrainGeo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3)); positions.needsUpdate = true; terrainGeo.computeVertexNormals(); const terrainMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0.05 }); terrainMesh = new THREE.Mesh(terrainGeo, terrainMaterial); terrainMesh.rotation.x = -Math.PI / 2; terrainMesh.receiveShadow = true; terrainMesh.castShadow = true; VOLCANO_PEAK_POS.set(peakX, peakY, peakPlaneY); console.log("Volcano highest point (rim) world coords:", VOLCANO_PEAK_POS.toArray().map(n => n.toFixed(1)).join(', ')); scene.add(terrainMesh); const lightHeight = (VOLCANO_HEIGHT - CRATER_DEPTH) + 20; if (!volcanoLight) { volcanoLight = new THREE.PointLight(0xff5500, 3.5, 400, 1.8); volcanoLight.castShadow = false; scene.add(volcanoLight); } volcanoLight.position.set(0, lightHeight, 0); console.log("Procedural terrain mesh created. Volcano light positioned."); }

// --- Create Water Plane ---
// (Function remains the same)
function createWaterPlane() { if (typeof THREE === 'undefined' || !THREE.PlaneGeometry) { console.error("CreateWaterPlane: THREE undefined"); return; } const waterGeo = new THREE.PlaneGeometry(TERRAIN_SIZE * 1.2, TERRAIN_SIZE * 1.2); const waterMat = new THREE.MeshStandardMaterial({ color: 0x3366aa, transparent: true, opacity: 0.75, roughness: 0.1, metalness: 0.2 }); const waterMesh = new THREE.Mesh(waterGeo, waterMat); waterMesh.rotation.x = -Math.PI / 2; waterMesh.position.y = WATER_LEVEL; waterMesh.receiveShadow = true; scene.add(waterMesh); console.log("Water plane created."); }

// --- Define Tree Types ---
// (Definitions remain the same)
const treeTypes = [ { name: "Pine", trunkGeo: new THREE.CylinderGeometry(0.4, 0.6, 1, 5), trunkMat: new THREE.MeshStandardMaterial({ color: 0x8B4513, roughness: 0.9 }), topGeo: new THREE.ConeGeometry(2.0, 1, 6), topMat: new THREE.MeshStandardMaterial({ color: 0x228B22, roughness: 0.9, flatShading: true }), trunkHeightBase: 4, trunkHeightVar: 2, topHeightBase: 6, topHeightVar: 4, scaleBase: 0.8, scaleVar: 0.4 }, { name: "TallPine", trunkGeo: new THREE.CylinderGeometry(0.3, 0.4, 1, 5), trunkMat: new THREE.MeshStandardMaterial({ color: 0x7a3d0f, roughness: 0.9 }), topGeo: new THREE.ConeGeometry(1.5, 1, 5), topMat: new THREE.MeshStandardMaterial({ color: 0x1a681a, roughness: 0.9, flatShading: true }), trunkHeightBase: 6, trunkHeightVar: 3, topHeightBase: 9, topHeightVar: 5, scaleBase: 0.7, scaleVar: 0.3 }, { name: "Fir", layers: [ { geo: new THREE.ConeGeometry(2.5, 2, 7), mat: new THREE.MeshStandardMaterial({ color: 0x2E8B57, roughness: 0.8, flatShading: true }), yOffset: 0 }, { geo: new THREE.ConeGeometry(2.0, 2, 7), mat: new THREE.MeshStandardMaterial({ color: 0x2E8B57, roughness: 0.8, flatShading: true }), yOffset: 1.5 }, { geo: new THREE.ConeGeometry(1.5, 2, 7), mat: new THREE.MeshStandardMaterial({ color: 0x2E8B57, roughness: 0.8, flatShading: true }), yOffset: 3.0 }, { geo: new THREE.ConeGeometry(1.0, 1.5, 7), mat: new THREE.MeshStandardMaterial({ color: 0x2E8B57, roughness: 0.8, flatShading: true }), yOffset: 4.5 }, ], trunkGeo: new THREE.CylinderGeometry(0.5, 0.7, 1, 6), trunkMat: new THREE.MeshStandardMaterial({ color: 0x8B4513, roughness: 0.9 }), trunkHeightBase: 3, trunkHeightVar: 1, totalHeightBase: 7, scaleBase: 0.9, scaleVar: 0.3, isLayered: true }, { name: "Deciduous", trunkGeo: new THREE.CylinderGeometry(0.5, 0.8, 1, 6), trunkMat: new THREE.MeshStandardMaterial({ color: 0x966F33, roughness: 0.85 }), topGeo: new THREE.SphereGeometry(1.0, 8, 6), topMat: new THREE.MeshStandardMaterial({ color: 0x556B2F, roughness: 0.9, flatShading: true }), trunkHeightBase: 3, trunkHeightVar: 1.5, topRadiusBase: 3, topRadiusVar: 1, scaleBase: 0.8, scaleVar: 0.5 }, { name: "DeadTree", trunkGeo: new THREE.CylinderGeometry(0.3, 0.5, 1, 5), trunkMat: new THREE.MeshStandardMaterial({ color: 0x6F4E37, roughness: 0.95 }), topGeo: null, topMat: null, trunkHeightBase: 5, trunkHeightVar: 3, topHeightBase: 0, topHeightVar: 0, scaleBase: 0.6, scaleVar: 0.3 } ];

// --- Create Procedural Trees (Instanced with Variety) ---
// (Function remains the same)
function createProceduralTrees() { if (typeof THREE === 'undefined' || !THREE.InstancedMesh) { console.error("CreateProceduralTrees: THREE or InstancedMesh undefined"); return; } console.log(`Creating procedural trees with ${treeTypes.length} types...`); const treeInstances = []; treeTypes.forEach((type) => { const typeData = { typeName: type.name, trunk: null, tops: [] }; const maxInstancesPerMesh = Math.ceil(TREE_COUNT / treeTypes.length) * (type.isLayered ? type.layers.length + 1 : 2); if (type.trunkGeo && type.trunkMat) { typeData.trunk = new THREE.InstancedMesh(type.trunkGeo, type.trunkMat, maxInstancesPerMesh); typeData.trunk.castShadow = true; typeData.trunk.receiveShadow = true; scene.add(typeData.trunk); } if (type.isLayered) { type.layers.forEach(layer => { const layerInstance = new THREE.InstancedMesh(layer.geo, layer.mat, maxInstancesPerMesh); layerInstance.castShadow = true; layerInstance.receiveShadow = true; scene.add(layerInstance); typeData.tops.push(layerInstance); }); } else if (type.topGeo && type.topMat) { const topInstance = new THREE.InstancedMesh(type.topGeo, type.topMat, maxInstancesPerMesh); topInstance.castShadow = true; topInstance.receiveShadow = true; scene.add(topInstance); typeData.tops.push(topInstance); } treeInstances.push(typeData); }); const matrix = new THREE.Matrix4(); const position = new THREE.Vector3(); const quaternion = new THREE.Quaternion(); const scale = new THREE.Vector3(); const instanceCounters = treeInstances.map(ti => ({ trunk: 0, tops: new Array(ti.tops.length).fill(0) })); let totalPlacedTrees = 0; const terrainBounds = TERRAIN_SIZE * 0.45; const craterOuterRadiusSq = CRATER_RADIUS * CRATER_RADIUS; console.log(`Attempting to place ${TREE_COUNT} trees...`); for (let i = 0; i < TREE_COUNT * 2 && totalPlacedTrees < TREE_COUNT; i++) { const x = (Math.random() - 0.5) * terrainBounds * 2; const z = (Math.random() - 0.5) * terrainBounds * 2; const y = getProceduralTerrainHeight(x, z); const distSq = x * x + z * z; const typeIndex = Math.floor(Math.random() * treeTypes.length); const treeType = treeTypes[typeIndex]; const treeInstanceData = treeInstances[typeIndex]; let placementHeight = treeType.trunkHeightBase; if (treeType.isLayered) placementHeight = treeType.totalHeightBase; else if (treeType.topRadiusBase) placementHeight += treeType.topRadiusBase * 2; else placementHeight += treeType.topHeightBase; if (distSq > craterOuterRadiusSq && y > WATER_LEVEL + 1 && y < VOLCANO_HEIGHT * 0.7 - placementHeight * 0.5) { const slopeX = getProceduralTerrainHeight(x + 1, z) - getProceduralTerrainHeight(x - 1, z); const slopeZ = getProceduralTerrainHeight(x, z + 1) - getProceduralTerrainHeight(x, z - 1); const steepness = Math.sqrt(slopeX * slopeX + slopeZ * slopeZ) / 2.0; if (steepness < 1.5) { const trunkHeight = treeType.trunkHeightBase + Math.random() * treeType.trunkHeightVar; const randomScale = treeType.scaleBase + Math.random() * treeType.scaleVar; const randomRotation = new THREE.Euler(0, Math.random() * Math.PI * 2, 0); quaternion.setFromEuler(randomRotation); if (treeInstanceData.trunk) { const trunkCounter = instanceCounters[typeIndex].trunk; if (trunkCounter < treeInstanceData.trunk.count) { position.set(x, y + trunkHeight / 2, z); scale.set(randomScale, trunkHeight, randomScale); matrix.compose(position, quaternion, scale); treeInstanceData.trunk.setMatrixAt(trunkCounter, matrix); instanceCounters[typeIndex].trunk++; } else { console.warn(`Exceeded max instances for trunk type ${treeType.name}`); continue; } } if (treeType.isLayered) { let canPlaceAllLayers = true; treeType.layers.forEach((layer, layerIndex) => { if (instanceCounters[typeIndex].tops[layerIndex] >= treeInstanceData.tops[layerIndex].count) { canPlaceAllLayers = false; } }); if (canPlaceAllLayers) { let currentYOffset = y + trunkHeight; treeType.layers.forEach((layer, layerIndex) => { const topCounter = instanceCounters[typeIndex].tops[layerIndex]; position.set(x, currentYOffset + layer.yOffset * randomScale, z); scale.set(randomScale, randomScale, randomScale); matrix.compose(position, quaternion, scale); treeInstanceData.tops[layerIndex].setMatrixAt(topCounter, matrix); instanceCounters[typeIndex].tops[layerIndex]++; }); } else { console.warn(`Exceeded max instances for some layer of type ${treeType.name}`); if (treeInstanceData.trunk) instanceCounters[typeIndex].trunk--; continue; } } else if (treeInstanceData.tops.length > 0) { const topCounter = instanceCounters[typeIndex].tops[0]; if (topCounter < treeInstanceData.tops[0].count) { if (treeType.topRadiusBase) { const topRadius = treeType.topRadiusBase + Math.random() * treeType.topRadiusVar; position.set(x, y + trunkHeight + topRadius, z); scale.set(randomScale * topRadius, randomScale * topRadius, randomScale * topRadius); } else { const topHeight = treeType.topHeightBase + Math.random() * treeType.topHeightVar; position.set(x, y + trunkHeight + topHeight / 2 - 0.5, z); scale.set(randomScale, topHeight, randomScale); } matrix.compose(position, quaternion, scale); treeInstanceData.tops[0].setMatrixAt(topCounter, matrix); instanceCounters[typeIndex].tops[0]++; } else { console.warn(`Exceeded max instances for top type ${treeType.name}`); if (treeInstanceData.trunk) instanceCounters[typeIndex].trunk--; continue; } } totalPlacedTrees++; } } } treeInstances.forEach((instances, typeIndex) => { if (instances.trunk) { instances.trunk.count = instanceCounters[typeIndex].trunk; instances.trunk.instanceMatrix.needsUpdate = true; /*console.log(`Type ${instances.typeName}: Placed ${instances.trunk.count} trunks.`);*/ } instances.tops.forEach((topInstance, topIndex) => { topInstance.count = instanceCounters[typeIndex].tops[topIndex]; topInstance.instanceMatrix.needsUpdate = true; /*console.log(`Type ${instances.typeName}: Placed ${topInstance.count} tops (part ${topIndex}).`);*/ }); }); console.log(`Placed ${totalPlacedTrees} total procedural trees.`); }

// --- Create Lava Pool Mesh ---
// (Function remains the same)
function createLavaPool() { if (typeof THREE === 'undefined' || !THREE.CircleGeometry) { console.error("CreateLavaPool: THREE undefined"); return; } console.log("Creating lava pool mesh..."); const lavaRadius = CRATER_RADIUS * (1.0 - CRATER_RIM_WIDTH_FACTOR) * 0.95; if (lavaRadius <= 0) { console.warn("Lava pool radius is zero or negative, skipping creation."); return; } const lavaGeo = new THREE.CircleGeometry(lavaRadius, 64); const lavaMat = new THREE.MeshStandardMaterial({ color: 0xff4800, emissive: 0xff4800, emissiveIntensity: 1.2, roughness: 0.7, metalness: 0.1 }); lavaPoolMesh = new THREE.Mesh(lavaGeo, lavaMat); lavaPoolMesh.rotation.x = -Math.PI / 2; const craterFloorY = (VOLCANO_HEIGHT - CRATER_DEPTH) + LAVA_POOL_Y_OFFSET; lavaPoolMesh.position.y = craterFloorY; VOLCANO_CRATER_CENTER_Y.set(0, craterFloorY, 0); lavaPoolMesh.receiveShadow = true; lavaPoolMesh.castShadow = false; scene.add(lavaPoolMesh); console.log(`Lava pool mesh created at Y: ${craterFloorY.toFixed(2)}.`); }

// --- Create Procedural Scenery Function ---
// (Function remains the same)
function createProceduralScenery() { console.log("Creating procedural scenery..."); createProceduralTerrain(); if (terrainMesh) { createWaterPlane(); createProceduralTrees(); createLavaPool(); } else { console.error("Scenery creation skipped because terrain mesh failed."); } console.log("Procedural scenery creation process finished."); }


// --- Trail Shaders ---
// (Shaders remain the same)
const trailVertexShader = ` attribute float startTime; attribute float size; attribute float alpha; varying float vAlpha; uniform float uTime; uniform float uLifetime; uniform float uSize; void main() { vAlpha = alpha; vec4 mvPosition = modelViewMatrix * vec4(position, 1.0); gl_PointSize = max(1.0, size * uSize); gl_Position = projectionMatrix * mvPosition; }`;
const trailFragmentShader = ` uniform vec3 uColor; uniform sampler2D uTexture; uniform float uOpacity; varying float vAlpha; void main() { vec4 texColor = texture2D(uTexture, gl_PointCoord); if (texColor.a < 0.1) discard; gl_FragColor = vec4(uColor * texColor.rgb, texColor.a * vAlpha * uOpacity); }`;

// --- Volcano Smoke Shaders ---
// (Shaders remain the same)
const smokeVertexShader = ` attribute float startTime; attribute vec3 velocity; attribute float size; attribute float alpha; varying float vAlpha; uniform float uTime; uniform float uLifetime; uniform float uSize; void main() { float age = uTime - startTime; float lifeRatio = clamp(age / uLifetime, 0.0, 1.0); vec3 currentPos = position + velocity * age; vAlpha = alpha; float sizeFactor = sin(lifeRatio * 3.14159); gl_PointSize = max(1.0, size * uSize * sizeFactor); vec4 mvPosition = modelViewMatrix * vec4(currentPos, 1.0); gl_Position = projectionMatrix * mvPosition; }`;
const smokeFragmentShader = ` uniform vec3 uColor; uniform sampler2D uTexture; uniform float uOpacity; varying float vAlpha; void main() { vec4 texColor = texture2D(uTexture, gl_PointCoord); if (texColor.a < 0.1) discard; float finalAlpha = texColor.a * vAlpha * uOpacity; gl_FragColor = vec4(uColor * texColor.rgb, finalAlpha); }`;

// --- Cloud Shaders Removed ---

// --- Engine Burn Shaders ---
// (Shaders remain the same)
const engineVertexShader = ` attribute float startTime; attribute vec3 velocity; attribute float size; attribute float alpha; varying float vAlpha; uniform float uTime; uniform float uLifetime; uniform float uSize; void main() { float age = uTime - startTime; vec3 currentPos = position + velocity * age; vAlpha = alpha; float lifeRatio = clamp(age / uLifetime, 0.0, 1.0); float sizeFactor = max(0.0, 1.0 - lifeRatio * lifeRatio); gl_PointSize = max(1.0, size * uSize * sizeFactor); vec4 mvPosition = modelViewMatrix * vec4(currentPos, 1.0); gl_Position = projectionMatrix * mvPosition; }`;
const engineFragmentShader = ` uniform vec3 uColor; uniform sampler2D uTexture; uniform float uOpacity; varying float vAlpha; void main() { vec4 texColor = texture2D(uTexture, gl_PointCoord); if (texColor.a < 0.1) discard; float finalAlpha = texColor.a * vAlpha * uOpacity; gl_FragColor = vec4(uColor * texColor.rgb, finalAlpha); }`;

// --- Crash Explosion Shaders ---
// (Shaders remain the same)
const explosionVertexShader = ` attribute float startTime; attribute vec3 velocity; attribute float size; attribute float alpha; varying float vAlpha; uniform float uTime; uniform float uLifetime; uniform float uSize; void main() { float age = uTime - startTime; float lifeRatio = clamp(age / uLifetime, 0.0, 1.0); vec3 currentPos = position + velocity * age; vAlpha = alpha; float sizeFactor = max(0.0, 1.0 - lifeRatio); gl_PointSize = max(1.0, size * uSize * sizeFactor); vec4 mvPosition = modelViewMatrix * vec4(currentPos, 1.0); gl_Position = projectionMatrix * mvPosition; }`;
const explosionFragmentShader = ` uniform vec3 uColor; uniform sampler2D uTexture; uniform float uOpacity; varying float vAlpha; void main() { vec4 texColor = texture2D(uTexture, gl_PointCoord); if (texColor.a < 0.1) discard; float finalAlpha = texColor.a * vAlpha * uOpacity; gl_FragColor = vec4(uColor * texColor.rgb, finalAlpha); }`;


// --- Create Trail Systems (ShaderMaterial) ---
// (Function remains the same)
function createTrailSystems() { console.log("Creating wingtip trail systems (ShaderMaterial)..."); if (!particleTexture) { console.error("Cannot create trails: particleTexture missing."); return; } if (!leftWingTip || !rightWingTip) { console.error("Cannot create trails: Wing tip helpers missing."); return; } const createTrail = (side) => { const geometry = new THREE.BufferGeometry(); const positions = new Float32Array(MAX_TRAIL_PARTICLES * 3); const startTimes = new Float32Array(MAX_TRAIL_PARTICLES); const alphas = new Float32Array(MAX_TRAIL_PARTICLES); const sizes = new Float32Array(MAX_TRAIL_PARTICLES); for (let i = 0; i < MAX_TRAIL_PARTICLES; i++) { positions[i * 3 + 0] = OFF_SCREEN_POS.x; positions[i * 3 + 1] = OFF_SCREEN_POS.y; positions[i * 3 + 2] = OFF_SCREEN_POS.z; startTimes[i] = -1.0; alphas[i] = 0.0; sizes[i] = 1.0; } geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3)); geometry.setAttribute('startTime', new THREE.BufferAttribute(startTimes, 1)); geometry.setAttribute('alpha', new THREE.BufferAttribute(alphas, 1)); geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1)); const material = new THREE.ShaderMaterial({ uniforms: { uTime: { value: 0.0 }, uLifetime: { value: controlParams.trailParticleLifetime }, uColor: { value: new THREE.Color(controlParams.trailColor) }, uOpacity: { value: controlParams.trailOpacity }, uSize: { value: controlParams.trailSize }, uTexture: { value: particleTexture } }, vertexShader: trailVertexShader, fragmentShader: trailFragmentShader, transparent: true, depthWrite: false, blending: THREE.NormalBlending }); const points = new THREE.Points(geometry, material); points.frustumCulled = false; scene.add(points); console.log(`Trail system created for ${side} wing with NormalBlending.`); return points; }; leftWingTrail = createTrail('left'); rightWingTrail = createTrail('right'); updateTrailMaterialUniforms(); updateTrailMaterialColor(); }

// --- Create Volcano Smoke System (ShaderMaterial) ---
// (Function remains the same)
function createVolcanoSmokeSystem() { console.log("Creating volcano smoke system (ShaderMaterial)..."); if (!particleTexture) { console.error("Cannot create smoke: particleTexture missing."); return; } const geometry = new THREE.BufferGeometry(); const positions = new Float32Array(MAX_SMOKE_PARTICLES * 3); const velocities = new Float32Array(MAX_SMOKE_PARTICLES * 3); const startTimes = new Float32Array(MAX_SMOKE_PARTICLES); const alphas = new Float32Array(MAX_SMOKE_PARTICLES); const sizes = new Float32Array(MAX_SMOKE_PARTICLES); for (let i = 0; i < MAX_SMOKE_PARTICLES; i++) { positions[i * 3 + 0] = OFF_SCREEN_POS.x; positions[i * 3 + 1] = OFF_SCREEN_POS.y; positions[i * 3 + 2] = OFF_SCREEN_POS.z; velocities[i * 3 + 0] = 0; velocities[i * 3 + 1] = 0; velocities[i * 3 + 2] = 0; startTimes[i] = -1.0; alphas[i] = 0.0; sizes[i] = 1.0; } geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3)); geometry.setAttribute('velocity', new THREE.BufferAttribute(velocities, 3)); geometry.setAttribute('startTime', new THREE.BufferAttribute(startTimes, 1)); geometry.setAttribute('alpha', new THREE.BufferAttribute(alphas, 1)); geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1)); const material = new THREE.ShaderMaterial({ uniforms: { uTime: { value: 0.0 }, uLifetime: { value: controlParams.smokeLifetime }, uColor: { value: new THREE.Color(controlParams.smokeColor) }, uOpacity: { value: controlParams.smokeOpacity }, uSize: { value: controlParams.smokeSize }, uTexture: { value: particleTexture } }, vertexShader: smokeVertexShader, fragmentShader: smokeFragmentShader, transparent: true, depthWrite: false, blending: THREE.NormalBlending }); volcanoSmokeSystem = new THREE.Points(geometry, material); volcanoSmokeSystem.frustumCulled = false; scene.add(volcanoSmokeSystem); console.log("Volcano smoke system created."); updateSmokeMaterialUniforms(); updateSmokeMaterialColor(); }

// --- Create Cloud System Removed ---

// --- Create Engine Burn System ---
// (Function remains the same - adds system as child of aircraftModel)
function createEngineBurnSystem() { console.log("Creating engine burn system..."); if (!particleTexture) { console.error("Cannot create engine burn: particleTexture missing."); return; } if (!engineNozzleLeft || !engineNozzleRight) { console.error("Cannot create engine burn: One or both engineNozzle helpers missing."); return; } if (!aircraftModel) { console.error("Cannot create engine burn: aircraftModel not available yet."); return; } const geometry = new THREE.BufferGeometry(); const positions = new Float32Array(MAX_ENGINE_PARTICLES * 3); const velocities = new Float32Array(MAX_ENGINE_PARTICLES * 3); const startTimes = new Float32Array(MAX_ENGINE_PARTICLES); const alphas = new Float32Array(MAX_ENGINE_PARTICLES); const sizes = new Float32Array(MAX_ENGINE_PARTICLES); for (let i = 0; i < MAX_ENGINE_PARTICLES; i++) { positions[i * 3 + 0] = OFF_SCREEN_POS.x; positions[i * 3 + 1] = OFF_SCREEN_POS.y; positions[i * 3 + 2] = OFF_SCREEN_POS.z; velocities[i * 3 + 0] = 0; velocities[i * 3 + 1] = 0; velocities[i * 3 + 2] = 0; startTimes[i] = -1.0; alphas[i] = 0.0; sizes[i] = 1.0; } geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3)); geometry.setAttribute('velocity', new THREE.BufferAttribute(velocities, 3)); geometry.setAttribute('startTime', new THREE.BufferAttribute(startTimes, 1)); geometry.setAttribute('alpha', new THREE.BufferAttribute(alphas, 1)); geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1)); const material = new THREE.ShaderMaterial({ uniforms: { uTime: { value: 0.0 }, uLifetime: { value: controlParams.engineLifetime }, uColor: { value: new THREE.Color(controlParams.engineColor) }, uOpacity: { value: controlParams.engineOpacity }, uSize: { value: controlParams.engineSize }, uTexture: { value: particleTexture } }, vertexShader: engineVertexShader, fragmentShader: engineFragmentShader, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }); engineBurnSystem = new THREE.Points(geometry, material); engineBurnSystem.frustumCulled = false; aircraftModel.add(engineBurnSystem); console.log("Engine burn system created and added as child of aircraftModel."); updateEngineMaterialUniforms(); updateEngineMaterialColor(); }

// --- Create Crash Explosion System ---
// (Function remains the same)
function createCrashExplosionSystem() { console.log("Creating crash explosion system..."); if (!particleTexture) { console.error("Cannot create explosion: particleTexture missing."); return; } const geometry = new THREE.BufferGeometry(); const positions = new Float32Array(MAX_EXPLOSION_PARTICLES * 3); const velocities = new Float32Array(MAX_EXPLOSION_PARTICLES * 3); const startTimes = new Float32Array(MAX_EXPLOSION_PARTICLES); const alphas = new Float32Array(MAX_EXPLOSION_PARTICLES); const sizes = new Float32Array(MAX_EXPLOSION_PARTICLES); for (let i = 0; i < MAX_EXPLOSION_PARTICLES; i++) { positions[i * 3 + 0] = OFF_SCREEN_POS.x; positions[i * 3 + 1] = OFF_SCREEN_POS.y; positions[i * 3 + 2] = OFF_SCREEN_POS.z; velocities[i * 3 + 0] = 0; velocities[i * 3 + 1] = 0; velocities[i * 3 + 2] = 0; startTimes[i] = -1.0; alphas[i] = 0.0; sizes[i] = 1.0; } geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3)); geometry.setAttribute('velocity', new THREE.BufferAttribute(velocities, 3)); geometry.setAttribute('startTime', new THREE.BufferAttribute(startTimes, 1)); geometry.setAttribute('alpha', new THREE.BufferAttribute(alphas, 1)); geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1)); const material = new THREE.ShaderMaterial({ uniforms: { uTime: { value: 0.0 }, uLifetime: { value: controlParams.explosionLifetime }, uColor: { value: new THREE.Color(controlParams.explosionColor) }, uOpacity: { value: controlParams.explosionOpacity }, uSize: { value: controlParams.explosionSize }, uTexture: { value: particleTexture } }, vertexShader: explosionVertexShader, fragmentShader: explosionFragmentShader, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }); crashExplosionSystem = new THREE.Points(geometry, material); crashExplosionSystem.frustumCulled = false; scene.add(crashExplosionSystem); console.log("Crash explosion system created."); updateExplosionMaterialUniforms(); updateExplosionMaterialColor(); }


// --- Update Material Uniform Functions ---
// (Cloud functions removed)
function updateTrailMaterialUniforms() { /*console.log(`DEBUG: Updating trail uSize to: ${controlParams.trailSize}`);*/ if (leftWingTrail && leftWingTrail.material) { const uniforms = leftWingTrail.material.uniforms; uniforms.uSize.value = controlParams.trailSize; uniforms.uOpacity.value = controlParams.trailOpacity; uniforms.uLifetime.value = controlParams.trailParticleLifetime; } if (rightWingTrail && rightWingTrail.material) { const uniforms = rightWingTrail.material.uniforms; uniforms.uSize.value = controlParams.trailSize; uniforms.uOpacity.value = controlParams.trailOpacity; uniforms.uLifetime.value = controlParams.trailParticleLifetime; } }
function updateTrailMaterialColor() { const newColor = new THREE.Color(controlParams.trailColor); if (leftWingTrail && leftWingTrail.material) { leftWingTrail.material.uniforms.uColor.value.set(newColor); } if (rightWingTrail && rightWingTrail.material) { rightWingTrail.material.uniforms.uColor.value.set(newColor); } }
function updateSmokeMaterialUniforms() { if (volcanoSmokeSystem && volcanoSmokeSystem.material) { const uniforms = volcanoSmokeSystem.material.uniforms; uniforms.uSize.value = controlParams.smokeSize; uniforms.uOpacity.value = controlParams.smokeOpacity; uniforms.uLifetime.value = controlParams.smokeLifetime; } }
function updateSmokeMaterialColor() { if (volcanoSmokeSystem && volcanoSmokeSystem.material) { const newColor = new THREE.Color(controlParams.smokeColor); volcanoSmokeSystem.material.uniforms.uColor.value.set(newColor); } }
// Cloud update functions removed
function updateEngineMaterialUniforms() { if (engineBurnSystem && engineBurnSystem.material) { const uniforms = engineBurnSystem.material.uniforms; uniforms.uSize.value = controlParams.engineSize; uniforms.uOpacity.value = controlParams.engineOpacity; uniforms.uLifetime.value = controlParams.engineLifetime; } }
function updateEngineMaterialColor() { if (engineBurnSystem && engineBurnSystem.material) { const newColor = new THREE.Color(controlParams.engineColor); engineBurnSystem.material.uniforms.uColor.value.set(newColor); } }
// Added explosion update functions
function updateExplosionMaterialUniforms() { if (crashExplosionSystem && crashExplosionSystem.material) { const uniforms = crashExplosionSystem.material.uniforms; uniforms.uSize.value = controlParams.explosionSize; uniforms.uOpacity.value = controlParams.explosionOpacity; uniforms.uLifetime.value = controlParams.explosionLifetime; } }
function updateExplosionMaterialColor() { if (crashExplosionSystem && crashExplosionSystem.material) { const newColor = new THREE.Color(controlParams.explosionColor); crashExplosionSystem.material.uniforms.uColor.value.set(newColor); } }


// --- Update Trails (ShaderMaterial Version) ---
// (Function remains the same)
function updateTrails(deltaTime) { if (!aircraftModel || !leftWingTrail || !rightWingTrail || !particleTexture || !leftWingTip || !rightWingTip) return; const currentTime = clock.getElapsedTime(); leftWingTrail.material.uniforms.uTime.value = currentTime; rightWingTrail.material.uniforms.uTime.value = currentTime; const speed = playerVelocity.length(); const angularSpeed = playerAngularVelocity.length(); const shouldEmit = speed > controlParams.trailTriggerSpeed || (speed > controlParams.trailTriggerSpeed * 0.5 && angularSpeed > controlParams.trailTriggerAngularVel); let particlesToEmit = shouldEmit ? Math.ceil(controlParams.trailEmissionRate * deltaTime) : 0; trailEmitLogTimer += deltaTime; if (trailEmitLogTimer > TRAIL_EMIT_LOG_INTERVAL) { /*console.log(`Trail Emission Check: Speed=${speed.toFixed(1)}, AngularVel=${angularSpeed.toFixed(1)}, ShouldEmit=${shouldEmit}, Emitting=${particlesToEmit}`);*/ trailEmitLogTimer = 0; } const emitParticle = (trailSystem, wingTipObject, side) => { if (!trailSystem || !wingTipObject || particlesToEmit <= 0) return; const geometry = trailSystem.geometry; const positions = geometry.attributes.position; const startTimes = geometry.attributes.startTime; const alphas = geometry.attributes.alpha; wingTipObject.getWorldPosition(wingTipWorldPosition); let emittedCount = 0; let needsPosUpdate = false; let needsStartTimeUpdate = false; let needsAlphaUpdate = false; for (let i = 0; i < particlesToEmit && emittedCount < MAX_TRAIL_PARTICLES; i++) { const index = currentTrailIndex[side]; positions.setXYZ(index, wingTipWorldPosition.x, wingTipWorldPosition.y, wingTipWorldPosition.z); startTimes.setX(index, currentTime); alphas.setX(index, 1.0); needsPosUpdate = true; needsStartTimeUpdate = true; needsAlphaUpdate = true; currentTrailIndex[side] = (index + 1) % MAX_TRAIL_PARTICLES; emittedCount++; } if (needsPosUpdate) positions.needsUpdate = true; if (needsStartTimeUpdate) startTimes.needsUpdate = true; if (needsAlphaUpdate) alphas.needsUpdate = true; }; emitParticle(leftWingTrail, leftWingTip, 'left'); emitParticle(rightWingTrail, rightWingTip, 'right'); const updateExistingParticles = (trailSystem) => { if (!trailSystem) return; const geometry = trailSystem.geometry; const positions = geometry.attributes.position; const startTimes = geometry.attributes.startTime; const alphas = geometry.attributes.alpha; let needsPosUpdate = false; let needsAlphaUpdate = false; let needsStartTimeUpdate = false; const lifetime = trailSystem.material.uniforms.uLifetime.value; for (let i = 0; i < MAX_TRAIL_PARTICLES; i++) { const startTime = startTimes.getX(i); if (startTime >= 0) { const age = currentTime - startTime; if (age > lifetime) { positions.setXYZ(i, OFF_SCREEN_POS.x, OFF_SCREEN_POS.y, OFF_SCREEN_POS.z); startTimes.setX(i, -1.0); alphas.setX(i, 0.0); needsPosUpdate = true; needsAlphaUpdate = true; needsStartTimeUpdate = true; } else { const lifeRatio = Math.max(0.0, 1.0 - (age / lifetime)); alphas.setX(i, lifeRatio); needsAlphaUpdate = true; } } } if (needsPosUpdate) positions.needsUpdate = true; if (needsAlphaUpdate) alphas.needsUpdate = true; if (needsStartTimeUpdate) startTimes.needsUpdate = true; }; updateExistingParticles(leftWingTrail); updateExistingParticles(rightWingTrail); }

// --- Update Volcano Smoke (ShaderMaterial Version) ---
// (Function remains the same)
function updateVolcanoSmoke(deltaTime) { if (!volcanoSmokeSystem || !particleTexture) return; const currentTime = clock.getElapsedTime(); const material = volcanoSmokeSystem.material; const geometry = volcanoSmokeSystem.geometry; material.uniforms.uTime.value = currentTime; const particlesToEmit = Math.ceil(controlParams.smokeEmissionRate * deltaTime); const positions = geometry.attributes.position; const velocities = geometry.attributes.velocity; const startTimes = geometry.attributes.startTime; const alphas = geometry.attributes.alpha; const sizes = geometry.attributes.size; let needsPosUpdate = false; let needsVelUpdate = false; let needsStartTimeUpdate = false; let needsAlphaUpdate = false; let needsSizeUpdate = false; for (let i = 0; i < particlesToEmit && i < MAX_SMOKE_PARTICLES; i++) { const index = currentSmokeIndex; const radius = controlParams.smokeEmissionRadius * Math.sqrt(Math.random()); const angle = Math.random() * Math.PI * 2; smokeParticlePosition.set( radius * Math.cos(angle), VOLCANO_CRATER_CENTER_Y.y + 1.0, radius * Math.sin(angle) ); positions.setXYZ(index, smokeParticlePosition.x, smokeParticlePosition.y, smokeParticlePosition.z); needsPosUpdate = true; smokeParticleVelocity.set( (Math.random() - 0.5) * controlParams.smokeVelocitySpread, controlParams.smokeBaseVelocityY * (0.8 + Math.random() * 0.4), (Math.random() - 0.5) * controlParams.smokeVelocitySpread ); velocities.setXYZ(index, smokeParticleVelocity.x, smokeParticleVelocity.y, smokeParticleVelocity.z); needsVelUpdate = true; startTimes.setX(index, currentTime); alphas.setX(index, 1.0); sizes.setX(index, 0.8 + Math.random() * 0.4); needsStartTimeUpdate = true; needsAlphaUpdate = true; needsSizeUpdate = true; currentSmokeIndex = (index + 1) % MAX_SMOKE_PARTICLES; } const lifetime = material.uniforms.uLifetime.value; const turbulence = controlParams.smokeTurbulence; for (let i = 0; i < MAX_SMOKE_PARTICLES; i++) { const startTime = startTimes.getX(i); if (startTime >= 0) { const age = currentTime - startTime; if (age > lifetime) { positions.setXYZ(i, OFF_SCREEN_POS.x, OFF_SCREEN_POS.y, OFF_SCREEN_POS.z); startTimes.setX(i, -1.0); alphas.setX(i, 0.0); needsPosUpdate = true; needsStartTimeUpdate = true; needsAlphaUpdate = true; } else { const lifeRatio = age / lifetime; alphas.setX(i, Math.max(0.0, 1.0 - lifeRatio * lifeRatio)); needsAlphaUpdate = true; if (turbulence > 0) { tempVector3.set( (Math.random() - 0.5) * turbulence * deltaTime * 50, (Math.random() - 0.5) * turbulence * deltaTime * 20, (Math.random() - 0.5) * turbulence * deltaTime * 50 ); velocities.setXYZ( i, velocities.getX(i) + tempVector3.x, velocities.getY(i) + tempVector3.y, velocities.getZ(i) + tempVector3.z ); needsVelUpdate = true; } } } } if (needsPosUpdate) positions.needsUpdate = true; if (needsVelUpdate) velocities.needsUpdate = true; if (needsStartTimeUpdate) startTimes.needsUpdate = true; if (needsAlphaUpdate) alphas.needsUpdate = true; if (needsSizeUpdate) sizes.needsUpdate = true; }

// --- Update Clouds Removed ---

// --- Update Engine Burn (Dual Nozzle & Local Space) ---
// (Function remains the same - uses local space logic)
function updateEngineBurn(deltaTime) { if (!engineBurnSystem || !particleTexture || !engineNozzleLeft || !engineNozzleRight || !aircraftModel) return; const currentTime = clock.getElapsedTime(); const material = engineBurnSystem.material; const geometry = engineBurnSystem.geometry; material.uniforms.uTime.value = currentTime; let particlesToEmit = 0; if (keys[' ']) { particlesToEmit = Math.ceil(controlParams.engineEmissionRate * deltaTime); } const positions = geometry.attributes.position; const velocities = geometry.attributes.velocity; const startTimes = geometry.attributes.startTime; const alphas = geometry.attributes.alpha; const sizes = geometry.attributes.size; let needsPosUpdate = false; let needsVelUpdate = false; let needsStartTimeUpdate = false; let needsAlphaUpdate = false; let needsSizeUpdate = false; if (particlesToEmit > 0) { for (let i = 0; i < particlesToEmit && i < MAX_ENGINE_PARTICLES; i++) { const index = currentEngineIndex; const emissionPosition = (i % 2 === 0) ? engineNozzleLeft.position : engineNozzleRight.position; positions.setXYZ(index, emissionPosition.x, emissionPosition.y, emissionPosition.z); needsPosUpdate = true; const speedFactor = 1.0 + (Math.random() - 0.5) * 0.2; engineParticleVelocity.set( (Math.random() - 0.5) * controlParams.engineVelocitySpread, (Math.random() - 0.5) * controlParams.engineVelocitySpread, controlParams.engineBaseVelocity * speedFactor ); velocities.setXYZ(index, engineParticleVelocity.x, engineParticleVelocity.y, engineParticleVelocity.z); needsVelUpdate = true; startTimes.setX(index, currentTime); alphas.setX(index, 1.0); sizes.setX(index, 0.8 + Math.random() * 0.4); needsStartTimeUpdate = true; needsAlphaUpdate = true; needsSizeUpdate = true; currentEngineIndex = (index + 1) % MAX_ENGINE_PARTICLES; } } const lifetime = material.uniforms.uLifetime.value; for (let i = 0; i < MAX_ENGINE_PARTICLES; i++) { const startTime = startTimes.getX(i); if (startTime >= 0) { const age = currentTime - startTime; if (age > lifetime) { positions.setXYZ(i, OFF_SCREEN_POS.x, OFF_SCREEN_POS.y, OFF_SCREEN_POS.z); startTimes.setX(i, -1.0); alphas.setX(i, 0.0); needsPosUpdate = true; needsStartTimeUpdate = true; needsAlphaUpdate = true; } else { const lifeRatio = age / lifetime; alphas.setX(i, Math.max(0.0, 1.0 - lifeRatio)); needsAlphaUpdate = true; } } } if (needsPosUpdate) positions.needsUpdate = true; if (needsVelUpdate) velocities.needsUpdate = true; if (needsStartTimeUpdate) startTimes.needsUpdate = true; if (needsAlphaUpdate) alphas.needsUpdate = true; if (needsSizeUpdate) sizes.needsUpdate = true; }

// --- Update Crash Explosion ---
// (Function remains the same)
function updateCrashExplosion(deltaTime) { if (!crashExplosionSystem || !particleTexture) return; const currentTime = clock.getElapsedTime(); const material = crashExplosionSystem.material; const geometry = crashExplosionSystem.geometry; material.uniforms.uTime.value = currentTime; const positions = geometry.attributes.position; const startTimes = geometry.attributes.startTime; const alphas = geometry.attributes.alpha; let needsPosUpdate = false; let needsAlphaUpdate = false; let needsStartTimeUpdate = false; const lifetime = material.uniforms.uLifetime.value; for (let i = 0; i < MAX_EXPLOSION_PARTICLES; i++) { const startTime = startTimes.getX(i); if (startTime >= 0) { const age = currentTime - startTime; if (age > lifetime) { positions.setXYZ(i, OFF_SCREEN_POS.x, OFF_SCREEN_POS.y, OFF_SCREEN_POS.z); startTimes.setX(i, -1.0); alphas.setX(i, 0.0); needsPosUpdate = true; needsStartTimeUpdate = true; needsAlphaUpdate = true; } else { const lifeRatio = age / lifetime; alphas.setX(i, Math.max(0.0, 1.0 - lifeRatio)); needsAlphaUpdate = true; } } } if (needsPosUpdate) positions.needsUpdate = true; if (needsAlphaUpdate) alphas.needsUpdate = true; if (needsStartTimeUpdate) startTimes.needsUpdate = true; }

// --- Trigger Crash Explosion ---
// (Function remains the same)
function triggerCrashExplosion(position) { if (!crashExplosionSystem || !particleTexture) return; console.log("--- Triggering Crash Explosion ---"); const currentTime = clock.getElapsedTime(); const geometry = crashExplosionSystem.geometry; const positions = geometry.attributes.position; const velocities = geometry.attributes.velocity; const startTimes = geometry.attributes.startTime; const alphas = geometry.attributes.alpha; const sizes = geometry.attributes.size; let needsPosUpdate = false; let needsVelUpdate = false; let needsStartTimeUpdate = false; let needsAlphaUpdate = false; let needsSizeUpdate = false; const count = Math.min(controlParams.explosionParticleCount, MAX_EXPLOSION_PARTICLES); for (let i = 0; i < count; i++) { const index = currentExplosionIndex; positions.setXYZ(index, position.x, position.y, position.z); needsPosUpdate = true; explosionParticleVelocity.set( Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5 ).normalize().multiplyScalar( controlParams.explosionBaseVelocity + (Math.random() - 0.5) * controlParams.explosionVelocitySpread ); velocities.setXYZ(index, explosionParticleVelocity.x, explosionParticleVelocity.y, explosionParticleVelocity.z); needsVelUpdate = true; startTimes.setX(index, currentTime); alphas.setX(index, 1.0); sizes.setX(index, 0.8 + Math.random() * 0.4); needsStartTimeUpdate = true; needsAlphaUpdate = true; needsSizeUpdate = true; currentExplosionIndex = (index + 1) % MAX_EXPLOSION_PARTICLES; } if (needsPosUpdate) positions.needsUpdate = true; if (needsVelUpdate) velocities.needsUpdate = true; if (needsStartTimeUpdate) startTimes.needsUpdate = true; if (needsAlphaUpdate) alphas.needsUpdate = true; if (needsSizeUpdate) sizes.needsUpdate = true; }


// --- Reset Simulation Function ---
// Resets position, velocity, rotation, and makes aircraft visible again.
function resetSimulation() {
    console.log("--- Resetting Aircraft Position & Physics ---");
    if (!aircraftModel) return;

    // Reset position and rotation
    aircraftModel.position.copy(INITIAL_AIRCRAFT_POS);
    aircraftModel.quaternion.copy(INITIAL_AIRCRAFT_QUAT);

    // Reset physics state
    playerVelocity.set(0, 0, 0);
    playerAngularVelocity.set(0, 0, 0);

    // *** Make aircraft visible again ***
    aircraftModel.visible = true;

    // Reset crash flag
    isCrashing = false;
    // Clear any pending reset timeout (safety check)
    if (crashResetTimeout) {
        clearTimeout(crashResetTimeout);
        crashResetTimeout = null;
    }
}


// --- Initialize Physics and SCENERY ---
function initPhysicsAndScenery() {
    console.log("INIT: Initializing physics and scenery...");
    if (typeof THREE === 'undefined') { console.error("INIT: Aborting - THREE undefined!"); return; }
    if (!aircraftModel) { console.error("INIT: Aborting - aircraftModel not loaded!"); return; }
    if (!actualModelMeshGroup) { console.error("INIT: Aborting - actualModelMeshGroup missing!"); return; }

    playerVelocity.set(0, 0, 0); playerAngularVelocity.set(0, 0, 0);
    isCrashing = false; // Ensure crash flag is reset on init
    if (crashResetTimeout) { // Clear any lingering timeout from previous runs
        clearTimeout(crashResetTimeout);
        crashResetTimeout = null;
    }
    aircraftModel.visible = true; // Ensure aircraft is visible on init


    createProceduralScenery(); // Creates terrain, water, trees, lava
    createSun(); // Create the visual sun

    // Set initial aircraft position AND store it for reset
    if (terrainMesh) { const startX = 0, startZ = TERRAIN_SIZE / 3; try { const terrainHeightAtStart = getProceduralTerrainHeight(startX, startZ); const startY = Math.max(terrainHeightAtStart, WATER_LEVEL) + 150; INITIAL_AIRCRAFT_POS.set(startX, startY, startZ); aircraftModel.position.copy(INITIAL_AIRCRAFT_POS); console.log(`Aircraft initial position set and stored: ${startX.toFixed(1)}, ${startY.toFixed(1)}, ${startZ.toFixed(1)}`); } catch(e) { console.error("Error getting terrain height for initial aircraft position. Using default.", e); INITIAL_AIRCRAFT_POS.set(startX, 200, startZ); aircraftModel.position.copy(INITIAL_AIRCRAFT_POS); }
    } else { console.error("INIT: Cannot set initial aircraft position accurately as terrain failed to create."); INITIAL_AIRCRAFT_POS.set(0, 200, TERRAIN_SIZE / 3); aircraftModel.position.copy(INITIAL_AIRCRAFT_POS); }
    // Initial rotation is stored after model load

    // Initialize particle systems if texture loaded
    if (particleTexture) {
        if (leftWingTip && rightWingTip) { createTrailSystems(); }
        else { console.error("INIT: Cannot create trail systems - wingtip helpers missing."); }

        createVolcanoSmokeSystem();
        // createCloudSystem(); // Clouds removed

        if (engineNozzleLeft && engineNozzleRight) { createEngineBurnSystem(); }
        else { console.error("INIT: Cannot create engine burn system - one or both nozzle helpers missing."); }

        createCrashExplosionSystem(); // Create the explosion system

    } else {
         console.warn("INIT: Particle texture missing, ALL effects disabled.");
    }

    console.log("INIT: Initialization complete. Starting animation loop...");
    animate();
}

// --- Animation Loop ---
function animate() {
    requestAnimationFrame(animate);
    const deltaTime = Math.min(clock.getDelta(), 0.1);
    let currentSpeed = 0; let currentAltitude = 0;

    // --- Update Effects FIRST (especially explosion) ---
    // This ensures the explosion fades even if the plane is 'frozen' before reset
    if (particleTexture) {
        updateTrails(deltaTime);
        updateVolcanoSmoke(deltaTime);
        // updateClouds(deltaTime); // Removed
        updateEngineBurn(deltaTime);
        updateCrashExplosion(deltaTime); // Update explosion particles
    }


    if (aircraftModel && typeof THREE !== 'undefined') { // Check aircraft exists before accessing it
        // --- Update Physics and Position only if NOT crashing ---
        if (!isCrashing) {
            try {
                // --- Physics (Rotation) ---
                let targetPitch=0, targetRoll=0, targetYaw=0; if (keys['w']) targetPitch = -controlParams.pitchRate; if (keys['s']) targetPitch = controlParams.pitchRate; if (keys['a']) targetRoll = controlParams.rollRate; if (keys['d']) targetRoll = -controlParams.rollRate;
                playerAngularVelocity.x += (targetPitch - playerAngularVelocity.x) * controlParams.angularAdjustFactor * deltaTime; playerAngularVelocity.y += (targetYaw - playerAngularVelocity.y) * controlParams.angularAdjustFactor * deltaTime; playerAngularVelocity.z += (targetRoll - playerAngularVelocity.z) * controlParams.angularAdjustFactor * deltaTime;
                const effectiveAngularDamping = Math.pow(controlParams.angularDamping, deltaTime * 60); playerAngularVelocity.multiplyScalar(effectiveAngularDamping);
                const deltaRot = playerAngularVelocity.clone().multiplyScalar(deltaTime); const qx = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), deltaRot.x); const qy = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), deltaRot.y); const qz = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), deltaRot.z);
                aircraftModel.quaternion.multiply(qy).multiply(qx).multiply(qz); if (aircraftModel.quaternion.lengthSq() > 1e-6) aircraftModel.quaternion.normalize();

                // --- Physics (Velocity/Position) ---
                let currentThrustForce = 0; if (keys[' ']) currentThrustForce = controlParams.thrustAcceleration * (keys['shift'] ? controlParams.afterburnerMultiplier : 1.0);
                forwardDirection.set(0, 0, -1).applyQuaternion(aircraftModel.quaternion).normalize(); accelerationVector.copy(forwardDirection).multiplyScalar(currentThrustForce * deltaTime); brakingVector.set(0, 0, 0); if (keys['b'] && playerVelocity.lengthSq() > 0.01) { if(playerVelocity.lengthSq() > 1e-6) brakingVector.copy(playerVelocity).normalize().multiplyScalar(-controlParams.brakeForce * deltaTime); }
                playerVelocity.add(accelerationVector); playerVelocity.add(brakingVector); const dragForce = playerVelocity.clone().multiplyScalar(-controlParams.linearDragFactor * deltaTime); playerVelocity.add(dragForce);
                const currentMaxSpeed = controlParams.maxSpeed * (keys['shift'] ? controlParams.afterburnerMultiplier : 1.0); if (playerVelocity.lengthSq() > currentMaxSpeed * currentMaxSpeed) { if(playerVelocity.lengthSq() > 1e-6) playerVelocity.normalize().multiplyScalar(currentMaxSpeed); }
                if (!keys[' '] && playerVelocity.lengthSq() < controlParams.minSpeed * controlParams.minSpeed) { playerVelocity.multiplyScalar(0.9); if(playerVelocity.lengthSq() < 0.01) playerVelocity.set(0,0,0); }
                aircraftModel.position.addScaledVector(playerVelocity, deltaTime);

                // --- World Boundary Check (Wrap Around) ---
                if (aircraftModel.position.x > WORLD_BOUNDARY) { aircraftModel.position.x = -WORLD_BOUNDARY + 1; }
                else if (aircraftModel.position.x < -WORLD_BOUNDARY) { aircraftModel.position.x = WORLD_BOUNDARY - 1; }
                if (aircraftModel.position.z > WORLD_BOUNDARY) { aircraftModel.position.z = -WORLD_BOUNDARY + 1; }
                else if (aircraftModel.position.z < -WORLD_BOUNDARY) { aircraftModel.position.z = WORLD_BOUNDARY - 1; }

                // --- Collision Detection & Crash Reset ---
                if (terrainMesh) {
                    try {
                        const terrainHeightColl = getProceduralTerrainHeight(aircraftModel.position.x, aircraftModel.position.z);
                        const effectiveGroundLevel = Math.max(terrainHeightColl, WATER_LEVEL);

                        if (aircraftModel.position.y < effectiveGroundLevel + AIRCRAFT_GROUND_BUFFER) {
                            // Check for crash velocity
                            if (playerVelocity.y < CRASH_VELOCITY_THRESHOLD) {
                                if (!isCrashing) { // Only trigger once per crash
                                    console.log("CRASH DETECTED!");
                                    isCrashing = true;
                                    triggerCrashExplosion(aircraftModel.position); // Trigger explosion immediately
                                    aircraftModel.visible = false; // Hide the aircraft model

                                    // Stop the plane instantly (redundant but safe)
                                    playerVelocity.set(0, 0, 0);
                                    playerAngularVelocity.set(0, 0, 0);

                                    // Schedule the reset after a delay
                                    if (crashResetTimeout) clearTimeout(crashResetTimeout); // Clear previous timeout if any
                                    crashResetTimeout = setTimeout(resetSimulation, CRASH_RESET_DELAY);
                                }
                                // Skip remaining updates for this frame after crash detected
                                // return; // Don't return here, let camera/HUD update
                            } else {
                                // Normal ground interaction (bounce/stop)
                                aircraftModel.position.y = effectiveGroundLevel + AIRCRAFT_GROUND_BUFFER;
                                if (playerVelocity.y < 0) {
                                    playerVelocity.y *= -0.2; // Small bounce
                                    playerVelocity.x *= 0.8;
                                    playerVelocity.z *= 0.8;
                                    playerAngularVelocity.multiplyScalar(0.5);
                                }
                            }
                        }
                    } catch(e) {
                        console.error("Collision detection error:", e);
                    }
                } // End Collision Check

            } catch (error) { console.error("Error during physics/position update:", error); }
        } // End if (!isCrashing)

        // --- HUD Calculations (Always update based on current state) ---
        currentSpeed = playerVelocity.length();
        if (terrainMesh) { try { const terrainHeight = getProceduralTerrainHeight(aircraftModel.position.x, aircraftModel.position.z); const groundLevel = Math.max(terrainHeight, WATER_LEVEL); currentAltitude = Math.max(0, aircraftModel.position.y - groundLevel); } catch (e) { currentAltitude = aircraftModel.position.y; } } else { currentAltitude = aircraftModel.position.y; }

        // --- Update Edge Fog (Always update) ---
        if (scene.fog instanceof THREE.Fog) {
            const distSq = aircraftModel.position.x * aircraftModel.position.x + aircraftModel.position.z * aircraftModel.position.z;
            const dist = Math.sqrt(distSq);
            let fogFactor = 0;
            if (dist > controlParams.edgeFogStartDistance) { fogFactor = THREE.MathUtils.smoothstep(dist, controlParams.edgeFogStartDistance, controlParams.edgeFogFullDistance); }
            scene.fog.near = THREE.MathUtils.lerp(controlParams.baseFogNear, controlParams.baseFogNear * controlParams.edgeFogNearFactor, fogFactor);
            scene.fog.far = THREE.MathUtils.lerp(controlParams.baseFogFar, controlParams.baseFogFar * controlParams.edgeFogFarFactor, fogFactor);
        }

        // --- Animate Volcano Light (Always update) ---
        if (volcanoLight) { volcanoLight.intensity = 2.5 + Math.sin(clock.elapsedTime * 2.5) * 1.0; volcanoLight.color.setHSL(0.03 + Math.sin(clock.elapsedTime * 0.6) * 0.03, 1, 0.55); }

        // --- Camera Follow (Always update) ---
        try {
            const relativeCameraOffset = new THREE.Vector3(0, 7, 20);
            const aircraftPosition = aircraftModel.position; // Use current position even if crashed
            const aircraftQuaternion = aircraftModel.quaternion; // Use current orientation
            const cameraOffset = relativeCameraOffset.clone().applyQuaternion(aircraftQuaternion);
            const targetCameraPosition = aircraftPosition.clone().add(cameraOffset);
            const lerpFactor = 1.0 - Math.pow(1.0 - controlParams.cameraSmoothness, deltaTime * 60);
            camera.position.lerp(targetCameraPosition, lerpFactor);
            camera.lookAt(aircraftPosition);
        } catch (error) { console.error("Error during camera update:", error); }

    } // End if(aircraftModel)

    // --- Update HUD (Always update) ---
    const speedElement = document.getElementById('speed-value');
    const altitudeElement = document.getElementById('altitude-value');
    if (speedElement) speedElement.textContent = currentSpeed.toFixed(1);
    if (altitudeElement) altitudeElement.textContent = currentAltitude.toFixed(1);


    // --- Render ---
    try { if (typeof THREE !== 'undefined' && renderer && scene && camera) { renderer.render(scene, camera); } else { console.error("RENDER: Skipping render! Missing core object."); } } catch (renderError) { console.error("ERROR DURING RENDER:", renderError); }

} // --- End function animate ---

// --- Start Asset Loading Process ---
console.log("Requesting asset loading...");

