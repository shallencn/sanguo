// 存档：把游戏状态变成一段文字（JSON），以及从文字读回来。
// 地图的每个数组压成一行字符，存档大约几十 KB。

import { SAVE_VERSION } from './game';
import type { GameMap, GameState } from './types';

const KEY = 'sanguo.save';

interface PackedMap {
  size: number;
  terrain: string;
  level: string;
  res: string;
  state: string;
  owner: string;
  famed: string;
  places: GameMap['places'];
}

const digits = (list: number[]) => list.join('');
const undigits = (s: string) => Array.from(s, (c) => c.charCodeAt(0) - 48);
// 占领者：'.' 表示无主，'a' 起依次是 0 号、1 号…势力
const packOwner = (list: number[]) => list.map((o) => (o < 0 ? '.' : String.fromCharCode(97 + o))).join('');
const unpackOwner = (s: string) => Array.from(s, (c) => (c === '.' ? -1 : c.charCodeAt(0) - 97));

export function serialize(state: GameState): string {
  const m = state.map;
  const packed: PackedMap = {
    size: m.size,
    terrain: digits(m.terrain),
    level: digits(m.level),
    res: digits(m.res),
    state: digits(m.state),
    owner: packOwner(m.owner),
    famed: digits(m.famed),
    places: m.places,
  };
  return JSON.stringify({ ...state, map: packed, savedAt: new Date().toISOString() });
}

export function deserialize(text: string): GameState {
  let raw: any;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error('存档文件无法读取（不是有效的存档格式）');
  }
  if (!raw || typeof raw !== 'object' || typeof raw.version !== 'number' || !raw.map) {
    throw new Error('存档文件无法读取（缺少必要内容）');
  }
  if (raw.version > SAVE_VERSION) {
    throw new Error('这个存档来自更新版本的游戏，当前版本无法读取');
  }
  const p = raw.map as PackedMap;
  const cells = p.size * p.size;
  const map: GameMap = {
    size: p.size,
    terrain: undigits(p.terrain),
    level: undigits(p.level),
    res: undigits(p.res),
    state: undigits(p.state),
    owner: unpackOwner(p.owner),
    famed: undigits(p.famed),
    places: p.places,
  };
  for (const key of ['terrain', 'level', 'res', 'state', 'owner', 'famed'] as const) {
    if (map[key].length !== cells) throw new Error('存档文件已损坏（地图数据不完整）');
  }
  const { savedAt: _savedAt, ...rest } = raw;
  const state = { ...rest, map } as GameState;
  // 以后存档格式升级时，在这里把旧版本转换成新版本
  state.version = SAVE_VERSION;
  return state;
}

export function saveToBrowser(state: GameState): boolean {
  try {
    localStorage.setItem(KEY, serialize(state));
    return true;
  } catch {
    return false;
  }
}

export function loadFromBrowser(): GameState | null {
  try {
    const text = localStorage.getItem(KEY);
    return text ? deserialize(text) : null;
  } catch {
    return null;
  }
}

export function clearBrowserSave(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* 浏览器禁用了本地存储时忽略 */
  }
}
