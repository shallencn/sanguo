import { describe, expect, test } from 'vitest';
import { BUILDINGS, buildingDef } from '../src/data/buildings';
import { CONFIG } from '../src/data/config';
import { landLevel } from '../src/data/lands';
import { checkUpgrade, effectAt, effectTotal, requiredHall, startUpgrade, upgradeCost, upgradeTime } from '../src/core/buildings';
import { storageCap, yieldRates } from '../src/core/economy';
import { advance, newGame } from '../src/core/game';
import { deserialize, serialize } from '../src/core/save';
import {
  abandon,
  checkAttack,
  dispatch,
  idleTeams,
  marchSeconds,
  teamCount,
  territoryCap,
  territoryCount,
} from '../src/core/territory';
import { PLAYER, Terrain, type GameState } from '../src/core/types';

function fresh(seed = 7): GameState {
  return newGame({ seed, startState: 3 });
}

/** 给足资源，方便测试建造 */
function rich(state: GameState): GameState {
  state.resources = { wood: 1e6, iron: 1e6, stone: 1e6, grain: 1e6, copper: 1e6 };
  return state;
}

describe('开局', () => {
  test('玩家在指定的州起兵，另有 4 个电脑势力分布在不同的州', () => {
    const s = fresh();
    expect(s.factions.length).toBe(5);
    expect(s.factions[0].state).toBe(3);
    expect(new Set(s.factions.map((f) => f.state)).size).toBe(5);
    const base = s.factions[0];
    const i = base.baseY * s.map.size + base.baseX;
    expect(s.map.terrain[i]).toBe(Terrain.Base);
    expect(s.map.owner[i]).toBe(PLAYER);
    expect(territoryCount(s)).toBe(0);
    expect(s.resources).toEqual(CONFIG.initialResources);
  });
});

describe('资源', () => {
  test('按每分钟产量增长', () => {
    const s = fresh();
    const rates = yieldRates(s);
    expect(rates.wood).toBe(CONFIG.baseYieldPerMin.wood + 4); // 主城基础 + 议政厅 1 级
    const before = s.resources.wood;
    advance(s, 60);
    expect(s.resources.wood).toBeCloseTo(before + rates.wood, 5);
    expect(s.time).toBe(60);
  });

  test('四种资源不超过上限，铜币不设上限', () => {
    const s = fresh();
    advance(s, 3600 * 30);
    expect(s.resources.wood).toBe(storageCap(s, 'wood'));
    expect(s.resources.copper).toBeGreaterThan(CONFIG.baseStorage);
  });

  test('分多次推进和一次推进结果相同（倍速不影响结果）', () => {
    const a = rich(fresh());
    const b = rich(fresh());
    for (const s of [a, b]) {
      startUpgrade(s, 'lumber');
      const base = s.factions[0];
      dispatch(s, base.baseX + 1, base.baseY);
    }
    advance(a, 100);
    for (let k = 0; k < 1000; k++) advance(b, 0.1);
    expect(b.time).toBeCloseTo(a.time, 6);
    expect(b.buildings).toEqual(a.buildings);
    expect(b.map.owner).toEqual(a.map.owner);
    expect(b.fame).toBe(a.fame);
  });
});

