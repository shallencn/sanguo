// 小地图：显示全图、各势力领地和当前画面的位置，点一下可以跳过去。

import { Terrain, type GameState } from '../core/types';
import { COLORS, landColor } from './theme';
import type { MapView } from './mapview';

export class Minimap {
  private ctx: CanvasRenderingContext2D;
  private base: HTMLCanvasElement | null = null;
  private state: GameState | null = null;

  constructor(
    private canvas: HTMLCanvasElement,
    private view: MapView,
  ) {
    this.ctx = canvas.getContext('2d')!;
    let down = false;
    const jump = (e: PointerEvent) => {
      if (!this.state) return;
      const rect = canvas.getBoundingClientRect();
      const N = this.state.map.size;
      view.setCenter(((e.clientX - rect.left) / rect.width) * N, ((e.clientY - rect.top) / rect.height) * N);
    };
    canvas.addEventListener('pointerdown', (e) => {
      down = true;
      canvas.setPointerCapture(e.pointerId);
      jump(e);
    });
    canvas.addEventListener('pointermove', (e) => down && jump(e));
    canvas.addEventListener('pointerup', () => (down = false));
    canvas.addEventListener('pointercancel', () => (down = false));
  }

  setState(state: GameState): void {
    this.state = state;
    const map = state.map;
    const N = map.size;
    const cv = document.createElement('canvas');
    cv.width = N;
    cv.height = N;
    const g = cv.getContext('2d')!;
    for (let i = 0; i < N * N; i++) {
      const t = map.terrain[i];
      g.fillStyle =
        t === Terrain.Mountain
          ? COLORS.mountain
          : t === Terrain.River
            ? COLORS.river
            : t === Terrain.Ferry
              ? COLORS.plank
              : t === Terrain.Pass
                ? '#b9a98c'
                : t === Terrain.City
                  ? COLORS.roof
                  : landColor(map.res[i], map.level[i]);
      g.fillRect(i % N, Math.floor(i / N), 1, 1);
    }
    this.base = cv;
  }

  draw(): void {
    const { ctx, canvas, state } = this;
    if (!state || !this.base) return;
    const size = canvas.width;
    const N = state.map.size;
    const k = size / N;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.base, 0, 0, size, size);
    const { owner } = state.map;
    for (let i = 0; i < owner.length; i++) {
      if (owner[i] < 0) continue;
      ctx.fillStyle = state.factions[owner[i]].color;
      ctx.fillRect((i % N) * k, Math.floor(i / N) * k, k, k);
    }
    // 各势力主城：加大一圈，远看也能找到
    for (const f of state.factions) {
      ctx.fillStyle = COLORS.ink;
      ctx.fillRect((f.baseX - 1) * k - 1, (f.baseY - 1) * k - 1, k * 3 + 2, k * 3 + 2);
      ctx.fillStyle = f.color;
      ctx.fillRect((f.baseX - 1) * k, (f.baseY - 1) * k, k * 3, k * 3);
    }
    const r = this.view.viewRect();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.strokeRect(
      Math.max(1, r.x0 * k),
      Math.max(1, r.y0 * k),
      Math.min(size - 2, r.x1 * k) - Math.max(1, r.x0 * k),
      Math.min(size - 2, r.y1 * k) - Math.max(1, r.y0 * k),
    );
  }
}
