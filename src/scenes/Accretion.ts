// Interstellar 风格黑洞 — 基于 GLSL ray-marching
// 简化的 Schwarzschild 测地线积分（牛顿近似带相对论修正系数），渲染：
//   · 事件视界（黑）
//   · 强引力透镜（远端盘面被弯到上方/下方）
//   · 薄吸积盘（温度纹理 + FBM 湍流 + 多普勒可控）
//   · 光子球辉光圈
//   · 背景星空
import * as THREE from 'three';
import type { Scene } from './Scene';

export class AccretionScene implements Scene {
  readonly title = '引力透镜 · 吸积盘';
  readonly description =
    '《星际穿越》Gargantua 风格的史瓦西黑洞。光线在事件视界附近被强烈弯曲，使远端的薄吸积盘被引力透镜效应折叠到画面上下方，形成标志性的"双盘"光圈。温度梯度遵循 T ∝ r⁻³⁄⁴（Shakura-Sunyaev 模型）。';
  readonly bodies = 1;
  root = new THREE.Group();
  readonly formula = 'ds² = -(1-2M/r)dt² + dr²/(1-2M/r) + r²dΩ²';
  readonly params = [
    ['黑洞质量 M', '1.0'],
    ['事件视界 rₛ', '2M = 2.0'],
    ['ISCO 内边界', '6M ≈ 3.0'],
    ['盘外半径', '14M ≈ 7.0'],
    ['ray-march 步数', '220'],
  ] as const;

  private skybox!: THREE.Mesh;
  private mat!: THREE.ShaderMaterial;
  private time = 0;

  init(): void {
    // 用一个超大反向 BoxGeometry 包围相机，shader 在每个像素上做 ray-march
    const geo = new THREE.BoxGeometry(600, 600, 600);
    this.mat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      depthTest: false,
      uniforms: {
        uTime: { value: 0 },
        uCameraPos: { value: new THREE.Vector3() },
        uM: { value: 1.0 },
        uDiskInner: { value: 3.0 },
        uDiskOuter: { value: 7.0 },
        uDiskBrightness: { value: 1.45 },
        uDopplerStrength: { value: 0.35 },
        uTimeScale: { value: 1.0 },
      },
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
    });
    this.skybox = new THREE.Mesh(geo, this.mat);
    this.skybox.renderOrder = -1;
    this.skybox.frustumCulled = false;
    this.root.add(this.skybox);
  }

  setCameraPos(p: THREE.Vector3): void {
    this.mat.uniforms.uCameraPos.value.copy(p);
  }

  onCameraMove(pos: THREE.Vector3): void {
    this.mat.uniforms.uCameraPos.value.copy(pos);
  }

  update(dt: number): void {
    this.time += dt;
    this.mat.uniforms.uTime.value = this.time;
  }

  getTotalEnergy(): number {
    return -0.5 * this.mat.uniforms.uM.value; // 形式上的束缚能
  }

  dispose(): void {
    this.skybox.geometry.dispose();
    this.mat.dispose();
  }
}

const VERTEX = /* glsl */ `
varying vec3 vWorldPos;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorldPos = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const FRAGMENT = /* glsl */ `
precision highp float;

uniform float uTime;
uniform vec3 uCameraPos;
uniform float uM;
uniform float uDiskInner;
uniform float uDiskOuter;
uniform float uDiskBrightness;
uniform float uDopplerStrength;

varying vec3 vWorldPos;

// ---------- 噪声 ----------
float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float hash31(vec3 p) {
  p = fract(p * vec3(0.1031, 0.1030, 0.0973));
  p += dot(p, p.yzx + 33.33);
  return fract((p.x + p.y) * p.z);
}
float noise2(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash21(i), hash21(i + vec2(1.0, 0.0)), u.x),
    mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), u.x),
    u.y
  );
}
float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++) {
    v += a * noise2(p);
    p = p * 2.03 + 17.7;
    a *= 0.5;
  }
  return v;
}

// 黑体色温近似（kelvin -> rgb），简化版
vec3 blackbody(float t) {
  // t in [0,1]
  vec3 hot = vec3(1.0, 0.95, 0.85);   // 高温白
  vec3 mid = vec3(1.0, 0.65, 0.18);   // 中温橙黄（Interstellar 色调）
  vec3 cool = vec3(0.65, 0.18, 0.02); // 冷红
  if (t > 0.6) return mix(mid, hot, smoothstep(0.6, 1.0, t));
  return mix(cool, mid, smoothstep(0.0, 0.6, t));
}

