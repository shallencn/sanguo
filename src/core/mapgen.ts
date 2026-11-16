// 地图生成：给一个种子，生成 80×80 的大地图。同一个种子永远生成同一张图。
//
// 生成顺序：
//   1. 划分州：正中一圈是司隶，外面按方位切成 8 个州，边界用噪声扰动成不规则形状
//   2. 山地：噪声成片生成；司隶外面围一圈山，只在四个方向留关卡
//   3. 河流：北有黄河、南有长江，横贯东西，每隔一段有渡口
//   4. 城池、关卡、各州的出生点
//   5. 连通性检查：保证司隶以外所有可占领的地能连成一片（被山围死的小块填成山，大块凿开）
//   6. 土地等级和资源类型：越靠近洛阳等级越高，资源成片分布

import { CONFIG } from '../data/config';
import { PASSES, STATES } from '../data/states';
import { Rng, makeNoise } from './rng';
import { Terrain, type GameMap, type Place } from './types';

export interface StartSite {
  state: number;
  x: number;
  y: number;
}

export interface MapGenResult {
  map: GameMap;
  /** 外围 8 个州各一个出生点 */
  starts: StartSite[];
}

const DIRS4: [number, number][] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

/** 司隶的大致半径 */
const CENTER_RADIUS = 12.5;

export function isOccupiableTerrain(t: number): boolean {
  return t === Terrain.Plain || t === Terrain.Ferry;
}

