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

const baseUrl = import.meta.env.BASE_URL;

const robotType = 'mt4';
const config = robotConfigs[robotType];

let scene, camera, renderer, controls;
window.robot = null;
let keyboardUpdate;

let fixedRotationObject = null;
let mimic_link1 = null;
let mimic_link2 = null;
let mimic_link4 = null;
let mimic_link5 = null;
let mimic_link0001 = null;
let mimic_link150 = null;


// --- Global quaternion caches for link world quaternions and their inverses
const q_link1 = new Quaternion();
const q_link2 = new Quaternion();
const q_link3 = new Quaternion();
const q_link4 = new Quaternion();
const q_inv_link1 = new Quaternion();
const q_inv_link2 = new Quaternion();
const q_inv_link3 = new Quaternion();
const _parentWorldQuaternion = new Quaternion();
const _targetWorldQuaternion = new Quaternion();

const _offsetLocal   = new Vector3();
const _worldOffset   = new Vector3();
const _quatLevel5    = new Quaternion();
const _quatLevel3    = new Quaternion();
const _posLevel3     = new Vector3();
const _fixedOffset   = new Vector3(0, -0.3, 0);
// --- Temporary vectors/quaternions for link transforms
const _parent2Pos   = new Vector3();
const _parent2Quat  = new Quaternion();
const _rotOffset150 = new Quaternion(); // for any local rotation offset
// 新增一个欧拉角辅助变量，用于分解旋转
const _parentWorldEuler = new Euler();

init();
animate();

function init() {
  // —— 场景
  scene = new Scene();
  scene.background = new Color(0x2C2C2C);

  // —— 相机
  camera = new PerspectiveCamera(
    config.viewConfig.camera.fov,
    window.innerWidth / window.innerHeight,
    0.1,
    60
  );
  camera.position.set(...config.viewConfig.camera.position);
  // 如果需要根据 rotation 调整朝向，这里可以解开注释
  const [pitch, yaw, roll] = config.viewConfig.camera.rotation.map(deg => deg * Math.PI/180);
  camera.rotation.set(pitch, yaw, roll);

  // —— 渲染器
  renderer = new WebGLRenderer({ antialias: true });
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFSoftShadowMap;
  renderer.physicallyCorrectLights = true;
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.5;
  document.body.appendChild(renderer.domElement);

  // —— 灯光
  // 1. 主方向光（主光源）
const keyLight = new DirectionalLight(0xffffff, 1.2);
keyLight.position.set(10, 15, 10);
keyLight.castShadow = true;
scene.add(keyLight);

// 2. 填充光（从侧后方打光，减少阴影）
const fillLight = new DirectionalLight(0xffffff, 0.6);
fillLight.position.set(-10, 10, 10);
scene.add(fillLight);

// 3. 背光（让物体边缘更立体）
const backLight = new DirectionalLight(0xffffff, 0.4);
backLight.position.set(0, -10, -10);
scene.add(backLight);

// 4. 环境光（增加整体亮度底色）
const ambientLight = new AmbientLight(0xffffff, 0.7);
scene.add(ambientLight);

// 5. 可选：天空光（更自然的蓝-地面黄环境）
const hemiLight = new HemisphereLight(0xffffff, 0x444444, 0.5);
hemiLight.position.set(0, 20, 0);
scene.add(hemiLight);
keyLight.intensity = 3.0;
fillLight.intensity = 3.2;
backLight.intensity = 1.0;
ambientLight.intensity = 1.0;
hemiLight.intensity = 0.8;
  // —— 地面
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

  // —— 交互控制
  controls = new OrbitControls(camera, renderer.domElement);
  controls.minDistance = config.viewConfig.minDistance;
  controls.maxDistance = config.viewConfig.maxDistance;
  controls.update();

  // —— 加载 URDF
  loadRobot();

  // —— 窗口自适应
  window.addEventListener('resize', onResize);
  onResize();

  // —— 控制面板
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
    const box = new Box3().setFromObject(window.robot);
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
    // Keyboard controls
    keyboardUpdate = setupKeyboardControls(window.robot);
  };
}
/**
 * 加载并附加 STL，然后回调 mesh 给调用者
 * @param {Object3D} robot      - URDFLoader 解析出来的机器人对象
 * @param {string}  linkName   - 要挂到机器人哪一节 link
 * @param {string}  stlPath    - public 目录下的 STL 路径
 * @param {Object}  [opts]     - 可选参数
 * @param {number}  [opts.color]
 * @param {Array}   [opts.pos]
 * @param {Array}   [opts.rot]
 * @param {Function} opts.onMeshLoaded  - 加载完 mesh 后调用，把 mesh 传给你
 */
