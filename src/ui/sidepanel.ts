// 左侧面板：主城（建筑）、领地（已占领的地）、记事（事件记录）。

import { BUILDINGS, EFFECTS, type BuildingDef } from '../data/buildings';
import { CONFIG } from '../data/config';
import { landLevel } from '../data/lands';
import { ALL_RESOURCES, LAND_RESOURCES, resourceDef, type ResourceId } from '../data/resources';
import { STATES } from '../data/states';
import { buildingLevel, checkUpgrade, effectAt, startUpgrade, upgradeCost, upgradeTime } from '../core/buildings';
import { landYields } from '../core/economy';
import { formatClock } from '../core/game';
import { territoryCap, territoryCount, tileName } from '../core/territory';
import { PLAYER, Terrain } from '../core/types';
import { clear, h, setText, toggleClass } from './dom';
import { fmtCountdown, fmtDuration, fmtInt } from './format';
import { resBadge } from './hud';
import type { App } from './app';

type TabId = 'city' | 'land' | 'log';

interface Card {
  def: BuildingDef;
  root: HTMLElement;
  lv: HTMLElement;
  eff: HTMLElement;
  cost: HTMLElement;
  costLevel: number;
  chips: Map<ResourceId, HTMLElement>;
  btn: HTMLButtonElement;
  reason: HTMLElement;
  prog: HTMLElement;
  bar: HTMLElement;
  progText: HTMLElement;
  shownLevel: number;
}

export class SidePanel {
  readonly el: HTMLElement;
  private tab: TabId = 'city';
  private tabBtns = new Map<TabId, HTMLElement>();
  private bodies = new Map<TabId, HTMLElement>();
  private queueInfo: HTMLElement;
  private cards: Card[] = [];
  private landSummary: HTMLElement;
  private landList: HTMLElement;
  private landSig = '';
  private logList: HTMLElement;
  private logSig = '';

  constructor(private app: App) {
    const tabs = h('nav', { class: 'tabs' });
    const names: [TabId, string][] = [
      ['city', '主城'],
      ['land', '领地'],
      ['log', '记事'],
    ];
    for (const [id, name] of names) {
      const btn = h('button', { class: 'tab', onclick: () => this.show(id) }, name);
      this.tabBtns.set(id, btn);
      tabs.append(btn);
    }

    // 主城
    this.queueInfo = h('div', { class: 'panel-note' });
    const city = h('div', { class: 'tab-body' }, this.queueInfo);
    for (const def of BUILDINGS) {
      const card = this.makeCard(def);
      this.cards.push(card);
      city.append(card.root);
    }
    this.bodies.set('city', city);

    // 领地
    this.landSummary = h('div', { class: 'land-summary' });
    this.landList = h('div', { class: 'land-list' });
    this.bodies.set('land', h('div', { class: 'tab-body' }, this.landSummary, this.landList));

    // 记事
    this.logList = h('div', { class: 'log-list' });
    this.bodies.set('log', h('div', { class: 'tab-body' }, this.logList));

    this.el = h('aside', { class: 'side' }, tabs, ...this.bodies.values());
    this.show('city');
  }

  show(id: TabId): void {
    this.tab = id;
    for (const [k, btn] of this.tabBtns) toggleClass(btn, 'on', k === id);
    for (const [k, body] of this.bodies) body.hidden = k !== id;
    this.refresh();
  }

  /** 换了一局游戏后，强制重画列表 */
  reset(): void {
    this.landSig = '';
    this.logSig = '';
    for (const c of this.cards) {
      c.costLevel = -1;
      c.shownLevel = -1;
    }
  }

  refresh(): void {
    if (!this.app.state) return; // 游戏还没载入
    if (this.tab === 'city') this.refreshCity();
    else if (this.tab === 'land') this.refreshLand();
    else this.refreshLog();
  }

  private makeCard(def: BuildingDef): Card {
    const lv = h('span', { class: 'b-lv num' });
    const eff = h('div', { class: 'b-eff' });
    const cost = h('div', { class: 'b-cost' });
    const reason = h('span', { class: 'b-reason' });
    const btn = h('button', {
      class: 'btn',
      onclick: () => {
        const r = startUpgrade(this.app.state, def.id);
        if (!r.ok) this.app.toast(r.reason ?? '无法升级', 'bad');
        this.app.refreshUI();
      },
    }) as HTMLButtonElement;
    const bar = h('div', { class: 'bar-fill' });
    const progText = h('span', { class: 'num' });
    const prog = h('div', { class: 'b-prog' }, h('div', { class: 'bar' }, bar), progText);
    const root = h(
      'div',
      { class: 'b-card' },
      h('div', { class: 'b-head' }, h('span', { class: 'b-name' }, def.name), lv),
      h('div', { class: 'b-desc' }, def.desc),
      eff,
      def.pending ? h('div', { class: 'b-pending' }, `（${def.pending}）`) : null,
      cost,
      h('div', { class: 'b-act' }, reason, btn),
      prog,
    );
    return { def, root, lv, eff, cost, costLevel: -1, chips: new Map(), btn, reason, prog, bar, progText, shownLevel: -1 };
  }

