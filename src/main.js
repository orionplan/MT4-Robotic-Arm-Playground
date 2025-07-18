import {
  Scene,
  PerspectiveCamera,
  WebGLRenderer,
  Color,
  DirectionalLight,
  AmbientLight,
  Box3,
  PCFSoftShadowMap,
  ACESFilmicToneMapping,
  CanvasTexture,
  Float32BufferAttribute,
  RepeatWrapping,
  PlaneGeometry,
  MeshPhysicalMaterial,
  Mesh,
  DoubleSide,
  LoadingManager,
  Quaternion,
  Euler,
  Vector3,
  HemisphereLight,
  MathUtils
} from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import URDFLoader from 'urdf-loader';
import robotConfigs from './robotConfig.js';
import { setupKeyboardControls, setupControlPanel } from './robotControls.js';
import { setupSliderButtonControls } from './uiControls.js';
const baseUrl = import.meta.env.BASE_URL;

// Select robot type from robotConfig.js
const robotType = 'mt4';
const config = robotConfigs[robotType];

let scene, camera, renderer, controls;
window.robot = null;
let keyboardUpdate;

// Used for objects requiring fixed world rotation or mimic logic
let fixedRotationObject = null;
let mimic_link1 = null;
let mimic_link4 = null;
let mimic_link5 = null;
let mimic_link0001 = null;
let mimic_link150 = null;

// Global quaternion caches for link world quaternions and their inverses
const q_link1 = new Quaternion();
const q_link2 = new Quaternion();
const q_link3 = new Quaternion();
const q_link4 = new Quaternion();
const q_inv_link1 = new Quaternion();
const q_inv_link2 = new Quaternion();
const q_inv_link3 = new Quaternion();
const _parentWorldQuaternion = new Quaternion();
const _targetWorldQuaternion = new Quaternion();

const _quatLevel5    = new Quaternion();
const _quatLevel3    = new Quaternion();
const _fixedOffset   = new Vector3(0, -0.3, 0);
const _parentWorldEuler = new Euler();

init();
animate();

function init() {
  // Initialize scene
  scene = new Scene();
  scene.background = new Color(0x2C2C2C);

  // Initialize camera
  camera = new PerspectiveCamera(
    config.viewConfig.camera.fov,
    window.innerWidth / window.innerHeight,
    0.1,
    60
  );
  camera.position.set(...config.viewConfig.camera.position);
  const [pitch, yaw, roll] = config.viewConfig.camera.rotation.map(deg => deg * Math.PI/180);
  camera.rotation.set(pitch, yaw, roll);

  // Initialize renderer
  renderer = new WebGLRenderer({ antialias: true });
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFSoftShadowMap;
  renderer.physicallyCorrectLights = true;
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.5;
  document.body.appendChild(renderer.domElement);

  // Setup lights
  // 1. Key directional light (main light)
  const keyLight = new DirectionalLight(0xffffff, 1.2);
  keyLight.position.set(10, 15, 10);
  keyLight.castShadow = true;
  scene.add(keyLight);

  // 2. Fill light (side/back)
  const fillLight = new DirectionalLight(0xffffff, 0.6);
  fillLight.position.set(-10, 10, 10);
  scene.add(fillLight);

  // 3. Back light (rim)
  const backLight = new DirectionalLight(0xffffff, 0.4);
  backLight.position.set(0, -10, -10);
  scene.add(backLight);

  // 4. Ambient light (overall base)
  const ambientLight = new AmbientLight(0xffffff, 0.7);
  scene.add(ambientLight);

  // 5. Hemisphere light (sky/ground)
  const hemiLight = new HemisphereLight(0xffffff, 0x444444, 0.5);
  hemiLight.position.set(0, 20, 0);
  scene.add(hemiLight);
  keyLight.intensity = 3.0;
  fillLight.intensity = 3.2;
  backLight.intensity = 1.0;
  ambientLight.intensity = 1.0;
  hemiLight.intensity = 0.8;

  // Setup ground plane
  const groundMat = new MeshPhysicalMaterial({
    color: 0x808080,
    metalness: 0.7,
    roughness: 0.3,
    reflectivity: 0.5,
    clearcoat: 0.3,
    side: DoubleSide,
    transparent: true,
    opacity: 0.7,
  });
  const gridSize = 1, divisions = 1, gridScale = 0.1;
  const geo = new PlaneGeometry(gridSize, gridSize, divisions, divisions);
  const pos = geo.getAttribute('position');
  const uvs = [];
  for (let i = 0; i < pos.count; i++) {
    uvs.push(pos.getX(i) * gridScale, pos.getY(i) * gridScale);
  }
  geo.setAttribute('uv', new Float32BufferAttribute(uvs, 2));
  groundMat.map = createGridTexture();
  groundMat.roughnessMap = createGridTexture();
  const ground = new Mesh(geo, groundMat);
  ground.rotation.x = -Math.PI/2;
  ground.receiveShadow = true;
  scene.add(ground);

  // Initialize orbit controls
  controls = new OrbitControls(camera, renderer.domElement);
  controls.minDistance = config.viewConfig.minDistance;
  controls.maxDistance = config.viewConfig.maxDistance;
  controls.update();

  // Load URDF robot
  loadRobot();

  // Handle window resize
  window.addEventListener('resize', onResize);
  onResize();

  // Setup control panel
  setupControlPanel();
}