describe('建筑', () => {
  test('花费与耗时按公式增长', () => {
    const hall = buildingDef('hall');
    expect(upgradeCost(hall, 1)).toEqual({ wood: 300, iron: 200, stone: 400, grain: 200 });
    expect(upgradeCost(hall, 2)).toEqual({ wood: 450, iron: 300, stone: 600, grain: 300 });
    expect(upgradeTime(hall, 1)).toBe(10);
    expect(upgradeTime(hall, 3)).toBe(23);
  });

  test('升级扣资源、到时间后生效', () => {
    const s = fresh();
    const before = { ...s.resources };
    expect(startUpgrade(s, 'lumber').ok).toBe(true);
    expect(s.resources.iron).toBe(before.iron - 120);
    expect(s.buildings.lumber).toBe(0);
    advance(s, 5.9);
    expect(s.buildings.lumber).toBe(0);
    advance(s, 0.2);
    expect(s.buildings.lumber).toBe(1);
    expect(yieldRates(s).wood).toBe(CONFIG.baseYieldPerMin.wood + 4 + 12);
  });

  test('其他建筑不能超过议政厅等级', () => {
    const s = rich(fresh());
    startUpgrade(s, 'lumber');
    advance(s, 100);
    expect(checkUpgrade(s, 'lumber')).toEqual({ ok: false, reason: '需要议政厅 2 级' });
    startUpgrade(s, 'hall');
    advance(s, 100);
    expect(checkUpgrade(s, 'lumber').ok).toBe(true);
  });

  test('建造队列有上限，资源不足不能升级', () => {
    const s = rich(fresh());
    expect(startUpgrade(s, 'lumber').ok).toBe(true);
    expect(startUpgrade(s, 'farm').ok).toBe(true);
    expect(startUpgrade(s, 'quarry')).toEqual({ ok: false, reason: '建造队列已满' });
    const poor = fresh();
    poor.resources.wood = 0;
    expect(startUpgrade(poor, 'storehouse')).toEqual({ ok: false, reason: '木材不足' });
  });

  test('点将台增加队伍数，最多 5 队', () => {
    const s = rich(fresh());
    expect(teamCount(s)).toBe(1);
    s.buildings.hall = 10;
    for (let k = 0; k < 4; k++) {
      expect(startUpgrade(s, 'rally').ok).toBe(true);
      advance(s, 1000);
    }
    expect(teamCount(s)).toBe(5);
    expect(checkUpgrade(s, 'rally').reason).toBe('已满级');
  });

  test('数据表自检：每一级都造得起（花费不超过当时能达到的资源上限）', () => {
    for (const def of BUILDINGS) {
      for (let lv = 1; lv <= def.maxLevel; lv++) {
        // 升到 lv 级时，议政厅至少是 requiredHall 级，府库最多能到同样的等级
        const hall = Math.max(1, def.id === 'hall' ? lv - 1 : requiredHall(def, lv));
        const cap = CONFIG.baseStorage + effectAt(buildingDef('storehouse'), 'storage', hall);
        const cost = upgradeCost(def, lv);
        for (const r of ['wood', 'iron', 'stone', 'grain'] as const) {
          expect(cost[r] ?? 0, `${def.name} ${lv} 级的 ${r}`).toBeLessThanOrEqual(cap);
        }
        expect(upgradeTime(def, lv)).toBeLessThanOrEqual(600);
      }
    }
    expect(effectTotal(fresh(), 'troopCap')).toBe(1000);
  });
});

