import * as THREE from 'three';
import type { Scene } from './Scene';
import { addStars } from './ThreeBody';

// Roche disruption: a small "asteroid" (cohesionless particle cluster) on a parabolic
// approach to a massive primary. Inside the Roche radius
//     d_Roche = R_primary * (2 * rho_primary / rho_satellite)^(1/3)
// tidal forces overwhelm self-gravity and the body shreds into a stream.

const G = 1.0;
const M_PRIMARY = 80;
const R_PRIMARY = 0.55;
const N_PARTICLES = 900;

export class RocheScene implements Scene {
  readonly title = '洛希潮汐撕裂';
  readonly description =
    '一颗无内聚力的小天体（粒子云）以抛物线轨迹接近大质量主星。当其进入洛希极限内，潮汐力（∝ 1/r³）超过自引力，天体被拉伸成沿径向的"残骸流"。颜色：青色（远）→ 橙色（进入洛希极限）→ 红色（接近表面）。';
  readonly bodies = N_PARTICLES;
  readonly formula = 'd_Roche = R_主 · (2 · ρ_主 / ρ_子)^⅓';
  readonly params = [
    ['主星质量 M', '80（归一化）'],
    ['主星半径 R', '0.55'],
    ['洛希极限', `R · ∛4 ≈ ${(0.55 * Math.cbrt(4)).toFixed(2)}`],
    ['粒子数', `${N_PARTICLES}`],
    ['初始构型', '半径 0.22 的球团'],
  ] as const;
  root = new THREE.Group();

  private primary!: THREE.Mesh;
  private particles: { pos: THREE.Vector3; vel: THREE.Vector3 }[] = [];
  private points!: THREE.Points;
  private positionsAttr!: Float32Array;
  private colorsAttr!: Float32Array;
  private rocheRadius = 0;

  init(): void {
    addStars(this.root, 1200);

    // Primary (massive central body)
    this.primary = new THREE.Mesh(
      new THREE.SphereGeometry(R_PRIMARY, 48, 32),
      new THREE.MeshBasicMaterial({ color: 0xff6b00 }),
    );
    this.root.add(this.primary);
    // Glow halo
    this.primary.add(
      new THREE.Mesh(
        new THREE.SphereGeometry(R_PRIMARY * 1.6, 32, 24),
        new THREE.MeshBasicMaterial({ color: 0xff6b00, transparent: true, opacity: 0.12 }),
      ),
    );

    // Roche radius ring (visual reference, rho ratio ~= 2)
    this.rocheRadius = R_PRIMARY * Math.cbrt(2 * 2);
    const ringGeo = new THREE.RingGeometry(this.rocheRadius - 0.01, this.rocheRadius + 0.01, 96);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x00ffe1,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.35,
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = -Math.PI / 2;
    this.root.add(ring);

    // Initial satellite cluster: a small sphere of particles on parabolic approach
    const center = new THREE.Vector3(6, 0, 4);
    const v0 = new THREE.Vector3(-1.2, 0, -0.5); // approach velocity
    const rCluster = 0.22;

    this.positionsAttr = new Float32Array(N_PARTICLES * 3);
    this.colorsAttr = new Float32Array(N_PARTICLES * 3);
    for (let i = 0; i < N_PARTICLES; i++) {
      // Sample uniformly inside a sphere
      let p: THREE.Vector3;
      do {
        p = new THREE.Vector3(
          (Math.random() - 0.5) * 2,
          (Math.random() - 0.5) * 2,
          (Math.random() - 0.5) * 2,
        );
      } while (p.lengthSq() > 1);
      p.multiplyScalar(rCluster).add(center);

      this.particles.push({
        pos: p,
        vel: v0.clone().add(
          new THREE.Vector3(
            (Math.random() - 0.5) * 0.02,
            (Math.random() - 0.5) * 0.02,
            (Math.random() - 0.5) * 0.02,
          ),
        ),
      });
      this.positionsAttr[i * 3 + 0] = p.x;
      this.positionsAttr[i * 3 + 1] = p.y;
      this.positionsAttr[i * 3 + 2] = p.z;
      this.colorsAttr[i * 3 + 0] = 0.0;
      this.colorsAttr[i * 3 + 1] = 1.0;
      this.colorsAttr[i * 3 + 2] = 0.88;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.positionsAttr, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this.colorsAttr, 3));
    this.points = new THREE.Points(
      geo,
      new THREE.PointsMaterial({
        size: 0.04,
        vertexColors: true,
        transparent: true,
        opacity: 0.95,
      }),
    );
    this.root.add(this.points);
  }

  update(dt: number): void {
    const h = Math.min(dt, 0.02);
    const posAttr = this.points.geometry.attributes.position as THREE.BufferAttribute;
    const colAttr = this.points.geometry.attributes.color as THREE.BufferAttribute;

    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i];
      const r = p.pos.length();
      // Gravity from primary
      const aGrav = p.pos.clone().multiplyScalar(-(G * M_PRIMARY) / (r * r * r));
      p.vel.addScaledVector(aGrav, h);
      p.pos.addScaledVector(p.vel, h);

      // Color by distance: cyan far → orange inside Roche → red near surface
      const d = p.pos.length();
      let c: THREE.Color;
      if (d < R_PRIMARY * 1.05) {
        c = new THREE.Color(0xff3060);
      } else if (d < this.rocheRadius) {
        const t = (d - R_PRIMARY) / (this.rocheRadius - R_PRIMARY);
        c = new THREE.Color().lerpColors(new THREE.Color(0xff3060), new THREE.Color(0xff6b00), t);
      } else {
        c = new THREE.Color(0x00ffe1);
      }
      colAttr.setXYZ(i, c.r, c.g, c.b);
      posAttr.setXYZ(i, p.pos.x, p.pos.y, p.pos.z);
    }
    posAttr.needsUpdate = true;
    colAttr.needsUpdate = true;
  }

  getTotalEnergy(): number {
    let E = 0;
    for (const p of this.particles) {
      E += 0.5 * p.vel.lengthSq();
      E -= (G * M_PRIMARY) / Math.max(p.pos.length(), 0.05);
    }
    return E / this.particles.length;
  }

  dispose(): void {
    this.root.traverse((o) => {
      if ((o as THREE.Mesh).geometry) (o as THREE.Mesh).geometry.dispose();
      const m = (o as THREE.Mesh).material;
      if (Array.isArray(m)) m.forEach((mm) => mm.dispose());
      else if (m) m.dispose();
    });
    this.particles = [];
  }
}
