// 开新局，以及"让时间往前走"的主循环。

import { BUILDINGS } from '../data/buildings';
import { CONFIG } from '../data/config';
import { AI_FACTION_BY_STATE, AI_FACTION_COUNT, PLAYER_FACTION } from '../data/factions';
import { STATES } from '../data/states';
import { finishBuilds } from './buildings';
import { produce } from './economy';
import { addLog } from './log';
import { generateMap } from './mapgen';
import { Rng } from './rng';
import { updateMarches } from './territory';
import { Terrain, type Faction, type GameState } from './types';

export const SAVE_VERSION = 1;

export interface NewGameOptions {
  seed: number;
  /** 出生州编号 1~8；不填则随机 */
  startState?: number;
  /** 玩家势力名 */
  name?: string;
}

export function newGame(opts: NewGameOptions): GameState {
  const { map, starts } = generateMap(opts.seed);
  const rng = new Rng(opts.seed ^ 0x5bd1e995);
  const N = map.size;

  const playerStart = starts.find((s) => s.state === opts.startState) ?? rng.pick(starts);
  // 电脑势力：从其余的州里随机挑几个
  const others = rng.shuffle(starts.filter((s) => s !== playerStart)).slice(0, AI_FACTION_COUNT);

  const factions: Faction[] = [
    {
      id: 0,
      name: opts.name?.trim() || PLAYER_FACTION.name,
      color: PLAYER_FACTION.color,
      isPlayer: true,
      baseX: playerStart.x,
      baseY: playerStart.y,
      state: playerStart.state,
    },
  ];
  others.forEach((s, k) => {
    factions.push({
      id: k + 1,
      name: AI_FACTION_BY_STATE[s.state].name,
      color: AI_FACTION_BY_STATE[s.state].color,
      isPlayer: false,
      baseX: s.x,
      baseY: s.y,
      state: s.state,
    });
  });

  for (const f of factions) {
    const i = f.baseY * N + f.baseX;
    map.terrain[i] = Terrain.Base;
    map.owner[i] = f.id;
    map.level[i] = 5;
    if (!f.isPlayer) {
      // 电脑势力开局自带主城周围一圈地（第四阶段才会开始行动）
      for (let oy = -1; oy <= 1; oy++) {
        for (let ox = -1; ox <= 1; ox++) {
          const j = (f.baseY + oy) * N + (f.baseX + ox);
          if (map.terrain[j] === Terrain.Plain) map.owner[j] = f.id;
        }
      }
    }
  }

  const buildings: Record<string, number> = {};
  for (const b of BUILDINGS) buildings[b.id] = b.initialLevel ?? 0;

  const state: GameState = {
    version: SAVE_VERSION,
    seed: opts.seed,
    time: 0,
    speed: 1,
    map,
    factions,
    resources: { ...CONFIG.initialResources },
    fame: 0,
    buildings,
    buildQueue: [],
    marches: [],
    nextMarchId: 1,
    log: [],
  };
  addLog(state, `${factions[0].name}在${STATES[playerStart.state].name}起兵`, 'info');
  return state;
}

/** 下一件"到点要处理的事"的时刻 */
function nextEventTime(state: GameState): number {
  let t = Infinity;
  for (const b of state.buildQueue) t = Math.min(t, b.end);
  for (const m of state.marches) t = Math.min(t, m.phase === 'go' ? m.arrive : m.back);
  return t;
}

/**
 * 让游戏时间前进 seconds 秒。
 * 会精确地停在每个事件（建造完成、行军到达）发生的时刻处理它，所以不管倍速多快结果都一样。
 */
export function advance(state: GameState, seconds: number): void {
  let remain = seconds;
  let guard = 0;
  while (remain > 1e-9 && guard++ < 10000) {
    const step = Math.min(remain, Math.max(0, nextEventTime(state) - state.time));
    produce(state, step);
    state.time += step;
    remain -= step;
    finishBuilds(state);
    updateMarches(state);
  }
}

/** 把游戏秒数显示成"第 N 日 时:分"（游戏里 1 日 = 现实 1 倍速下的 10 分钟） */
export function formatClock(time: number): string {
  const day = Math.floor(time / 600) + 1;
  const dayPart = (time % 600) / 600;
  const hour = Math.floor(dayPart * 24);
  const minute = Math.floor((dayPart * 24 - hour) * 60);
  return `第 ${day} 日 ${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}