function loadRobot() {
  const manager = new LoadingManager();
  const loader = new URDFLoader(manager);
  // Load URDF robot file and attach to scene
  loader.load(baseUrl + 'URDF/robot.urdf', robot => {
    window.robot = robot;
  });

  manager.onLoad = () => {
    // Set up robot in scene and attach STL meshes
    window.robot.traverse(c => c.castShadow = true);
    window.robot.rotation.x = -Math.PI/2;
    window.robot.rotation.z = -Math.PI;
    window.robot.scale.set(1, 1, 1);
    scene.add(window.robot);

    // Attach STL meshes to robot links
    loadAndAttachSTL(window.robot, 'base_link', baseUrl + 'URDF/meshes/base_link_modified.stl', {
      color: 0x888888,
      pos: [0,0,0],
      rot: [Math.PI/2,0,0]
    });
    loadAndAttachSTL(window.robot, 'link1', baseUrl + 'URDF/meshes/Link1_modified.stl', {
      color: 0x888888,
      pos: [0,0,0],
      rot: [0,0,0]
    });
    loadAndAttachSTL(window.robot, 'link2', baseUrl + 'URDF/meshes/Link2_modified.stl', {
      color: 0xff9900,
      pos: [0,0,0],
      rot: [0,0,0]
    });
    loadAndAttachSTL(window.robot, 'link3', baseUrl + 'URDF/meshes/Link3_modified.stl', {
      color: 0xff9900,
      pos: [-0.15,0,0],
      rot: [0,0,0]
    });
    loadAndAttachSTL(window.robot, 'link4', baseUrl + 'URDF/meshes/Link4_modified.stl', {
      color: 0xff9900,
      pos: [0,0,0],
      rot: [0,0,0],
      onMeshLoaded: mesh => {
        fixedRotationObject = {
          mesh,
          targetWorldEuler: new Euler(0,0,0,'XYZ'),
          initialRotation: mesh.rotation.clone()
        };
      }
    });
    loadAndAttachSTL(window.robot, 'link2_mimic', baseUrl + 'URDF/meshes/0001-01 L130_modified.stl', {
      color: 0xff9900,
      pos: [0,0.0135,0],
      rot: [Math.PI/2,0,Math.PI/2],
      onMeshLoaded: mesh => {
        mimic_link1 = {
          mesh,
          targetWorldEuler: new Euler(0,0,0,'XYZ'),
          initialRotation: mesh.rotation.clone()
        };
      }
    });
    loadAndAttachSTL(window.robot, 'link2', baseUrl + 'URDF/meshes/0400_modified.stl', {
      color: 0xffdddd,
      pos: [0,0,-0.007],
      rot: [0,Math.PI,0],
      onMeshLoaded: mesh => {
        mimic_link4 = {
          mesh,
          targetWorldEuler: new Euler(0,0,0,'XYZ'),
          initialRotation: mesh.rotation.clone()
        };
      }
    });
    loadAndAttachSTL(window.robot, 'link1', baseUrl + 'URDF/meshes/0001-01_modified.stl', {
      color: 0xffdddd,
      pos: [0.018,0.094,0.032],
      rot: [0,0,Math.PI/2],
      onMeshLoaded: mesh => {
        mimic_link0001 = {
          mesh,
          targetWorldEuler: new Euler(0,0,0,'XYZ'),
          initialRotation: mesh.rotation.clone()
        };
      }
    });
    loadAndAttachSTL(window.robot, 'link2', baseUrl + 'URDF/meshes/0500-01_modified.stl', {
      color: 0xffdddd,
      pos: [0,0.13,0.015],
      rot: [0,0,0],
      onMeshLoaded: mesh => {
        mimic_link5 = {
          mesh,
          targetWorldEuler: new Euler(0,0,0,'XYZ'),
          initialRotation: mesh.rotation.clone()
        };
      }
    });
    loadAndAttachSTL(window.robot, 'link2', baseUrl + 'URDF/meshes/0001-01 L150_modified.stl', {
      color: 0xffdddd,
      pos: [ - Math.sin(40) * 0.032,-0.01, 0.13+ Math.cos(40) * 0.032],
      rot: [0, 0, 0],
      onMeshLoaded: mesh => {
        mimic_link150 = {
          mesh,
          targetWorldEuler: new Euler(0,0,0,'XYZ'),
          initialRotation: mesh.rotation.clone()
        };
      }
    });
    // Setup keyboard controls
    keyboardUpdate = setupKeyboardControls(window.robot);
    setupSliderButtonControls(window.robot);
  };
}
/**
 * Load and attach STL mesh to specified robot link.
 * @param {Object3D} robot - URDF robot object
 * @param {string} linkName - Target link name
 * @param {string} stlPath - Path to STL file
 * @param {Object} [opts] - Optional parameters
 * @param {number} [opts.color] - Mesh color
 * @param {Array} [opts.pos] - Position offset
 * @param {Array} [opts.rot] - Rotation (Euler angles)
 * @param {Function} opts.onMeshLoaded - Callback invoked with mesh after load
 */