describe('领地', () => {
  test('只能出征与自己领地相邻的地', () => {
    const s = fresh();
    const { baseX: bx, baseY: by } = s.factions[0];
    expect(checkAttack(s, bx + 1, by).ok).toBe(true);
    expect(checkAttack(s, bx + 2, by)).toEqual({ ok: false, reason: '不与我方领地相邻' });
    expect(checkAttack(s, bx + 1, by + 1).reason).toBe('不与我方领地相邻'); // 斜角不算相邻
    expect(checkAttack(s, bx, by).reason).toBe('已是我方领地');
  });

  test('行军到达后占领，获得声望和产量；队伍回城后才空闲', () => {
    const s = fresh();
    const { baseX: bx, baseY: by } = s.factions[0];
    const i = by * s.map.size + bx + 1;
    const secs = marchSeconds(s, bx + 1, by);
    expect(secs).toBe(CONFIG.marchMinSeconds);
    const before = yieldRates(s);
    expect(dispatch(s, bx + 1, by).ok).toBe(true);
    expect(idleTeams(s)).toBe(0);
    expect(checkAttack(s, bx - 1, by).reason).toBe('没有空闲队伍');
    advance(s, secs - 0.5);
    expect(s.map.owner[i]).toBe(-1);
    advance(s, 1);
    expect(s.map.owner[i]).toBe(PLAYER);
    expect(territoryCount(s)).toBe(1);
    const lv = landLevel(s.map.level[i]);
    expect(s.fame).toBe(lv.fame);
    const after = yieldRates(s);
    const gained = (['wood', 'iron', 'stone', 'grain'] as const).reduce((n, r) => n + after[r] - before[r], 0);
    expect(gained).toBe(lv.yieldPerMin);
    expect(idleTeams(s)).toBe(0); // 还在回城路上
    advance(s, secs);
    expect(idleTeams(s)).toBe(1);
    // 占了一块之后，隔一格的地变成相邻了
    expect(checkAttack(s, bx + 2, by).ok).toBe(true);
  });

  test('领地数量有上限，随声望增长；放弃后可以再占，但声望只给一次', () => {
    const s = fresh();
    const { baseX: bx, baseY: by } = s.factions[0];
    expect(territoryCap(s)).toBe(CONFIG.territoryCapBase);
    s.fame = 125;
    expect(territoryCap(s)).toBe(CONFIG.territoryCapBase + 2);
    s.fame = 0;

    dispatch(s, bx + 1, by);
    advance(s, 20);
    const fame = s.fame;
    expect(fame).toBeGreaterThan(0);
    expect(abandon(s, bx + 1, by).ok).toBe(true);
    expect(territoryCount(s)).toBe(0);
    expect(abandon(s, bx, by).reason).toBe('主城不能放弃');
    dispatch(s, bx + 1, by);
    advance(s, 20);
    expect(territoryCount(s)).toBe(1);
    expect(s.fame).toBe(fame);

    // 把上限压到 1：已经占满，不能再出征
    s.fame = 0;
    (CONFIG as { territoryCapBase: number }).territoryCapBase = 1;
    try {
      expect(checkAttack(s, bx - 1, by).reason).toContain('领地已达上限');
    } finally {
      (CONFIG as { territoryCapBase: number }).territoryCapBase = 8;
    }
  });

  test('山、河、城池、关卡、电脑势力的地现在都不能出征', () => {
    const s = fresh();
    const N = s.map.size;
    const find = (t: number) => {
      const i = s.map.terrain.indexOf(t);
      return [i % N, Math.floor(i / N)] as const;
    };
    expect(checkAttack(s, ...find(Terrain.Mountain)).reason).toBe('此地无法通行');
    expect(checkAttack(s, ...find(Terrain.River)).reason).toBe('此地无法通行');
    expect(checkAttack(s, ...find(Terrain.City)).ok).toBe(false);
    expect(checkAttack(s, ...find(Terrain.Pass)).ok).toBe(false);
    const ai = s.factions[1];
    expect(checkAttack(s, ai.baseX + 1, ai.baseY).ok).toBe(false);
  });
});

describe('存档', () => {
  test('存下来再读回去，内容完全一样，并且能继续玩', () => {
    const s = rich(fresh());
    const { baseX: bx, baseY: by } = s.factions[0];
    startUpgrade(s, 'farm');
    dispatch(s, bx, by + 1);
    advance(s, 2);
    s.speed = 5;
    const text = serialize(s);
    expect(text.length).toBeLessThan(120_000);
    const loaded = deserialize(text);
    expect(loaded).toEqual(s);
    advance(s, 50);
    advance(loaded, 50);
    expect(loaded).toEqual(s);
    expect(loaded.buildings.farm).toBe(1);
  });

  test('读到坏文件时给出明确的提示', () => {
    expect(() => deserialize('这不是存档')).toThrow('无法读取');
    expect(() => deserialize('{"hello":1}')).toThrow('缺少必要内容');
    const s = fresh();
    const broken = JSON.parse(serialize(s));
    broken.map.terrain = broken.map.terrain.slice(0, 100);
    expect(() => deserialize(JSON.stringify(broken))).toThrow('已损坏');
    const future = JSON.parse(serialize(s));
    future.version = 999;
    expect(() => deserialize(JSON.stringify(future))).toThrow('更新版本');
  });
});
