import * as THREE from 'three';
import type { Scene } from './Scene';
import { addStars } from './ThreeBody';

// Circular restricted three-body problem (CR3BP), Earth-Moon-like ratio.
// In the rotating frame, effective potential:
//   U(x,y) = -(1-mu)/r1 - mu/r2 - 0.5 * (x^2 + y^2)
// Lagrange points are stationary points of U.

const MU = 0.012; // mass ratio (secondary / total)
const GRID = 120; // grid resolution for potential field
const EXTENT = 1.8;

export class LagrangeScene implements Scene {
  readonly title = '拉格朗日势场';
  readonly description =
    '圆形限制三体问题（CR3BP）在共转坐标系下的有效势能场。五个拉格朗日点 L1-L5 为势能极值点：L1/L2/L3 鞍点不稳定，L4/L5（当 μ < 0.0385 时）为稳定极大点，会形成"蝌蚪轨道"或"马蹄轨道"。颜色编码雅可比势能 U(x, y)。';
  readonly bodies = 2;
  readonly formula = 'U(x,y) = -(1-μ)/r₁ - μ/r₂ - ½(x² + y²)';
  readonly params = [
    ['质量比 μ', '0.012（类地月系统）'],
    ['网格分辨率', '120 × 120'],
    ['L 点求解', '牛顿迭代'],
    ['测试粒子数', '200（绕 L4/L5）'],
    ['等势面拓扑', '罗氏瓣 + 双井'],
  ] as const;
  root = new THREE.Group();

  private testParticles: { pos: THREE.Vector3; vel: THREE.Vector3 }[] = [];
  private particleMesh!: THREE.Points;
  private particlePositions!: Float32Array;

  init(): void {
    addStars(this.root, 1200);

    // Potential field as a colored plane (heightmap-ish)
    const geo = new THREE.PlaneGeometry(EXTENT * 2, EXTENT * 2, GRID, GRID);
    const colors = new Float32Array((GRID + 1) * (GRID + 1) * 3);
    const positions = geo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i <= GRID; i++) {
      for (let j = 0; j <= GRID; j++) {
        const idx = i * (GRID + 1) + j;
        const x = positions.getX(idx);
        const y = positions.getY(idx);
        const U = potential(x, y);
        // Map U to color (cyan -> dark)
        const t = THREE.MathUtils.clamp((U + 1.6) / 0.4, 0, 1);
        const cyan = new THREE.Color(0x00ffe1).multiplyScalar(t * 0.4);
        const orange = new THREE.Color(0xff6b00).multiplyScalar((1 - t) * 0.1);
        const c = cyan.add(orange);
        colors[idx * 3 + 0] = c.r;
        colors[idx * 3 + 1] = c.g;
        colors[idx * 3 + 2] = c.b;
        // Slight z displacement for visual depth
        positions.setZ(idx, THREE.MathUtils.clamp(U * 0.15, -0.4, 0.05));
      }
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    const mat = new THREE.MeshBasicMaterial({
      vertexColors: true,
      wireframe: true,
      transparent: true,
      opacity: 0.55,
    });
    const plane = new THREE.Mesh(geo, mat);
    plane.rotation.x = -Math.PI / 2;
    this.root.add(plane);

    // Primary (M1) and secondary (M2)
    const m1 = new THREE.Mesh(
      new THREE.SphereGeometry(0.08, 32, 24),
      new THREE.MeshBasicMaterial({ color: 0xffffaa }),
    );
    m1.position.set(-MU, 0.03, 0);
    this.root.add(m1);
    const m2 = new THREE.Mesh(
      new THREE.SphereGeometry(0.035, 32, 24),
      new THREE.MeshBasicMaterial({ color: 0x88aaff }),
    );
    m2.position.set(1 - MU, 0.03, 0);
    this.root.add(m2);

    // Lagrange point markers (analytic approximations)
    const Lpts = computeLagrangePoints(MU);
    const ringGeo = new THREE.RingGeometry(0.04, 0.06, 24);
    Lpts.forEach((p, i) => {
      const ring = new THREE.Mesh(
        ringGeo,
        new THREE.MeshBasicMaterial({
          color: 0xff6b00,
          side: THREE.DoubleSide,
          transparent: true,
          opacity: 0.85,
        }),
      );
      ring.position.set(p.x, 0.05, p.y);
      ring.rotation.x = -Math.PI / 2;
      this.root.add(ring);

      const label = makeTextSprite(`L${i + 1}`, '#ff6b00');
      label.position.set(p.x + 0.08, 0.12, p.y + 0.04);
      this.root.add(label);
    });

    // Test particles around L4/L5 (stable points → tadpole orbits)
    const particleCount = 200;
    this.particlePositions = new Float32Array(particleCount * 3);
    for (let i = 0; i < particleCount; i++) {
      const Lpt = i < particleCount / 2 ? Lpts[3] : Lpts[4]; // L4 or L5
      const dx = (Math.random() - 0.5) * 0.15;
      const dy = (Math.random() - 0.5) * 0.15;
      this.testParticles.push({
        pos: new THREE.Vector3(Lpt.x + dx, 0, Lpt.y + dy),
        vel: new THREE.Vector3((Math.random() - 0.5) * 0.05, 0, (Math.random() - 0.5) * 0.05),
      });
      this.particlePositions[i * 3 + 0] = Lpt.x + dx;
      this.particlePositions[i * 3 + 1] = 0;
      this.particlePositions[i * 3 + 2] = Lpt.y + dy;
    }
    const pGeo = new THREE.BufferGeometry();
    pGeo.setAttribute('position', new THREE.BufferAttribute(this.particlePositions, 3));
    this.particleMesh = new THREE.Points(
      pGeo,
      new THREE.PointsMaterial({ color: 0x00ffe1, size: 0.025, transparent: true, opacity: 0.9 }),
    );
    this.root.add(this.particleMesh);
  }