function loadAndAttachSTL(robot, linkName, stlPath, {
  color = 0xff9900,
  pos   = [0,0,0],
  rot   = [0,0,0],
  onMeshLoaded
} = {}) {
  const loader = new STLLoader();
  loader.load(
    stlPath,
    geometry => {
      const material = new MeshPhysicalMaterial({ color, metalness: 0.8, roughness: 0.2 });
      const mesh = new Mesh(geometry, material);
      mesh.scale.set(0.001, 0.001, 0.001);
      mesh.position.set(...pos);
      mesh.rotation.set(...rot);
      mesh.castShadow = true;
      mesh.receiveShadow = true;

      const targetLink = robot.links[linkName];
      if (!targetLink) {
        console.error(`Link '${linkName}' not found`);
        return;
      }
      targetLink.add(mesh);

      // Invoke callback to return loaded mesh if provided
      if (typeof onMeshLoaded === 'function') {
        onMeshLoaded(mesh);
      }
    },
    undefined,
    err => console.error(`Failed to load STL:`, err)
  );
}

function animate() {
  requestAnimationFrame(animate);

  if (window.isChatInputActive !== true) {
    keyboardUpdate && keyboardUpdate();
  }

  // --------------------------
  // Mimic link logic and relative quaternion transforms
  // --------------------------

  // Obtain link world quaternions and their inverses
  const link1Node = window.robot?.links['link1'];
  const link2Node = window.robot?.links['link2'];
  const link3Node = window.robot?.links['link3'];
  const link4Node = window.robot?.links['link4'];
  if (link1Node) link1Node.getWorldQuaternion(q_link1);
  if (link2Node) link2Node.getWorldQuaternion(q_link2);
  if (link3Node) link3Node.getWorldQuaternion(q_link3);
  if (link1Node) q_inv_link1.copy(q_link1).invert();
  if (link2Node) q_inv_link2.copy(q_link2).invert();
  if (link3Node) q_inv_link3.copy(q_link3).invert();

  /* Mimic logic for link1 (relative quaternion, rotation offset, local rotation) */
  if (mimic_link1) {
    const mesh = mimic_link1.mesh;
    const rotOffsetQuat = new Quaternion().setFromEuler(new Euler(0, 0, -Math.PI / 2, 'XYZ'));
    if (link2Node && link3Node) {
      mesh.quaternion
        .copy(q_link3.clone().invert())
        .multiply(q_link2)
        .multiply(rotOffsetQuat);
    } else {
      console.warn('link2 or link3 not found in robot.links');
    }
  }

  /* Mimic logic for link4 (relative quaternion, rotation offset, local rotation) */
  if (mimic_link4) {
    const mesh = mimic_link4.mesh;
    const rotOffsetQuat = new Quaternion().setFromEuler(new Euler(-Math.PI / 2, 0, Math.PI, 'XYZ'));
    if (link2Node && link3Node) {
      // local rotation = inv(link2 world) * link3 world * rotation offset
      const localQuat = q_inv_link2.clone().multiply(q_link3).multiply(rotOffsetQuat);
      mesh.quaternion.copy(localQuat);
    } else {
      console.warn('link2 or link3 not found in robot.links');
    }
  }

  /* Mimic logic for link0001 (relative quaternion, rotation offset, local rotation) */
  if (mimic_link0001) {
    const mesh = mimic_link0001.mesh;
    const rotOffsetQuat = new Quaternion().setFromEuler(new Euler(0, 0, Math.PI / 2, 'XYZ'));
    if (link2Node && link1Node) {
      // local rotation = inv(link1 world) * link2 world * rotation offset
      const localQuat = q_inv_link1.clone().multiply(q_link2).multiply(rotOffsetQuat);
      mesh.quaternion.copy(localQuat);
    } else {
      console.warn('link1 or link2 not found in robot.links');
    }
  }

  /* Mimic logic for link5 (relative quaternion, rotation offset, local rotation) */
  if (mimic_link5) {
    const mesh = mimic_link5.mesh;
    const rotOffsetQuat = new Quaternion().setFromEuler(new Euler(0, 0, 0, 'XYZ'));
    if (link1Node && link2Node) {
      // relative quaternion = inv(link2 world) * link1 world
      const relativeQuat = q_inv_link2.clone().multiply(q_link1);
      mesh.quaternion.copy(relativeQuat).multiply(rotOffsetQuat);
    } else {
      console.warn('link1 or link2 not found');
    }
  }

  /* Mimic logic for link150 (relative quaternion, position and local rotation) */
  if (mimic_link150 && link1Node && link2Node && link3Node) {
    const mesh150 = mimic_link150.mesh;
    // Relative rotation from link1 to link2
    const relQ = q_inv_link1.clone().multiply(q_link2);
    // Extract z-axis angle from quaternion (assuming planar rotation)
    const angle = 2 * Math.atan2(relQ.z, relQ.w);
    // Base angle for link150 offset (40 degrees in radians)
    const baseAngRad = Math.PI / 180 * 40;
    const totalAng = baseAngRad - angle;
    const cosA = Math.cos(totalAng), sinA = Math.sin(totalAng);
    // Update position in link2 frame
    link150Offset.set(
      cosA * 0.032,
      0.13 + sinA * 0.032,
      0.018
    );
    mesh150.position.copy(link150Offset);
    // Local rotation: align with link3 in link2 frame, with X/Y axis offsets
    const rel = q_inv_link2.clone().multiply(q_link3);
    mesh150.quaternion
      .copy(rel)
      .multiply(_quatLevel3.setFromAxisAngle(new Vector3(1, 0, 0), Math.PI / 2))
      .multiply(_quatLevel5.setFromAxisAngle(new Vector3(0, 0, 1), Math.PI));
  } else if (mimic_link150) {
    console.warn('link1, link2 or link3 not found');
  }

  /* Fixed world rotation for mesh attached to link4 (using relative quaternion math) */
  if (fixedRotationObject && fixedRotationObject.mesh.parent && link4Node) {
    const { mesh, targetWorldEuler } = fixedRotationObject;
    // 1. Get parent (link4) world quaternion
    link4Node.getWorldQuaternion(_parentWorldQuaternion);
    // 2. Extract yaw from parent quaternion
    const _tempEuler = new Euler().setFromQuaternion(_parentWorldQuaternion, 'YXZ');
    const yaw = _tempEuler.y;
    // 3. Yaw-only quaternion
    const yawQuat = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), yaw);
    // 4. Cache initial pitch/roll quaternion
    if (!fixedRotationObject.initialQuat) {
      fixedRotationObject.initialQuat = new Quaternion().setFromEuler(targetWorldEuler);
    }
    // 5. Target world quaternion = yaw * initial pitch/roll
    _targetWorldQuaternion.copy(yawQuat).multiply(fixedRotationObject.initialQuat);
    // 6. Convert to local: local = inv(parent world) * target world
    const parentInv = _parentWorldQuaternion.clone().invert();
    mesh.quaternion.copy(parentInv.multiply(_targetWorldQuaternion));
  }

  renderer.render(scene, camera);
}

function onResize() {
  renderer.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
}

function createGridTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 512;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#808080';
  ctx.fillRect(0, 0, 512, 512);
  ctx.strokeStyle = '#606060';
  ctx.lineWidth = 1;
  const cell = 32;
  for (let i = 0; i <= 512; i += cell) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i, 512);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, i);
    ctx.lineTo(512, i);
    ctx.stroke();
  }
  const tex = new CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = RepeatWrapping;
  tex.repeat.set(10, 10);
  return tex;
}

// For link150 mimic, reuse this offset vector (avoid new Vector3() every frame)
const link150Offset = new Vector3();

// Help panel toggle
const helpHeader = document.getElementById('help-header');
if (helpHeader) {
  helpHeader.addEventListener('click', () => {
    document.getElementById('help-overlay').classList.toggle('collapsed');
  });
}