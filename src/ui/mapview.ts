// 大地图：用 Canvas 画。负责绘制、拖动、缩放、点选地块。
//
// 画法：地形不会变，所以先把整张地图的地形画到两张"底图"上（一张精细、一张简略），
// 每一帧只需要把底图贴上去，再画会变化的东西（领地颜色、行军、选中框）。
// 放得很大时改为直接逐格绘制，保证清晰。

import { STATES } from '../data/states';
import { isAdjacentTo, isOccupiable } from '../core/territory';
import { PLAYER, Terrain, type Faction, type GameMap, type GameState, type Place } from '../core/types';
import { COLORS, FONT_BRUSH, FONT_TEXT, landColor } from './theme';

const CELL = 32; // 精细底图每格的像素
const CELL_FAR = 8; // 简略底图每格的像素
const MAX_ZOOM = 72;

/** 给每个地块一个固定的"随机数"，用来让树、石头的位置有变化但每次画出来都一样 */
function tileHash(i: number, k: number): number {
  let v = Math.imul(i + 1, 2654435761) ^ Math.imul(k + 7, 40503);
  v = Math.imul(v ^ (v >>> 15), 2246822519);
  return ((v ^ (v >>> 13)) >>> 0) / 4294967296;
}

interface DrawInfo {
  map: GameMap;
  placeAt: Map<number, Place>;
  baseAt: Map<number, Faction>;
}

