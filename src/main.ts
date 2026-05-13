import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

import type { Scene } from './scenes/Scene';
import { ThreeBodyScene } from './scenes/ThreeBody';
import { LagrangeScene } from './scenes/Lagrange';
import { RocheScene } from './scenes/Roche';
import { AccretionScene } from './scenes/Accretion';

type SceneKey = 'threebody' | 'lagrange' | 'roche' | 'accretion';

const factories: Record<SceneKey, () => Scene> = {
  threebody: () => new ThreeBodyScene(),
  lagrange: () => new LagrangeScene(),
  roche: () => new RocheScene(),
  accretion: () => new AccretionScene(),
};

const cameraSetup: Record<SceneKey, { pos: [number, number, number]; look: [number, number, number]; bloom: number }> = {
  threebody: { pos: [0, 2.5, 4.5], look: [0, 0, 0], bloom: 0.8 },
  lagrange:  { pos: [0, 2.8, 2.4], look: [0, 0, 0], bloom: 0.7 },
  roche:     { pos: [3, 4, 8], look: [0, 0, 0], bloom: 0.9 },
  accretion: { pos: [9, 3.5, 12], look: [0, 0, 0], bloom: 1.4 },
};

// ============ 渲染器 ============
const canvas = document.getElementById('stage') as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setClearColor(0x02050a, 1);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;

const camera = new THREE.PerspectiveCamera(58, window.innerWidth / window.innerHeight, 0.01, 1000);

// ============ OrbitControls ============
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.minDistance = 0.4;
controls.maxDistance = 120;
controls.zoomSpeed = 1.1;
controls.rotateSpeed = 0.7;
controls.panSpeed = 0.8;

// ============ Scene + Composer ============
let scene: THREE.Scene = new THREE.Scene();
let activeScene: Scene | null = null;
let activeKey: SceneKey = 'threebody';

const composer = new EffectComposer(renderer);
const renderPass = new RenderPass(scene, camera);
composer.addPass(renderPass);
const bloomPass = new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight),
  1.1, 0.7, 0.0,
);
composer.addPass(bloomPass);
const outputPass = new OutputPass();
composer.addPass(outputPass);

window.addEventListener('resize', () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
});

// ============ 切换场景 ============
function setScene(key: SceneKey): void {
  if (activeScene) {
    scene.remove(activeScene.root);
    activeScene.dispose();
  }
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x02050a);
  scene.fog = new THREE.FogExp2(0x02050a, key === 'accretion' ? 0.0 : 0.012);

  const s = factories[key]();
  s.init();
  scene.add(s.root);
  activeScene = s;
  activeKey = key;

  renderPass.scene = scene;

  // 相机预设
  const cam = cameraSetup[key];
  camera.position.set(...cam.pos);
  controls.target.set(...cam.look);
  controls.update();
  bloomPass.strength = cam.bloom * bloomMul;

  // 更新 UI 文本
  document.getElementById('info-title')!.textContent = s.title;
  document.getElementById('info-body')!.textContent = s.description;
  document.getElementById('info-formula')!.innerHTML = s.formula ?? '—';
  const sceneIndex = (['threebody', 'lagrange', 'roche', 'accretion'] as const).indexOf(key) + 1;
  document.querySelector('.panel-id')!.textContent = `SCENE_0x0${sceneIndex}`;

  // 参数列表
  const paramListEl = document.getElementById('param-list')!;
  paramListEl.innerHTML = '';
  for (const [k, v] of s.params ?? []) {
    const kEl = document.createElement('span');
    kEl.className = 'pk';
    kEl.textContent = k;
    const vEl = document.createElement('span');
    vEl.className = 'pv';
    vEl.textContent = v;
    paramListEl.append(kEl, vEl);
  }

  // 高亮 tab
  document.querySelectorAll('.tab').forEach((b) => {
    b.classList.toggle('active', (b as HTMLElement).dataset.scene === key);
  });
}

document.querySelectorAll<HTMLButtonElement>('.tab').forEach((btn) => {
  btn.addEventListener('click', () => {
    const k = btn.dataset.scene as SceneKey;
    if (k && k !== activeKey) setScene(k);
  });
});

// 键盘 1-4
window.addEventListener('keydown', (e) => {
  const map: Record<string, SceneKey> = { '1': 'threebody', '2': 'lagrange', '3': 'roche', '4': 'accretion' };
  if (map[e.key]) {
    if (map[e.key] !== activeKey) setScene(map[e.key]);
  } else if (e.code === 'Space') {
    e.preventDefault();
    togglePause();
  }
});

// ============ 参数控制 ============
let timeScale = 1.0;
let bloomMul = 1.0;
let paused = false;

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

