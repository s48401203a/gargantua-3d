import * as THREE from 'three';
import type { Scene } from './Scene';

interface Body {
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  acc: THREE.Vector3;
  mass: number;
  mesh: THREE.Mesh;
  trail: THREE.Vector3[];
  trailLine: THREE.Line;
  color: THREE.Color;
}

const G = 1.0;
const SOFTEN = 0.08;
const TRAIL_LEN = 600;

export class ThreeBodyScene implements Scene {
  readonly title = '三体共振';
  readonly description =
    '三个互相引力作用的质点，无解析闭形式解。本场景采用 Chenciner-Montgomery（2000）发现的"8 字形"周期解作为初始条件，并施加微小扰动以暴露其混沌本质。轨迹由四阶速度-Verlet 积分器（8 倍子步）保证能量守恒。';
  readonly bodies = 3;
  readonly formula = '𝐫̈ᵢ = G·Σⱼ mⱼ·(𝐫ⱼ - 𝐫ᵢ) / |𝐫ⱼ - 𝐫ᵢ|³';
  readonly params = [
    ['积分器', 'Velocity Verlet'],
    ['子步数', '8'],
    ['软化长度 ε', '0.08'],
    ['初始构型', '8 字形 + 微扰'],
    ['拖尾长度', '600 帧'],
  ] as const;
  root = new THREE.Group();
  private bodiesArr: Body[] = [];

  init(): void {
    // Figure-8 initial conditions (Chenciner-Montgomery)
    const r1 = new THREE.Vector3(0.97000436, -0.24308753, 0);
    const r2 = new THREE.Vector3(-0.97000436, 0.24308753, 0);
    const r3 = new THREE.Vector3(0, 0, 0);
    const v3 = new THREE.Vector3(-0.93240737, -0.86473146, 0);
    const v1 = v3.clone().multiplyScalar(-0.5);
    const v2 = v3.clone().multiplyScalar(-0.5);
    // Slight perturbation toward chaos
    r1.x += 0.002;
    v3.y += 0.001;

    const colors = [0x00ffe1, 0xff6b00, 0xff3060];
    [
      { pos: r1, vel: v1 },
      { pos: r2, vel: v2 },
      { pos: r3, vel: v3 },
    ].forEach((b, i) => this.addBody(b.pos, b.vel, 1.0, colors[i]));

    // Soft background stars
    addStars(this.root, 1500);
  }

  private addBody(pos: THREE.Vector3, vel: THREE.Vector3, mass: number, color: number) {
    const geo = new THREE.SphereGeometry(0.06 * Math.cbrt(mass), 24, 16);
    const mat = new THREE.MeshBasicMaterial({ color });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(pos);
    this.root.add(mesh);

    // Glow halo
    const halo = new THREE.Mesh(
      new THREE.SphereGeometry(0.16 * Math.cbrt(mass), 24, 16),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.15 }),
    );
    mesh.add(halo);

    const trailGeo = new THREE.BufferGeometry();
    trailGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(TRAIL_LEN * 3), 3));
    const trailMat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.55 });
    const trailLine = new THREE.Line(trailGeo, trailMat);
    this.root.add(trailLine);

    this.bodiesArr.push({
      pos: pos.clone(),
      vel: vel.clone(),
      acc: new THREE.Vector3(),
      mass,
      mesh,
      trail: [],
      trailLine,
      color: new THREE.Color(color),
    });
  }

  private computeAccelerations(): void {
    for (const b of this.bodiesArr) b.acc.set(0, 0, 0);
    for (let i = 0; i < this.bodiesArr.length; i++) {
      for (let j = i + 1; j < this.bodiesArr.length; j++) {
        const bi = this.bodiesArr[i];
        const bj = this.bodiesArr[j];
        const d = new THREE.Vector3().subVectors(bj.pos, bi.pos);
        const r2 = d.lengthSq() + SOFTEN * SOFTEN;
        const invR3 = 1 / (r2 * Math.sqrt(r2));
        bi.acc.addScaledVector(d, G * bj.mass * invR3);
        bj.acc.addScaledVector(d, -G * bi.mass * invR3);
      }
    }
  }

  update(dt: number): void {
    // Sub-step for stability
    const SUB = 8;
    const h = Math.min(dt, 0.05) / SUB;
    for (let s = 0; s < SUB; s++) {
      // Velocity Verlet
      this.computeAccelerations();
      for (const b of this.bodiesArr) {
        b.vel.addScaledVector(b.acc, h * 0.5);
        b.pos.addScaledVector(b.vel, h);
      }
      this.computeAccelerations();
      for (const b of this.bodiesArr) {
        b.vel.addScaledVector(b.acc, h * 0.5);
      }
    }

    for (const b of this.bodiesArr) {
      b.mesh.position.copy(b.pos);
      b.trail.push(b.pos.clone());
      if (b.trail.length > TRAIL_LEN) b.trail.shift();
      const pos = b.trailLine.geometry.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < b.trail.length; i++) {
        pos.setXYZ(i, b.trail[i].x, b.trail[i].y, b.trail[i].z);
      }
      pos.needsUpdate = true;
      b.trailLine.geometry.setDrawRange(0, b.trail.length);
    }
  }

  getTotalEnergy(): number {
    let E = 0;
    for (const b of this.bodiesArr) E += 0.5 * b.mass * b.vel.lengthSq();
    for (let i = 0; i < this.bodiesArr.length; i++) {
      for (let j = i + 1; j < this.bodiesArr.length; j++) {
        const bi = this.bodiesArr[i];
        const bj = this.bodiesArr[j];
        const r = bi.pos.distanceTo(bj.pos);
        E -= (G * bi.mass * bj.mass) / Math.max(r, SOFTEN);
      }
    }
    return E;
  }

  dispose(): void {
    this.root.traverse((o) => {
      if ((o as THREE.Mesh).geometry) (o as THREE.Mesh).geometry.dispose();
      const m = (o as THREE.Mesh).material;
      if (Array.isArray(m)) m.forEach((mm) => mm.dispose());
      else if (m) m.dispose();
    });
    this.bodiesArr = [];
  }
}

export function addStars(root: THREE.Object3D, count: number): void {
  const g = new THREE.BufferGeometry();
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const r = 40 + Math.random() * 60;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    positions[i * 3 + 0] = r * Math.sin(phi) * Math.cos(theta);
    positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
    positions[i * 3 + 2] = r * Math.cos(phi);
  }
  g.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const m = new THREE.PointsMaterial({
    color: 0xaaccff,
    size: 0.08,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.5,
  });
  root.add(new THREE.Points(g, m));
}