// 采样吸积盘颜色：r 为盘内半径，diskPos 是盘平面上 (x,z) 投影
vec3 sampleDisk(vec2 diskPos, float r, vec3 incomingDir) {
  // 温度剖面 T ∝ r^(-3/4)
  float tRaw = pow(uDiskInner / max(r, uDiskInner), 0.75);
  float t = clamp(tRaw, 0.0, 1.0);

  // 角度（绕盘）
  float ang = atan(diskPos.y, diskPos.x);
  float rNorm = (r - uDiskInner) / (uDiskOuter - uDiskInner);

  // 旋转动画：内圈快、外圈慢（Kepler ω ∝ r^(-3/2)）
  float kepler = pow(uDiskInner / max(r, uDiskInner), 1.5);
  float u = ang + uTime * kepler * 0.5;

  // 双层湍流：径向条纹 + 角向涡旋
  vec2 uvA = vec2(u * 3.5, rNorm * 6.0);
  vec2 uvB = vec2(u * 8.0 - uTime * 0.4, rNorm * 14.0);
  float n = fbm(uvA) * 0.65 + fbm(uvB) * 0.45;

  // 内外边缘衰减
  float inEdge = smoothstep(uDiskInner, uDiskInner * 1.18, r);
  float outEdge = 1.0 - smoothstep(uDiskOuter * 0.78, uDiskOuter, r);
  float edge = inEdge * outEdge;

  // 多普勒：盘旋转方向上"接近"的一侧偏蓝偏亮（《星际穿越》中 Nolan 选择弱化，这里给少量）
  vec3 orbitDir = vec3(-sin(ang), 0.0, cos(ang));
  float dopp = dot(orbitDir, -incomingDir);
  float dopplerBoost = 1.0 + uDopplerStrength * dopp;

  vec3 col = blackbody(t);
  col *= (0.45 + 0.85 * n);
  col *= edge * uDiskBrightness * dopplerBoost;
  return col;
}

void main() {
  vec3 ro = uCameraPos;
  vec3 rd = normalize(vWorldPos - uCameraPos);

  float rs = 2.0 * uM;            // 事件视界
  float photonSphere = 1.5 * rs;  // 光子球
  vec3 pos = ro;
  vec3 dir = rd;
  float prevY = pos.y;

  vec3 accum = vec3(0.0);
  float photonGlow = 0.0;
  bool fellIn = false;
  bool escaped = false;

  const int STEPS = 220;
  for (int i = 0; i < STEPS; i++) {
    float r = length(pos);

    // 自适应步长：靠近黑洞细化
    float h = clamp(r * 0.04, 0.045, 0.55);

    // 牛顿引力（光速归一），乘以 1.25 提升弯曲强度让效果接近 GR
    vec3 grav = -pos / (r * r * r) * uM * 1.25;
    dir = normalize(dir + grav * h);
    vec3 newPos = pos + dir * h;

    // 光子球区域光晕（接近 1.5rs 时累积）
    if (r > rs && r < photonSphere * 1.6) {
      float pg = 1.0 - smoothstep(rs * 1.02, photonSphere * 1.6, r);
      photonGlow += pg * 0.012;
    }

    // 穿过赤道盘：y 符号翻转
    if (prevY * newPos.y < 0.0) {
      float t = abs(prevY) / (abs(prevY) + abs(newPos.y));
      vec3 hit = mix(pos, newPos, t);
      float diskR = length(hit.xz);
      if (diskR > uDiskInner && diskR < uDiskOuter) {
        accum += sampleDisk(hit.xz, diskR, dir);
      }
    }

    // 事件视界
    if (r < rs * 1.02) { fellIn = true; break; }
    // 逃逸
    if (r > 120.0) { escaped = true; break; }

    prevY = newPos.y;
    pos = newPos;
  }

  vec3 col = accum;

  // 光子球辉光
  col += vec3(1.0, 0.55, 0.18) * photonGlow * 1.4;

  // 背景星空（仅光线逃逸时显示）
  if (escaped) {
    // 高频星点
    float s = step(0.9965, hash31(floor(dir * 1500.0)));
    vec3 starCol = vec3(0.85, 0.9, 1.0) * s * 1.2;
    // 暗星云（Interstellar 那种淡淡的紫蓝雾气）
    float neb = fbm(dir.xy * 4.0 + 5.0) * fbm(dir.yz * 4.0 - 2.0);
    vec3 nebCol = mix(vec3(0.02, 0.03, 0.06), vec3(0.10, 0.04, 0.15), neb) * 0.6;
    col += starCol + nebCol * 0.55;
  }

  // 内圈深度暗化（防止 horizon 周围反射过亮）
  if (fellIn) {
    col *= 0.0;
  }

  // 色调微调（更接近 Interstellar 暖橙）
  col = pow(col, vec3(0.92));
  col = mix(col, col * vec3(1.05, 1.0, 0.92), 0.6);

  gl_FragColor = vec4(col, 1.0);
}
`;