  private refreshCity(): void {
    const s = this.app.state;
    setText(this.queueInfo, `建造队列 ${s.buildQueue.length}/${CONFIG.buildQueueSize} · 其他建筑的等级不能超过议政厅`);
    for (const c of this.cards) {
      const def = c.def;
      const lv = buildingLevel(s, def.id);
      const maxed = lv >= def.maxLevel;
      const task = s.buildQueue.find((t) => t.building === def.id);

      if (c.shownLevel !== lv) {
        c.shownLevel = lv;
        setText(c.lv, lv === 0 ? '未建造' : `${lv} 级${maxed ? '（满级）' : ''}`);
        clear(c.eff);
        const seen = new Set<string>();
        for (const e of def.effects) {
          if (seen.has(e.key)) continue;
          seen.add(e.key);
          const info = EFFECTS[e.key];
          const cur = effectAt(def, e.key, lv);
          const line = h('div', null, `${info.label} `, h('b', { class: 'num' }, `+${fmtInt(cur)}${info.unit}`));
          if (!maxed) {
            line.append(' → ', h('b', { class: 'num up' }, `+${fmtInt(effectAt(def, e.key, lv + 1))}${info.unit}`));
          }
          c.eff.append(line);
        }
        c.btn.textContent = lv === 0 ? '建造' : '升级';
      }

      // 花费
      const wantCost = maxed ? 0 : lv + 1;
      if (c.costLevel !== wantCost) {
        c.costLevel = wantCost;
        clear(c.cost);
        c.chips.clear();
        if (!maxed) {
          const cost = upgradeCost(def, lv + 1);
          for (const r of ALL_RESOURCES) {
            const n = cost[r];
            if (!n) continue;
            const chip = h('span', { class: 'chip num' }, resBadge(r, true), fmtInt(n));
            c.chips.set(r, chip);
            c.cost.append(chip);
          }
          c.cost.append(h('span', { class: 'chip time num', title: '建造耗时' }, `耗时 ${fmtDuration(upgradeTime(def, lv + 1))}`));
        }
      }
      for (const [r, chip] of c.chips) {
        toggleClass(chip, 'lack', s.resources[r] < (upgradeCost(def, lv + 1)[r] ?? 0));
      }

      c.prog.hidden = !task;
      c.cost.hidden = !!task || maxed;
      c.btn.hidden = !!task || maxed;
      if (task) {
        const p = (s.time - task.start) / Math.max(0.001, task.end - task.start);
        c.bar.style.width = `${Math.max(0, Math.min(1, p)) * 100}%`;
        setText(c.progText, `升级中 ${fmtCountdown(task.end - s.time)}`);
        setText(c.reason, '');
      } else if (maxed) {
        setText(c.reason, '');
      } else {
        const check = checkUpgrade(s, def.id);
        c.btn.disabled = !check.ok;
        setText(c.reason, check.ok ? '' : (check.reason ?? ''));
      }
      toggleClass(c.root, 'busy', !!task);
    }
  }

  private refreshLand(): void {
    const s = this.app.state;
    const map = s.map;
    const count = territoryCount(s);
    const cap = territoryCap(s);
    const sig = `${count}|${cap}|${s.fame}|${this.app.territoryRev}`;
    if (sig === this.landSig) return;
    this.landSig = sig;

    const yields = landYields(s);
    const toNext = CONFIG.famePerCap - (s.fame % CONFIG.famePerCap);
    clear(this.landSummary);
    this.landSummary.append(
      h('div', { class: 'ls-row' }, '领地 ', h('b', { class: 'num' }, `${count}/${cap}`), ' · 声望 ', h('b', { class: 'num' }, fmtInt(s.fame))),
      h('div', { class: 'ls-hint' }, `再获得 ${toNext} 声望，领地上限 +1。第一次占领一块地时获得声望，等级越高给得越多。`),
      h(
        'div',
        { class: 'ls-yield' },
        ...LAND_RESOURCES.map((r) => h('span', { class: 'chip num' }, resBadge(r, true), `+${fmtInt(yields[r])}/分`)),
      ),
    );

    const lands: number[] = [];
    for (let i = 0; i < map.owner.length; i++) {
      if (map.owner[i] === PLAYER && map.terrain[i] !== Terrain.Base) lands.push(i);
    }
    lands.sort((a, b) => map.level[a] - map.level[b] || a - b);
    clear(this.landList);
    if (lands.length === 0) {
      this.landList.append(h('div', { class: 'empty' }, '还没有领地。在地图上点主城旁边带亮角标的地块，然后点"出征"。'));
      return;
    }
    for (const i of lands) {
      const x = i % map.size;
      const y = Math.floor(i / map.size);
      const isLand = map.terrain[i] === Terrain.Plain;
      const res = LAND_RESOURCES[map.res[i]];
      this.landList.append(
        h(
          'div',
          { class: 'land-row' },
          isLand ? resBadge(res, true) : h('span', { class: 'badge small', style: '--c:#8a6a45' }, '渡'),
          h(
            'div',
            { class: 'land-main' },
            h('div', { class: 'land-name' }, tileName(map, x, y)),
            h('div', { class: 'land-sub num' }, `${STATES[map.state[i]].name} (${x},${y})${isLand ? ` · +${landLevel(map.level[i]).yieldPerMin} ${resourceDef(res).name}/分` : ''}`),
          ),
          h('button', { class: 'btn ghost tiny', onclick: () => this.app.locate(x, y) }, '定位'),
          h('button', { class: 'btn ghost tiny danger', onclick: () => this.app.askAbandon(x, y) }, '放弃'),
        ),
      );
    }
  }

  private refreshLog(): void {
    const log = this.app.state.log;
    const last = log[log.length - 1];
    const sig = `${log.length}|${last?.time ?? 0}|${last?.text ?? ''}`;
    if (sig === this.logSig) return;
    this.logSig = sig;
    clear(this.logList);
    for (let k = log.length - 1; k >= 0; k--) {
      const e = log[k];
      this.logList.append(h('div', { class: `log-row ${e.kind}` }, h('span', { class: 'log-time num' }, formatClock(e.time)), h('span', null, e.text)));
    }
  }
}