export function generateMap(seed: number): MapGenResult {
  const N = CONFIG.mapSize;
  const C = N / 2;
  const rng = new Rng(seed);
  const nBorder = makeNoise(seed + 11);
  const nMountain = makeNoise(seed + 23);
  const nLevel = makeNoise(seed + 37);
  const nRes = [makeNoise(seed + 41), makeNoise(seed + 43), makeNoise(seed + 47), makeNoise(seed + 53)];

  const size = N * N;
  const terrain = new Array<number>(size).fill(Terrain.Plain);
  const level = new Array<number>(size).fill(0);
  const res = new Array<number>(size).fill(0);
  const state = new Array<number>(size).fill(0);
  const ring = new Array<boolean>(size).fill(false);
  /** 受保护的地块：不会被"填成山"，所在的小块一定会被凿通 */
  const keep = new Array<boolean>(size).fill(false);
  const places: Place[] = [];

  const idx = (x: number, y: number) => y * N + x;
  const inMap = (x: number, y: number) => x >= 0 && y >= 0 && x < N && y < N;
  const dist = (x: number, y: number) => Math.hypot(x - C, y - C);

  // ---- 1. 划分州 ----
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const dx = x - C;
      const dy = y - C;
      const angle = Math.atan2(dy, dx);
      // 靠近正东南西北四条轴线的地方不加扰动，让关卡附近的边界规整
      const toAxis = Math.abs(((angle / (Math.PI / 2)) % 1 + 1.5) % 1 - 0.5) * (Math.PI / 2);
      const wobble = Math.min(1, toAxis / 0.45);
      const radius = CENTER_RADIUS + (nBorder(x / 8, y / 8) - 0.5) * 5 * wobble;
      if (Math.hypot(dx, dy) < radius) {
        state[idx(x, y)] = 0;
        continue;
      }
      const a = angle + (nBorder(x / 13 + 50, y / 13 + 50) - 0.5) * 0.9;
      const sector = ((Math.round(a / (Math.PI / 4)) % 8) + 8) % 8;
      state[idx(x, y)] = 1 + sector;
    }
  }

  // ---- 2. 山地 ----
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const i = idx(x, y);
      const threshold = state[i] === 0 ? 0.68 : 0.63;
      if (nMountain(x / 6, y / 6) > threshold) terrain[i] = Terrain.Mountain;
    }
  }
  // 司隶外围的环形山：凡是贴着司隶的外州地块都是山
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const i = idx(x, y);
      if (state[i] === 0) continue;
      let touch = false;
      for (let oy = -1; oy <= 1 && !touch; oy++) {
        for (let ox = -1; ox <= 1; ox++) {
          if (inMap(x + ox, y + oy) && state[idx(x + ox, y + oy)] === 0) {
            touch = true;
            break;
          }
        }
      }
      if (touch) {
        terrain[i] = Terrain.Mountain;
        ring[i] = true;
      }
    }
  }

  // ---- 3. 河流 ----
  const riverBands: [number, number][] = [
    [16, 22],
    [58, 64],
  ];
  for (const [lo, hi] of riverBands) {
    const mid = Math.round((lo + hi) / 2);
    let y = mid + rng.int(-1, 1);
    const ys: number[] = [];
    for (let x = 0; x < N; x++) {
      terrain[idx(x, y)] = Terrain.River;
      ys.push(y);
      if (rng.next() < 0.16) {
        // 偏离中线越远，越倾向于拐回来
        const back = y > mid ? -1 : y < mid ? 1 : rng.next() < 0.5 ? -1 : 1;
        const step = rng.next() < 0.7 ? back : -back;
        const ny = Math.max(lo, Math.min(hi, y + step));
        if (ny !== y) {
          terrain[idx(x, ny)] = Terrain.River; // 拐弯处补一格，河道不留斜向缝隙
          y = ny;
        }
      }
    }
    // 渡口：每隔 9~13 格一个，选河道平直的位置
    let fx = rng.int(4, 8);
    while (fx < N - 3) {
      let placed = false;
      for (const off of [0, 1, -1, 2, -2, 3, -3]) {
        const x = fx + off;
        if (x < 2 || x > N - 3) continue;
        const ry = ys[x];
        if (ys[x - 1] !== ry || ys[x + 1] !== ry) continue;
        if (terrain[idx(x, ry - 1)] === Terrain.River || terrain[idx(x, ry + 1)] === Terrain.River) continue;
        terrain[idx(x, ry)] = Terrain.Ferry;
        for (const sy of [ry - 1, ry + 1]) {
          const j = idx(x, sy);
          terrain[j] = Terrain.Plain;
          keep[j] = true;
        }
        placed = true;
        break;
      }
      fx += placed ? rng.int(9, 13) : 4;
    }
  }

  // ---- 4. 城池、关卡、出生点 ----
  const taken: { x: number; y: number }[] = [];

  /** 清出一块 3×3 的平地 */
  const clearAround = (cx: number, cy: number) => {
    for (let oy = -1; oy <= 1; oy++) {
      for (let ox = -1; ox <= 1; ox++) {
        const j = idx(cx + ox, cy + oy);
        if (terrain[j] === Terrain.Mountain) terrain[j] = Terrain.Plain;
        keep[j] = true;
      }
    }
  };

  /** 在理想位置附近找一块合适的地方：3×3 范围内都属于本州，没有河流、关卡、别的城 */
  const findSite = (ix: number, iy: number, st: number, minDist: number): { x: number; y: number } => {
    let best: { x: number; y: number } | null = null;
    let bestD = Infinity;
    for (let y = 2; y < N - 2; y++) {
      for (let x = 2; x < N - 2; x++) {
        const d = Math.hypot(x - ix, y - iy);
        if (d >= bestD) continue;
        if (taken.some((t) => Math.hypot(t.x - x, t.y - y) < minDist)) continue;
        let ok = true;
        for (let oy = -1; oy <= 1 && ok; oy++) {
          for (let ox = -1; ox <= 1; ox++) {
            const j = idx(x + ox, y + oy);
            const t = terrain[j];
            if (state[j] !== st || ring[j] || (t !== Terrain.Plain && t !== Terrain.Mountain)) {
              ok = false;
              break;
            }
          }
        }
        if (!ok) continue;
        best = { x, y };
        bestD = d;
      }
    }
    if (!best) throw new Error(`地图生成失败：${STATES[st].name} 找不到合适的位置`);
    taken.push(best);
    return best;
  };

  const rotate = (ux: number, uy: number, rad: number, len: number): [number, number] => {
    const l = Math.hypot(ux, uy);
    const a = Math.atan2(uy / l, ux / l) + rad;
    return [C + Math.cos(a) * len, C + Math.sin(a) * len];
  };

  // 洛阳在正中
  taken.push({ x: C, y: C });
  clearAround(C, C);
  terrain[idx(C, C)] = Terrain.City;
  places.push({ kind: 'capital', name: STATES[0].capital, x: C, y: C, state: 0 });
  // 长安在司隶西侧
  {
    const s = findSite(C - 8, C + 1, 0, 5);
    clearAround(s.x, s.y);
    terrain[idx(s.x, s.y)] = Terrain.City;
    places.push({ kind: 'town', name: STATES[0].town, x: s.x, y: s.y, state: 0 });
  }

  const starts: StartSite[] = [];
  for (const st of STATES) {
    if (!st.dir) continue;
    const [ux, uy] = st.dir;
    const [cx, cy] = rotate(ux, uy, -0.2, 21);
    const cap = findSite(cx, cy, st.id, 6);
    clearAround(cap.x, cap.y);
    terrain[idx(cap.x, cap.y)] = Terrain.City;
    places.push({ kind: 'city', name: st.capital, x: cap.x, y: cap.y, state: st.id });

    const [tx, ty] = rotate(ux, uy, 0.42, 28);
    const town = findSite(tx, ty, st.id, 6);
    clearAround(town.x, town.y);
    terrain[idx(town.x, town.y)] = Terrain.City;
    places.push({ kind: 'town', name: st.town, x: town.x, y: town.y, state: st.id });

    const [sx, sy] = rotate(ux, uy, -0.32, 33);
    const start = findSite(sx, sy, st.id, 7);
    clearAround(start.x, start.y);
    starts.push({ state: st.id, x: start.x, y: start.y });
  }

  // 关卡：从洛阳沿四个方向走出去，碰到的第一格环形山改成关卡
  for (const p of PASSES) {
    const [ux, uy] = p.dir;
    for (let k = 1; k < C; k++) {
      const x = C + ux * k;
      const y = C + uy * k;
      const i = idx(x, y);
      if (state[i] === 0) continue;
      terrain[i] = Terrain.Pass;
      places.push({ kind: 'pass', name: p.name, x, y, state: state[i] });
      // 关内一格、关外两格清成平地
      const inner = idx(x - ux, y - uy);
      if (terrain[inner] === Terrain.Mountain) terrain[inner] = Terrain.Plain;
      keep[inner] = true;
      for (let o = 1; o <= 2; o++) {
        const j = idx(x + ux * o, y + uy * o);
        if (terrain[j] === Terrain.Mountain && !ring[j]) terrain[j] = Terrain.Plain;
        if (terrain[j] === Terrain.Plain) keep[j] = true;
      }
      break;
    }
  }

  // ---- 5. 连通性 ----
  // 分"司隶内"和"司隶外"两个区域分别处理：区域内所有可占领的地要连成一片。
  const connectZone = (inZone: (i: number) => boolean) => {
    for (let pass = 0; pass < 60; pass++) {
      const comp = new Array<number>(size).fill(-1);
      const comps: number[][] = [];
      for (let i = 0; i < size; i++) {
        if (comp[i] !== -1 || !inZone(i) || !isOccupiableTerrain(terrain[i])) continue;
        const id = comps.length;
        const list: number[] = [i];
        comp[i] = id;
        for (let h = 0; h < list.length; h++) {
          const cur = list[h];
          const cx = cur % N;
          const cy = (cur - cx) / N;
          for (const [ox, oy] of DIRS4) {
            const nx = cx + ox;
            const ny = cy + oy;
            if (!inMap(nx, ny)) continue;
            const j = idx(nx, ny);
            if (comp[j] !== -1 || !inZone(j) || !isOccupiableTerrain(terrain[j])) continue;
            comp[j] = id;
            list.push(j);
          }
        }
        comps.push(list);
      }
      if (comps.length <= 1) return;
      let main = 0;
      for (let c = 1; c < comps.length; c++) if (comps[c].length > comps[main].length) main = c;

      let changed = false;
      for (let c = 0; c < comps.length; c++) {
        if (c === main) continue;
        const list = comps[c];
        const important = list.length >= 8 || list.some((i) => keep[i]);
        let carved = false;
        if (important) {
          // 穿过山地（不含环形山）找一条通到主区域的最短路，把路上的山凿成平地
          const prev = new Map<number, number>();
          const queue = [...list];
          for (const i of list) prev.set(i, -1);
          let hit = -1;
          for (let h = 0; h < queue.length && hit === -1; h++) {
            const cur = queue[h];
            const cx = cur % N;
            const cy = (cur - cx) / N;
            for (const [ox, oy] of DIRS4) {
              const nx = cx + ox;
              const ny = cy + oy;
              if (!inMap(nx, ny)) continue;
              const j = idx(nx, ny);
              if (prev.has(j) || !inZone(j)) continue;
              if (comp[j] === main) {
                hit = cur;
                break;
              }
              if (terrain[j] !== Terrain.Mountain || ring[j]) continue;
              prev.set(j, cur);
              queue.push(j);
            }
          }
          if (hit !== -1) {
            for (let cur = hit; cur !== -1; cur = prev.get(cur)!) {
              if (terrain[cur] === Terrain.Mountain) terrain[cur] = Terrain.Plain;
            }
            carved = true;
          }
        }
        if (!carved) {
          for (const i of list) {
            // 渡口被围死时退回成河流，其余填成山
            terrain[i] = terrain[i] === Terrain.Ferry ? Terrain.River : Terrain.Mountain;
          }
        }
        changed = true;
        if (carved) break; // 凿通后重新计算一遍
      }
      if (!changed) return;
    }
  };
  connectZone((i) => state[i] !== 0);
  connectZone((i) => state[i] === 0);

  // ---- 6. 土地等级与资源类型 ----
  const cityTiles = places.filter((p) => p.kind !== 'pass');
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const i = idx(x, y);
      const t = terrain[i];
      if (t === Terrain.Mountain || t === Terrain.River) {
        level[i] = 0;
        continue;
      }
      const d = dist(x, y);
      const jitter = (nLevel(x / 4, y / 4) - 0.5) * 3.2;
      let lv: number;
      if (state[i] === 0) {
        lv = Math.round(6.5 + (1 - d / CENTER_RADIUS) * 2.5 + jitter * 0.6);
        lv = Math.max(6, Math.min(9, lv));
      } else {
        const far = Math.max(0, Math.min(1, (d - CENTER_RADIUS) / (46 - CENTER_RADIUS)));
        lv = Math.round(6.4 - far * 5.4 + jitter);
        // 城池周围的地高一级
        if (cityTiles.some((p) => Math.abs(p.x - x) <= 2 && Math.abs(p.y - y) <= 2)) lv += 1;
        lv = Math.max(1, Math.min(7, lv));
      }
      level[i] = lv;

      let bestRes = 0;
      let bestVal = -1;
      for (let r = 0; r < 4; r++) {
        const v = nRes[r](x / 5, y / 5) + rng.next() * 0.06;
        if (v > bestVal) {
          bestVal = v;
          bestRes = r;
        }
      }
      res[i] = bestRes;
    }
  }
  // 城池和关卡自身的等级（守军强度用，第四阶段生效）
  for (const p of places) {
    const i = idx(p.x, p.y);
    level[i] = p.kind === 'capital' ? 9 : p.kind === 'city' ? 8 : p.kind === 'pass' ? 7 : state[i] === 0 ? 8 : 6;
  }
  // 出生点周围：紧挨着的一圈是 1~2 级地，再外一圈不超过 3 级，四种资源都有
  for (const s of starts) {
    let n = 0;
    for (let oy = -2; oy <= 2; oy++) {
      for (let ox = -2; ox <= 2; ox++) {
        if (ox === 0 && oy === 0) continue;
        const x = s.x + ox;
        const y = s.y + oy;
        if (!inMap(x, y)) continue;
        const i = idx(x, y);
        if (terrain[i] !== Terrain.Plain) continue;
        if (Math.abs(ox) <= 1 && Math.abs(oy) <= 1) {
          level[i] = n % 3 === 2 ? 2 : 1;
          res[i] = n % 4;
          n++;
        } else {
          level[i] = Math.min(level[i], 3);
        }
      }
    }
  }

  const map: GameMap = {
    size: N,
    terrain,
    level,
    res,
    state,
    owner: new Array<number>(size).fill(-1),
    famed: new Array<number>(size).fill(0),
    places,
  };
  return { map, starts };
}