/** 画一个地块的地形。s 是这一格的边长（像素）；detail=false 时只画色块。 */
function drawTile(ctx: CanvasRenderingContext2D, info: DrawInfo, x: number, y: number, px: number, py: number, s: number, detail: boolean): void {
  const { map } = info;
  const i = y * map.size + x;
  const t = map.terrain[i];
  const r = (k: number) => tileHash(i, k);

  if (t === Terrain.Mountain || t === Terrain.Pass) {
    ctx.fillStyle = COLORS.mountain;
    ctx.fillRect(px, py, s, s);
    if (detail || t === Terrain.Pass) {
      const cx = px + s * (0.4 + r(1) * 0.2);
      const top = py + s * (0.14 + r(2) * 0.1);
      // 副峰
      ctx.fillStyle = '#51453a';
      ctx.beginPath();
      ctx.moveTo(px + s * 0.02, py + s * 0.95);
      ctx.lineTo(px + s * (0.22 + r(3) * 0.1), py + s * 0.45);
      ctx.lineTo(px + s * 0.55, py + s * 0.95);
      ctx.fill();
      // 主峰：左亮右暗
      ctx.fillStyle = COLORS.mountainPeak;
      ctx.beginPath();
      ctx.moveTo(px + s * 0.18, py + s * 0.95);
      ctx.lineTo(cx, top);
      ctx.lineTo(cx, py + s * 0.95);
      ctx.fill();
      ctx.fillStyle = '#473b31';
      ctx.beginPath();
      ctx.moveTo(cx, top);
      ctx.lineTo(px + s * 0.96, py + s * 0.95);
      ctx.lineTo(cx, py + s * 0.95);
      ctx.fill();
      // 山顶
      ctx.fillStyle = COLORS.mountainSnow;
      ctx.beginPath();
      ctx.moveTo(cx, top);
      ctx.lineTo(cx - s * 0.09, top + s * 0.2);
      ctx.lineTo(cx + s * 0.11, top + s * 0.2);
      ctx.fill();
    }
    if (t === Terrain.Pass) drawGate(ctx, px, py, s);
    return;
  }

  if (t === Terrain.River || t === Terrain.Ferry) {
    ctx.fillStyle = COLORS.river;
    ctx.fillRect(px, py, s, s);
    if (detail) {
      ctx.strokeStyle = COLORS.riverWave;
      ctx.lineWidth = Math.max(1, s * 0.05);
      ctx.lineCap = 'round';
      for (let k = 0; k < 2; k++) {
        const wx = px + s * (0.12 + r(k) * 0.35);
        const wy = py + s * (0.3 + k * 0.38 + r(k + 5) * 0.08);
        ctx.beginPath();
        ctx.moveTo(wx, wy);
        ctx.quadraticCurveTo(wx + s * 0.12, wy - s * 0.09, wx + s * 0.24, wy);
        ctx.quadraticCurveTo(wx + s * 0.36, wy + s * 0.09, wx + s * 0.48, wy);
        ctx.stroke();
      }
    }
    if (t === Terrain.Ferry) {
      // 渡口：一座南北向的木桥
      ctx.fillStyle = COLORS.plank;
      ctx.fillRect(px + s * 0.3, py, s * 0.4, s);
      if (detail) {
        ctx.strokeStyle = 'rgba(40,25,10,0.55)';
        ctx.lineWidth = Math.max(1, s * 0.035);
        ctx.beginPath();
        for (let k = 1; k < 6; k++) {
          ctx.moveTo(px + s * 0.3, py + (s * k) / 6);
          ctx.lineTo(px + s * 0.7, py + (s * k) / 6);
        }
        ctx.stroke();
        ctx.strokeStyle = '#4a3520';
        ctx.lineWidth = Math.max(1, s * 0.06);
        ctx.beginPath();
        ctx.moveTo(px + s * 0.3, py);
        ctx.lineTo(px + s * 0.3, py + s);
        ctx.moveTo(px + s * 0.7, py);
        ctx.lineTo(px + s * 0.7, py + s);
        ctx.stroke();
        drawLevel(ctx, map.level[i], px, py, s);
      }
    }
    return;
  }

  if (t === Terrain.City || t === Terrain.Base) {
    ctx.fillStyle = '#7b6a4e';
    ctx.fillRect(px, py, s, s);
    const place = info.placeAt.get(i);
    const base = info.baseAt.get(i);
    const big = place?.kind === 'capital' || place?.kind === 'city' || !!base;
    const roof = base ? base.color : place?.kind === 'capital' ? '#d3a53c' : COLORS.roof;
    drawCity(ctx, px, py, s, roof, big, detail);
    return;
  }

  // 平原：资源地
  const res = map.res[i];
  ctx.fillStyle = landColor(res, map.level[i]);
  ctx.fillRect(px, py, s, s);
  if (!detail) return;

  if (res === 0) {
    // 林地：三棵小树
    for (let k = 0; k < 3; k++) {
      const tx = px + s * (0.18 + k * 0.3 + (r(k) - 0.5) * 0.12);
      const ty = py + s * (0.3 + r(k + 3) * 0.32);
      const th = s * (0.24 + r(k + 6) * 0.08);
      ctx.fillStyle = 'rgba(24,44,18,0.5)';
      ctx.beginPath();
      ctx.moveTo(tx, ty - th * 0.6);
      ctx.lineTo(tx - th * 0.42, ty + th * 0.4);
      ctx.lineTo(tx + th * 0.42, ty + th * 0.4);
      ctx.fill();
    }
  } else if (res === 3) {
    // 农田：田垄
    ctx.strokeStyle = 'rgba(96,66,14,0.34)';
    ctx.lineWidth = Math.max(1, s * 0.045);
    ctx.beginPath();
    for (let k = 0; k < 4; k++) {
      const ly = py + s * (0.2 + k * 0.2);
      ctx.moveTo(px + s * 0.12, ly);
      ctx.lineTo(px + s * 0.88, ly);
    }
    ctx.stroke();
  } else if (res === 2) {
    // 石场：几块浅色石头
    for (let k = 0; k < 3; k++) {
      const sx = px + s * (0.22 + r(k) * 0.56);
      const sy = py + s * (0.24 + r(k + 3) * 0.48);
      const sr = s * (0.07 + r(k + 6) * 0.05);
      ctx.fillStyle = 'rgba(40,30,18,0.28)';
      ctx.beginPath();
      ctx.ellipse(sx + sr * 0.2, sy + sr * 0.5, sr * 1.25, sr * 0.8, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,250,235,0.34)';
      ctx.beginPath();
      ctx.ellipse(sx, sy, sr * 1.2, sr * 0.85, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  } else {
    // 铁矿：棱角分明的深色矿石
    for (let k = 0; k < 2; k++) {
      const sx = px + s * (0.26 + k * 0.4 + (r(k) - 0.5) * 0.14);
      const sy = py + s * (0.36 + r(k + 3) * 0.3);
      const sr = s * (0.13 + r(k + 6) * 0.05);
      ctx.fillStyle = 'rgba(14,20,30,0.5)';
      ctx.beginPath();
      ctx.moveTo(sx - sr, sy + sr * 0.6);
      ctx.lineTo(sx - sr * 0.4, sy - sr * 0.8);
      ctx.lineTo(sx + sr * 0.5, sy - sr * 0.6);
      ctx.lineTo(sx + sr, sy + sr * 0.6);
      ctx.fill();
      ctx.fillStyle = 'rgba(225,235,245,0.4)';
      ctx.beginPath();
      ctx.moveTo(sx - sr * 0.4, sy - sr * 0.8);
      ctx.lineTo(sx + sr * 0.5, sy - sr * 0.6);
      ctx.lineTo(sx, sy - sr * 0.1);
      ctx.fill();
    }
  }
  // 格线
  ctx.strokeStyle = 'rgba(0,0,0,0.14)';
  ctx.lineWidth = 1;
  ctx.strokeRect(px + 0.5, py + 0.5, s - 1, s - 1);
  drawLevel(ctx, map.level[i], px, py, s);
}

/** 右下角的等级数字 */
function drawLevel(ctx: CanvasRenderingContext2D, level: number, px: number, py: number, s: number): void {
  const bw = s * 0.36;
  ctx.fillStyle = 'rgba(15,10,6,0.5)';
  ctx.fillRect(px + s - bw, py + s - bw, bw, bw);
  ctx.fillStyle = 'rgba(250,240,215,0.95)';
  ctx.font = `700 ${Math.round(s * 0.31)}px ${FONT_TEXT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(level), px + s - bw / 2, py + s - bw / 2 + s * 0.02);
}

/** 城池：一圈城墙 + 带屋顶的殿宇 */
function drawCity(ctx: CanvasRenderingContext2D, px: number, py: number, s: number, roof: string, big: boolean, detail: boolean): void {
  const m = big ? 0.08 : 0.16;
  const wx = px + s * m;
  const wy = py + s * (m + 0.08);
  const ww = s * (1 - m * 2);
  const wh = s * (1 - m * 2 - 0.08);
  ctx.fillStyle = COLORS.wallDark;
  ctx.fillRect(wx, wy, ww, wh);
  ctx.fillStyle = COLORS.wall;
  ctx.fillRect(wx + s * 0.05, wy + s * 0.05, ww - s * 0.1, wh - s * 0.1);
  if (detail) {
    // 城垛
    ctx.fillStyle = COLORS.wallDark;
    const n = big ? 5 : 4;
    for (let k = 0; k < n; k++) {
      ctx.fillRect(wx + (ww * (k + 0.2)) / n, wy - s * 0.06, (ww * 0.6) / n, s * 0.07);
    }
  }
  // 殿宇
  const hw = ww * 0.56;
  const hx = px + s / 2 - hw / 2;
  const hy = wy + wh * 0.42;
  ctx.fillStyle = '#3a2f26';
  ctx.fillRect(hx, hy, hw, wh * 0.44);
  ctx.fillStyle = roof;
  ctx.beginPath();
  ctx.moveTo(hx - hw * 0.22, hy + s * 0.02);
  ctx.lineTo(px + s / 2, hy - wh * 0.3);
  ctx.lineTo(hx + hw * 1.22, hy + s * 0.02);
  ctx.fill();
  if (detail) {
    ctx.strokeStyle = 'rgba(0,0,0,0.4)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }
}

/** 关卡：横在山间的城门楼 */
function drawGate(ctx: CanvasRenderingContext2D, px: number, py: number, s: number): void {
  ctx.fillStyle = COLORS.wallDark;
  ctx.fillRect(px + s * 0.06, py + s * 0.42, s * 0.88, s * 0.52);
  ctx.fillStyle = COLORS.wall;
  ctx.fillRect(px + s * 0.1, py + s * 0.47, s * 0.8, s * 0.47);
  ctx.fillStyle = '#1c1612';
  ctx.beginPath();
  ctx.moveTo(px + s * 0.38, py + s * 0.94);
  ctx.lineTo(px + s * 0.38, py + s * 0.7);
  ctx.quadraticCurveTo(px + s * 0.5, py + s * 0.56, px + s * 0.62, py + s * 0.7);
  ctx.lineTo(px + s * 0.62, py + s * 0.94);
  ctx.fill();
  ctx.fillStyle = COLORS.roof;
  ctx.beginPath();
  ctx.moveTo(px + s * 0.02, py + s * 0.44);
  ctx.lineTo(px + s * 0.5, py + s * 0.16);
  ctx.lineTo(px + s * 0.98, py + s * 0.44);
  ctx.fill();
}

export class MapView {
  readonly canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private state: GameState | null = null;
  private info: DrawInfo | null = null;
  private cacheNear: HTMLCanvasElement | null = null;
  private cacheFar: HTMLCanvasElement | null = null;
  private frontier = new Uint8Array(0);
  private stateLabels: { name: string; x: number; y: number }[] = [];
  private w = 1;
  private h = 1;
  private dpr = 1;

  /** 镜头：x、y 是画面中心对准的地图坐标（单位：格），zoom 是每格多少像素 */
  cam = { x: 40, y: 40, zoom: 30 };
  selected: { x: number; y: number } | null = null;
  private hover: { x: number; y: number } | null = null;

  onSelect: (x: number, y: number) => void = () => {};

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    this.bindInput();
    new ResizeObserver(() => this.resize()).observe(canvas);
    this.resize();
  }

  setState(state: GameState): void {
    this.state = state;
    const map = state.map;
    const placeAt = new Map<number, Place>();
    for (const p of map.places) placeAt.set(p.y * map.size + p.x, p);
    const baseAt = new Map<number, Faction>();
    for (const f of state.factions) baseAt.set(f.baseY * map.size + f.baseX, f);
    this.info = { map, placeAt, baseAt };
    this.buildCaches();
    this.buildStateLabels();
    this.refreshTerritory();
    this.selected = null;
  }

  /** 领地有变化时调用：重新计算"哪些地现在可以出征" */
  refreshTerritory(): void {
    if (!this.state) return;
    const map = this.state.map;
    const N = map.size;
    if (this.frontier.length !== N * N) this.frontier = new Uint8Array(N * N);
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        const i = y * N + x;
        this.frontier[i] = map.owner[i] === -1 && isOccupiable(map.terrain[i]) && isAdjacentTo(map, x, y, PLAYER) ? 1 : 0;
      }
    }
  }

  centerOn(x: number, y: number, zoom?: number): void {
    this.cam.x = x + 0.5;
    this.cam.y = y + 0.5;
    if (zoom) this.cam.zoom = zoom;
    this.clampCamera();
  }

  /** 以屏幕上的 (px,py) 为中心缩放；不给坐标则以画面中心缩放 */
  zoomBy(factor: number, px = this.w / 2, py = this.h / 2): void {
    const before = this.screenToWorld(px, py);
    this.cam.zoom = Math.max(this.minZoom(), Math.min(MAX_ZOOM, this.cam.zoom * factor));
    const after = this.screenToWorld(px, py);
    this.cam.x += before.x - after.x;
    this.cam.y += before.y - after.y;
    this.clampCamera();
  }

  /** 当前画面覆盖的地图范围（单位：格），小地图用 */
  viewRect(): { x0: number; y0: number; x1: number; y1: number } {
    const hw = this.w / 2 / this.cam.zoom;
    const hh = this.h / 2 / this.cam.zoom;
    return { x0: this.cam.x - hw, y0: this.cam.y - hh, x1: this.cam.x + hw, y1: this.cam.y + hh };
  }

  private minZoom(): number {
    const N = this.state?.map.size ?? 80;
    return Math.max(5, (Math.min(this.w, this.h) / N) * 0.92);
  }

  /** 把镜头中心移到地图坐标 (x,y)（单位：格，可以是小数） */
  setCenter(x: number, y: number): void {
    this.cam.x = x;
    this.cam.y = y;
    this.clampCamera();
  }

  /** 限制镜头：地图比画面小时居中；否则最多只能把地图边缘拖进画面一小段，不会把地图拖没 */
  private clampCamera(): void {
    const N = this.state?.map.size ?? 80;
    const z = Math.max(this.minZoom(), Math.min(MAX_ZOOM, this.cam.zoom));
    this.cam.zoom = z;
    // slack：为了能看到地图边缘，镜头需要偏离中心多远；extra：再多给一点余量，方便点到被面板挡住的边角
    const clampAxis = (value: number, half: number) => {
      const slack = Math.max(0, N / 2 - half);
      const extra = Math.min(260 / z, slack);
      return Math.max(N / 2 - slack - extra, Math.min(N / 2 + slack + extra, value));
    };
    this.cam.x = clampAxis(this.cam.x, this.w / 2 / z);
    this.cam.y = clampAxis(this.cam.y, this.h / 2 / z);
  }

  private screenToWorld(px: number, py: number): { x: number; y: number } {
    return {
      x: this.cam.x + (px - this.w / 2) / this.cam.zoom,
      y: this.cam.y + (py - this.h / 2) / this.cam.zoom,
    };
  }

  private screenToTile(px: number, py: number): { x: number; y: number } | null {
    const p = this.screenToWorld(px, py);
    const x = Math.floor(p.x);
    const y = Math.floor(p.y);
    const N = this.state?.map.size ?? 0;
    return x >= 0 && y >= 0 && x < N && y < N ? { x, y } : null;
  }

  private resize(): void {
    const rect = this.canvas.getBoundingClientRect();
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.w = Math.max(1, Math.round(rect.width));
    this.h = Math.max(1, Math.round(rect.height));
    this.canvas.width = Math.round(this.w * this.dpr);
    this.canvas.height = Math.round(this.h * this.dpr);
    this.clampCamera();
  }

  private bindInput(): void {
    const c = this.canvas;
    const pointers = new Map<number, { x: number; y: number }>();
    let moved = 0;
    let pinchDist = 0;

    const local = (e: PointerEvent | WheelEvent) => {
      const rect = c.getBoundingClientRect();
      return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    };

    c.addEventListener('pointerdown', (e) => {
      c.setPointerCapture(e.pointerId);
      pointers.set(e.pointerId, local(e));
      if (pointers.size === 1) moved = 0;
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        pinchDist = Math.hypot(a.x - b.x, a.y - b.y);
      }
    });

    c.addEventListener('pointermove', (e) => {
      const p = local(e);
      const prev = pointers.get(e.pointerId);
      if (!prev) {
        this.hover = this.screenToTile(p.x, p.y);
        return;
      }
      pointers.set(e.pointerId, p);
      if (pointers.size === 1) {
        const dx = p.x - prev.x;
        const dy = p.y - prev.y;
        moved += Math.abs(dx) + Math.abs(dy);
        if (moved > 4) {
          this.cam.x -= dx / this.cam.zoom;
          this.cam.y -= dy / this.cam.zoom;
          this.clampCamera();
          c.classList.add('dragging');
        }
      } else if (pointers.size === 2) {
        // 双指缩放（触摸屏）
        const [a, b] = [...pointers.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (pinchDist > 0 && d > 0) this.zoomBy(d / pinchDist, (a.x + b.x) / 2, (a.y + b.y) / 2);
        pinchDist = d;
        moved = 99;
      }
    });

    const up = (e: PointerEvent) => {
      if (!pointers.has(e.pointerId)) return;
      const wasSingle = pointers.size === 1;
      pointers.delete(e.pointerId);
      c.classList.remove('dragging');
      if (wasSingle && moved <= 4 && e.type === 'pointerup') {
        const p = local(e);
        const tile = this.screenToTile(p.x, p.y);
        if (tile) this.onSelect(tile.x, tile.y);
      }
    };
    c.addEventListener('pointerup', up);
    c.addEventListener('pointercancel', up);
    c.addEventListener('pointerleave', () => {
      this.hover = null;
    });

    c.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        const p = local(e);
        const delta = e.deltaMode === 1 ? e.deltaY * 33 : e.deltaY;
        this.zoomBy(Math.exp(-delta * 0.0015), p.x, p.y);
      },
      { passive: false },
    );
  }

  private buildCaches(): void {
    const info = this.info!;
    const N = info.map.size;
    const make = (cell: number, detail: boolean) => {
      const cv = document.createElement('canvas');
      cv.width = N * cell;
      cv.height = N * cell;
      const g = cv.getContext('2d')!;
      for (let y = 0; y < N; y++) {
        for (let x = 0; x < N; x++) drawTile(g, info, x, y, x * cell, y * cell, cell, detail);
      }
      return cv;
    };
    this.cacheNear = make(CELL, true);
    this.cacheFar = make(CELL_FAR, false);
  }

  private buildStateLabels(): void {
    const map = this.info!.map;
    const N = map.size;
    const sum = STATES.map(() => ({ x: 0, y: 0, n: 0 }));
    for (let i = 0; i < N * N; i++) {
      const s = sum[map.state[i]];
      s.x += i % N;
      s.y += Math.floor(i / N);
      s.n++;
    }
    this.stateLabels = STATES.map((st, k) => ({
      name: st.name,
      x: sum[k].x / Math.max(1, sum[k].n) + 0.5,
      // 司隶的中心就是洛阳，把州名往上挪一点避免重叠
      y: sum[k].y / Math.max(1, sum[k].n) + 0.5 - (k === 0 ? 5 : 0),
    }));
  }

  draw(): void {
    const { ctx, w, h } = this;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.fillStyle = COLORS.void;
    ctx.fillRect(0, 0, w, h);
    const state = this.state;
    const info = this.info;
    if (!state || !info) return;
    const map = state.map;
    const N = map.size;
    const z = this.cam.zoom;
    const ox = w / 2 - this.cam.x * z;
    const oy = h / 2 - this.cam.y * z;
    const x0 = Math.max(0, Math.floor(-ox / z));
    const y0 = Math.max(0, Math.floor(-oy / z));
    const x1 = Math.min(N - 1, Math.floor((w - ox) / z));
    const y1 = Math.min(N - 1, Math.floor((h - oy) / z));
    if (x1 < x0 || y1 < y0) return;

    // ---- 地形 ----
    if (z > CELL * 1.05) {
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) drawTile(ctx, info, x, y, Math.round(ox + x * z), Math.round(oy + y * z), Math.ceil(z), true);
      }
    } else {
      const far = z < 13;
      const cache = far ? this.cacheFar! : this.cacheNear!;
      const cell = far ? CELL_FAR : CELL;
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      const cols = x1 - x0 + 1;
      const rows = y1 - y0 + 1;
      ctx.drawImage(cache, x0 * cell, y0 * cell, cols * cell, rows * cell, ox + x0 * z, oy + y0 * z, cols * z, rows * z);
    }

    // ---- 州界 ----
    ctx.beginPath();
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const s = map.state[y * N + x];
        if (x + 1 < N && map.state[y * N + x + 1] !== s) {
          ctx.moveTo(ox + (x + 1) * z, oy + y * z);
          ctx.lineTo(ox + (x + 1) * z, oy + (y + 1) * z);
        }
        if (y + 1 < N && map.state[(y + 1) * N + x] !== s) {
          ctx.moveTo(ox + x * z, oy + (y + 1) * z);
          ctx.lineTo(ox + (x + 1) * z, oy + (y + 1) * z);
        }
      }
    }
    ctx.strokeStyle = 'rgba(18,10,4,0.6)';
    ctx.lineWidth = Math.max(1.5, z * 0.08);
    ctx.setLineDash([Math.max(3, z * 0.3), Math.max(2, z * 0.2)]);
    ctx.stroke();
    ctx.setLineDash([]);

    // ---- 领地颜色与边界 ----
    const bw = Math.max(2, z * 0.1);
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const i = y * N + x;
        const o = map.owner[i];
        if (o < 0) continue;
        const color = state.factions[o].color;
        const px = ox + x * z;
        const py = oy + y * z;
        ctx.fillStyle = color;
        if (map.terrain[i] !== Terrain.Base) {
          ctx.globalAlpha = 0.3;
          ctx.fillRect(px, py, z, z);
        }
        ctx.globalAlpha = 0.95;
        if (x === 0 || map.owner[i - 1] !== o) ctx.fillRect(px, py, bw, z);
        if (x === N - 1 || map.owner[i + 1] !== o) ctx.fillRect(px + z - bw, py, bw, z);
        if (y === 0 || map.owner[i - N] !== o) ctx.fillRect(px, py, z, bw);
        if (y === N - 1 || map.owner[i + N] !== o) ctx.fillRect(px, py + z - bw, z, bw);
      }
    }
    ctx.globalAlpha = 1;

    // ---- 可出征的地：四角加亮色角标 ----
    if (z >= 12) {
      ctx.strokeStyle = 'rgba(255,238,190,0.85)';
      ctx.lineWidth = Math.max(1, z * 0.05);
      const c = z * 0.24;
      const pad = Math.max(1.5, z * 0.07);
      ctx.beginPath();
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          if (!this.frontier[y * N + x]) continue;
          const l = ox + x * z + pad;
          const t = oy + y * z + pad;
          const r = ox + (x + 1) * z - pad;
          const b = oy + (y + 1) * z - pad;
          ctx.moveTo(l, t + c);
          ctx.lineTo(l, t);
          ctx.lineTo(l + c, t);
          ctx.moveTo(r - c, t);
          ctx.lineTo(r, t);
          ctx.lineTo(r, t + c);
          ctx.moveTo(r, b - c);
          ctx.lineTo(r, b);
          ctx.lineTo(r - c, b);
          ctx.moveTo(l + c, b);
          ctx.lineTo(l, b);
          ctx.lineTo(l, b - c);
        }
      }
      ctx.stroke();
    }

    // ---- 地图外框 ----
    ctx.strokeStyle = '#6b5236';
    ctx.lineWidth = 3;
    ctx.strokeRect(ox - 1.5, oy - 1.5, N * z + 3, N * z + 3);

    // ---- 州名 ----
    if (z <= 34) {
      const fs = Math.max(22, Math.min(84, z * 2.6));
      ctx.font = `${fs}px ${FONT_BRUSH}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineWidth = Math.max(2, fs * 0.08);
      ctx.strokeStyle = 'rgba(10,6,3,0.32)';
      ctx.fillStyle = 'rgba(255,244,214,0.42)';
      for (const l of this.stateLabels) {
        const px = ox + l.x * z;
        const py = oy + l.y * z;
        if (px < -fs * 2 || py < -fs || px > w + fs * 2 || py > h + fs) continue;
        ctx.strokeText(l.name, px, py);
        ctx.fillText(l.name, px, py);
      }
    }

    // ---- 行军 ----
    const base = state.factions[PLAYER];
    const bx = ox + (base.baseX + 0.5) * z;
    const by = oy + (base.baseY + 0.5) * z;
    for (const m of state.marches) {
      const tx = ox + (m.x + 0.5) * z;
      const ty = oy + (m.y + 0.5) * z;
      const going = m.phase === 'go';
      const p = going
        ? (state.time - m.start) / Math.max(0.001, m.arrive - m.start)
        : 1 - (state.time - m.arrive) / Math.max(0.001, m.back - m.arrive);
      const t = Math.max(0, Math.min(1, p));
      ctx.strokeStyle = going ? 'rgba(255,226,150,0.9)' : 'rgba(255,226,150,0.4)';
      ctx.lineWidth = Math.max(1.5, z * 0.07);
      ctx.setLineDash([Math.max(4, z * 0.25), Math.max(3, z * 0.18)]);
      ctx.beginPath();
      ctx.moveTo(bx, by);
      ctx.lineTo(tx, ty);
      ctx.stroke();
      ctx.setLineDash([]);
      if (going) {
        const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 180);
        ctx.strokeStyle = `rgba(230,70,50,${0.55 + pulse * 0.45})`;
        ctx.lineWidth = Math.max(2, z * 0.09);
        ctx.strokeRect(ox + m.x * z + 1, oy + m.y * z + 1, z - 2, z - 2);
      }
      // 队伍标记：一面小旗
      const mx = bx + (tx - bx) * t;
      const my = by + (ty - by) * t;
      const r = Math.max(5, z * 0.26);
      ctx.fillStyle = COLORS.ink;
      ctx.beginPath();
      ctx.arc(mx, my, r + 1.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = base.color;
      ctx.beginPath();
      ctx.arc(mx, my, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = COLORS.paper;
      ctx.beginPath();
      ctx.moveTo(mx - r * 0.35, my - r * 0.55);
      ctx.lineTo(mx + r * 0.6, my - r * 0.15);
      ctx.lineTo(mx - r * 0.35, my + r * 0.25);
      ctx.fill();
      ctx.fillRect(mx - r * 0.45, my - r * 0.6, Math.max(1, r * 0.14), r * 1.25);
    }

    // ---- 城池、关卡、主城的名字 ----
    const fs = Math.max(12, Math.min(26, z * 0.56));
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.lineJoin = 'round';
    const label = (text: string, tx: number, ty: number, color: string, size: number) => {
      const px = ox + (tx + 0.5) * z;
      const py = oy + (ty + 1) * z + 1;
      if (px < -80 || py < -40 || px > w + 80 || py > h + 10) return;
      ctx.font = `${size}px ${FONT_BRUSH}`;
      ctx.lineWidth = Math.max(3, size * 0.22);
      ctx.strokeStyle = 'rgba(12,8,5,0.88)';
      ctx.strokeText(text, px, py);
      ctx.fillStyle = color;
      ctx.fillText(text, px, py);
    };
    for (const p of map.places) {
      if (z < 9 && (p.kind === 'town' || p.kind === 'pass')) continue;
      const color = p.kind === 'capital' ? COLORS.gold : p.kind === 'pass' ? '#d9c9a8' : COLORS.paper;
      label(p.name, p.x, p.y, color, p.kind === 'capital' ? fs * 1.25 : fs);
    }
    for (const f of state.factions) label(f.isPlayer ? `${f.name}·主城` : f.name, f.baseX, f.baseY, f.color, fs);

    // ---- 鼠标悬停与选中 ----
    if (this.hover) {
      ctx.strokeStyle = 'rgba(255,255,255,0.55)';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(ox + this.hover.x * z + 0.75, oy + this.hover.y * z + 0.75, z - 1.5, z - 1.5);
    }
    if (this.selected) {
      const px = ox + this.selected.x * z;
      const py = oy + this.selected.y * z;
      ctx.strokeStyle = COLORS.ink;
      ctx.lineWidth = 5;
      ctx.strokeRect(px, py, z, z);
      ctx.strokeStyle = COLORS.gold;
      ctx.lineWidth = 2.5;
      ctx.strokeRect(px, py, z, z);
    }
  }
}
