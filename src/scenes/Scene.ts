import * as THREE from 'three';

export interface Scene {
  readonly title: string;
  readonly description: string;
  readonly bodies: number;
  /** 控制方程，将显示在信息面板"控制方程"区域 */
  readonly formula?: string;
  /** 关键参数列表 [名称, 值]，将显示在信息面板底部 */
  readonly params?: ReadonlyArray<readonly [string, string]>;
  init(): void;
  update(dt: number): void;
  dispose(): void;
  getTotalEnergy(): number;
  /** 可选：当相机位置变化时被 main loop 调用（shader 场景用） */
  onCameraMove?(pos: THREE.Vector3): void;
  root: THREE.Object3D;
}