function loadAndAttachSTL(robot, linkName, stlPath, {
  color = 0xff9900,
  pos   = [0,0,0],
  rot   = [0,0,0],
  onMeshLoaded
} = {}) {
  const loader = new STLLoader();
  loader.load(stlPath, geometry => {
    const material = new MeshPhysicalMaterial({ color, metalness:0.8, roughness:0.2 });
    const mesh = new Mesh(geometry, material);
    mesh.scale.set(0.001,0.001,0.001);
    mesh.position.set(...pos);
    mesh.rotation.set(...rot);
    mesh.castShadow = true;
    mesh.receiveShadow = true;

    const targetLink = robot.links[linkName];
    if (!targetLink) {
      console.error(`未找到 link '${linkName}'`);
      return;
    }
    targetLink.add(mesh);

    // 只要回调mesh，由调用者决定把它存到哪里
    if (typeof onMeshLoaded === 'function') {
      onMeshLoaded(mesh);
    }
  },
  undefined,
  err => console.error(`加载 STL 失败:`, err));
}

function animate() {
  requestAnimationFrame(animate);

  if (window.isChatInputActive !== true) {
    keyboardUpdate && keyboardUpdate();
  }

  // --- Unified extraction of world quaternions for links ---
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
  if (mimic_link1) {
    const mesh = mimic_link1.mesh;
    // Compute mesh local rotation to align with link3 in link2's frame, with an offset
    const rotOffsetQuat = new Quaternion().setFromEuler(new Euler(0, 0, -Math.PI / 2, 'XYZ'));
    if (link2Node && link3Node) {
      mesh.quaternion
        .copy(q_link3.clone().invert())
        .multiply(q_link2)
        .multiply(rotOffsetQuat);
    } else {
      console.warn('robot.links 中不存在 link2');
    }
  }

  if (mimic_link4) {
    const mesh = mimic_link4.mesh;
    // Compute mesh local rotation to align with link3 in link2's frame, with an offset
    const rotOffsetQuat = new Quaternion().setFromEuler(new Euler(-Math.PI / 2, 0, Math.PI, 'XYZ'));
    if (link2Node && link3Node) {
      // localQuat = inv(link2World) * link3World * rotOffsetQuat
      const localQuat = q_inv_link2.clone().multiply(q_link3).multiply(rotOffsetQuat);
      mesh.quaternion.copy(localQuat);
    } else {
      console.warn('robot.links 中不存在 link2 或 link3');
    }
  }

  if (mimic_link0001) {
    const mesh = mimic_link0001.mesh;
    // Compute mesh local rotation to align with link2 in link1's frame, with an offset
    const rotOffsetQuat = new Quaternion().setFromEuler(new Euler(0, 0, Math.PI / 2, 'XYZ'));
    if (link2Node && link1Node) {
      // localQuat = inv(link1World) * link2World * rotOffsetQuat
      const localQuat = q_inv_link1.clone().multiply(q_link2).multiply(rotOffsetQuat);
      mesh.quaternion.copy(localQuat);
    } else {
      console.warn('robot.links 中不存在 link1 或 link2');
    }
  }

  if (mimic_link5) {
    const mesh = mimic_link5.mesh;
    // Compute mesh local rotation to align with link2 in link1's frame, with an offset
    const rotOffsetQuat = new Quaternion().setFromEuler(new Euler(0, 0, 0, 'XYZ'));
    if (link1Node && link2Node) {
      // relativeQuat = inv(link2World) * link1World
      const relativeQuat = q_inv_link2.clone().multiply(q_link1);
      mesh.quaternion.copy(relativeQuat).multiply(rotOffsetQuat);
    } else {
      console.warn('link1 或 link2 不存在');
    }
  }
  // --- link150 mimic logic: Google style, improved efficiency and clarity ---
  // Reuse link150Offset for per-frame position, avoid new Vector3()
  if (mimic_link150 && link1Node && link2Node && link3Node) {
    const mesh150 = mimic_link150.mesh;
    // Relative rotation from link1 to link2 (cached inverse)
    const relQ = q_inv_link1.clone().multiply(q_link2);
    // Extract z-axis angle from quaternion (assuming planar rotation)
    const angle = 2 * Math.atan2(relQ.z, relQ.w);
    // Base angle for link150 offset (40 deg in radians)
    const baseAngRad = Math.PI / 180 * 40;
    const totalAng = baseAngRad - angle;
    // Precompute cos/sin for offset
    const cosA = Math.cos(totalAng), sinA = Math.sin(totalAng);
    // Update link150 position in link2 frame (reuse global object)
    link150Offset.set(
      cosA * 0.032,
      0.13 + sinA * 0.032,
      0.018
    );
    mesh150.position.copy(link150Offset);
    // Mesh local rotation: align with link3 in link2's frame, fixed X/Y axis offsets
    const rel = q_inv_link2.clone().multiply(q_link3);
    mesh150.quaternion
      .copy(rel)
      .multiply(_quatLevel3.setFromAxisAngle(new Vector3(1, 0, 0), Math.PI / 2))
      .multiply(_quatLevel5.setFromAxisAngle(new Vector3(0, 0, 1), Math.PI));
  } else if (mimic_link150) {
    console.warn('link1、link2 或 link3 不存在');
  }

  // Fixed world rotation for mesh attached to link4, using quaternion math
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
    // 6. Convert world quaternion to local: local = inv(parentWorld) * targetWorld
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