$<HTMLInputElement>('ctrl-timescale').addEventListener('input', (e) => {
  timeScale = parseFloat((e.target as HTMLInputElement).value);
  $('val-timescale').textContent = timeScale.toFixed(2) + '×';
});
$<HTMLInputElement>('ctrl-bloom').addEventListener('input', (e) => {
  bloomMul = parseFloat((e.target as HTMLInputElement).value);
  $('val-bloom').textContent = bloomMul.toFixed(2);
  bloomPass.strength = cameraSetup[activeKey].bloom * bloomMul;
});
$<HTMLInputElement>('ctrl-exposure').addEventListener('input', (e) => {
  const v = parseFloat((e.target as HTMLInputElement).value);
  renderer.toneMappingExposure = v;
  $('val-exposure').textContent = v.toFixed(2);
});

function togglePause(): void {
  paused = !paused;
  const btn = $<HTMLButtonElement>('btn-pause');
  btn.textContent = paused ? '▶ 继续' : '⏸ 暂停';
  btn.classList.toggle('on', paused);
}
$('btn-pause').addEventListener('click', togglePause);
$('btn-reset').addEventListener('click', () => setScene(activeKey));
$('btn-screenshot').addEventListener('click', () => {
  renderer.render(scene, camera);
  composer.render();
  canvas.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `astro-${activeKey}-${Date.now()}.png`;
    a.click();
    URL.revokeObjectURL(url);
  });
});

// ============ 启动加载 ============
const bootOverlay = $<HTMLDivElement>('boot-overlay');
const bootLog = $<HTMLDivElement>('boot-log');
const bootLines = [
  '[ 0.00 ] 启动天体物理仿真终端…',
  '[ 0.32 ] 加载 WebGL 上下文…OK',
  '[ 0.61 ] 装载 Three.js 渲染管线…OK',
  '[ 0.94 ] 编译 Schwarzschild 测地线 shader…OK',
  '[ 1.22 ] 初始化 4 个仿真场景…OK',
  '[ 1.55 ] 准备就绪',
];
let bootIdx = 0;
const bootTick = setInterval(() => {
  bootIdx++;
  if (bootIdx >= bootLines.length) {
    clearInterval(bootTick);
    setTimeout(() => bootOverlay.classList.add('gone'), 220);
    return;
  }
  bootLog.textContent = bootLines[bootIdx];
}, 260);

// ============ 主循环 ============
const telFps = document.querySelector('[data-tm="fps"]')!;
const telTime = document.querySelector('[data-tm="time"]')!;
const telBodies = document.querySelector('[data-tm="bodies"]')!;
const telEnergy = document.querySelector('[data-tm="energy"]')!;
const telDt = document.querySelector('[data-tm="dt"]')!;
const telDist = document.querySelector('[data-tm="dist"]')!;
const loadBar = $<HTMLDivElement>('load-bar');
const utcClock = $<HTMLDivElement>('utc-clock');
const compassNeedle = document.getElementById('compass-needle')!;

let simTime = 0;
let lastT = performance.now();
let fpsAcc = 0;
let fpsCount = 0;
let lastUiUpdate = lastT;

setScene('threebody');

function loop(now: number): void {
  requestAnimationFrame(loop);
  const realDt = Math.min((now - lastT) / 1000, 0.05);
  lastT = now;
  const dt = paused ? 0 : realDt * timeScale;
  simTime += dt;

  if (activeScene) {
    activeScene.update(dt);
    activeScene.onCameraMove?.(camera.position);
  }

  controls.update();
  composer.render();

  // 罗盘指北针根据相机方位角旋转
  const az = Math.atan2(camera.position.x, camera.position.z);
  compassNeedle.setAttribute('transform', `rotate(${(-az * 180) / Math.PI})`);

  fpsAcc += 1 / Math.max(realDt, 1e-6);
  fpsCount++;
  if (now - lastUiUpdate > 220) {
    const fps = fpsAcc / fpsCount;
    telFps.textContent = fps.toFixed(0);
    telTime.textContent = simTime.toFixed(2);
    telDt.textContent = (realDt * 1000).toFixed(1);
    telDist.textContent = camera.position.length().toFixed(2);
    if (activeScene) {
      telBodies.textContent = activeScene.bodies.toLocaleString();
      telEnergy.textContent = activeScene.getTotalEnergy().toFixed(3);
    }
    // 负载条：以 60fps 为目标
    const load = Math.min(100, Math.max(5, (16.67 / Math.max(realDt * 1000, 1)) * 100 * 0.6 + 30));
    loadBar.style.width = `${load.toFixed(0)}%`;
    // UTC 时钟
    const d = new Date();
    utcClock.textContent = `UTC ${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}:${String(d.getUTCSeconds()).padStart(2, '0')}`;

    fpsAcc = 0;
    fpsCount = 0;
    lastUiUpdate = now;
  }
}

requestAnimationFrame(loop);