  update(dt: number): void {
    const h = Math.min(dt, 0.05);
    const pos = this.particleMesh.geometry.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < this.testParticles.length; i++) {
      const p = this.testParticles[i];
      // CR3BP equations in rotating frame (z ignored — 2D motion in x-z plane visually)
      const x = p.pos.x;
      const y = p.pos.z;
      const vx = p.vel.x;
      const vy = p.vel.z;
      const r1 = Math.hypot(x + MU, y);
      const r2 = Math.hypot(x - 1 + MU, y);
      const ax = x + 2 * vy - ((1 - MU) * (x + MU)) / r1 ** 3 - (MU * (x - 1 + MU)) / r2 ** 3;
      const ay = y - 2 * vx - ((1 - MU) * y) / r1 ** 3 - (MU * y) / r2 ** 3;
      p.vel.x += ax * h;
      p.vel.z += ay * h;
      p.pos.x += p.vel.x * h;
      p.pos.z += p.vel.z * h;
      pos.setXYZ(i, p.pos.x, 0, p.pos.z);
    }
    pos.needsUpdate = true;
  }

  getTotalEnergy(): number {
    // Jacobi constant of first particle as a proxy
    if (this.testParticles.length === 0) return 0;
    const p = this.testParticles[0];
    return -2 * potential(p.pos.x, p.pos.z) - (p.vel.x ** 2 + p.vel.z ** 2);
  }

  dispose(): void {
    this.root.traverse((o) => {
      if ((o as THREE.Mesh).geometry) (o as THREE.Mesh).geometry.dispose();
      const m = (o as THREE.Mesh).material;
      if (Array.isArray(m)) m.forEach((mm) => mm.dispose());
      else if (m) m.dispose();
    });
    this.testParticles = [];
  }
}

function potential(x: number, y: number): number {
  const r1 = Math.hypot(x + MU, y);
  const r2 = Math.hypot(x - 1 + MU, y);
  return -(1 - MU) / Math.max(r1, 0.02) - MU / Math.max(r2, 0.02) - 0.5 * (x * x + y * y);
}

function computeLagrangePoints(mu: number): THREE.Vector2[] {
  // L1, L2, L3 from collinear cubic (Newton iteration)
  const solveCollinear = (sign: number, region: 'L1' | 'L2' | 'L3'): number => {
    // Solve f(x) = 0 numerically using bisection
    const f = (x: number) => {
      const r1 = Math.abs(x + mu);
      const r2 = Math.abs(x - 1 + mu);
      return x - ((1 - mu) * (x + mu)) / r1 ** 3 - (mu * (x - 1 + mu)) / r2 ** 3;
    };
    let lo: number, hi: number;
    if (region === 'L1') { lo = -mu + 0.001; hi = 1 - mu - 0.001; }
    else if (region === 'L2') { lo = 1 - mu + 0.001; hi = 2; }
    else { lo = -2; hi = -mu - 0.001; }
    for (let k = 0; k < 80; k++) {
      const mid = 0.5 * (lo + hi);
      if (f(lo) * f(mid) < 0) hi = mid;
      else lo = mid;
    }
    return 0.5 * (lo + hi);
    void sign;
  };
  const L1 = new THREE.Vector2(solveCollinear(-1, 'L1'), 0);
  const L2 = new THREE.Vector2(solveCollinear(1, 'L2'), 0);
  const L3 = new THREE.Vector2(solveCollinear(1, 'L3'), 0);
  const L4 = new THREE.Vector2(0.5 - mu, Math.sqrt(3) / 2);
  const L5 = new THREE.Vector2(0.5 - mu, -Math.sqrt(3) / 2);
  return [L1, L2, L3, L4, L5];
}

function makeTextSprite(text: string, color: string): THREE.Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 64;
  const ctx = canvas.getContext('2d')!;
  ctx.font = 'bold 36px monospace';
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 64, 32);
  const tex = new THREE.CanvasTexture(canvas);
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(0.2, 0.1, 1);
  return sprite;
}
