// 顶部栏：资源、声望、领地、队伍、时间与倍速。这些数字常驻显示。

import { CONFIG } from '../data/config';
import { RESOURCES, type ResourceId } from '../data/resources';
import { storageCap, yieldRates } from '../core/economy';
import { formatClock } from '../core/game';
import { idleTeams, teamCount, territoryCap, territoryCount } from '../core/territory';
import { h, setText, toggleClass } from './dom';
import { fmtInt } from './format';
import type { App } from './app';

export function resBadge(id: ResourceId, small = false): HTMLElement {
  const def = RESOURCES.find((r) => r.id === id)!;
  return h('span', { class: `badge${small ? ' small' : ''}`, style: `--c:${def.color}`, title: def.name }, def.glyph);
}

export class Hud {
  readonly el: HTMLElement;
  private res = new Map<ResourceId, { root: HTMLElement; num: HTMLElement; cap: HTMLElement; rate: HTMLElement }>();
  private fame: HTMLElement;
  private land: HTMLElement;
  private teams: HTMLElement;
  private clock: HTMLElement;
  private speedBtns: { speed: number; el: HTMLElement }[] = [];

  constructor(private app: App) {
    const resList = h('div', { class: 'res-list' });
    for (const def of RESOURCES) {
      const num = h('b', { class: 'num' });
      const cap = h('small', { class: 'num' });
      const rate = h('span', { class: 'res-rate num' });
      const root = h('div', { class: 'res', title: def.name }, resBadge(def.id), h('div', { class: 'res-main' }, h('div', null, num, cap), rate));
      this.res.set(def.id, { root, num, cap, rate });
      resList.append(root);
    }

    this.fame = h('b', { class: 'num' });
    this.land = h('b', { class: 'num' });
    this.teams = h('b', { class: 'num' });
    const stats = h(
      'div',
      { class: 'stats' },
      h('div', { class: 'stat', title: '第一次占领一块地时获得声望；声望越高，领地上限越高' }, h('label', null, '声望'), this.fame),
      h('div', { class: 'stat', title: '已占领的地块数 / 领地上限' }, h('label', null, '领地'), this.land),
      h('div', { class: 'stat', title: '空闲队伍 / 队伍总数（升级点将台增加）' }, h('label', null, '空闲队伍'), this.teams),
    );

    this.clock = h('div', { class: 'clock num' });
    const speed = h('div', { class: 'speed' });
    for (const s of CONFIG.speeds) {
      const el = h('button', { class: 'speed-btn', title: s === 0 ? '暂停（空格键）' : `${s} 倍速`, onclick: () => app.setSpeed(s) }, s === 0 ? '暂停' : `${s}×`);
      this.speedBtns.push({ speed: s, el });
      speed.append(el);
    }

    this.el = h(
      'header',
      { class: 'topbar' },
      h('button', { class: 'icon-btn side-toggle', title: '显示/隐藏左侧面板', onclick: () => app.toggleSide() }, '☰'),
      h('div', { class: 'brand' }, '三国沙盘'),
      resList,
      stats,
      h('div', { class: 'time-box' }, this.clock, speed),
      h('button', { class: 'btn ghost menu-btn', onclick: () => app.openMenu() }, '菜单'),
    );
  }

  refresh(): void {
    const s = this.app.state;
    const rates = yieldRates(s);
    for (const def of RESOURCES) {
      const ui = this.res.get(def.id)!;
      const cap = storageCap(s, def.id);
      const cur = s.resources[def.id];
      setText(ui.num, fmtInt(cur));
      setText(ui.cap, Number.isFinite(cap) ? `/${fmtInt(cap)}` : '');
      setText(ui.rate, `+${fmtInt(rates[def.id])}/分`);
      toggleClass(ui.root, 'full', cur >= cap);
    }
    setText(this.fame, fmtInt(s.fame));
    const count = territoryCount(s);
    const cap = territoryCap(s);
    setText(this.land, `${count}/${cap}`);
    toggleClass(this.land, 'warn', count >= cap);
    setText(this.teams, `${idleTeams(s)}/${teamCount(s)}`);
    setText(this.clock, formatClock(s.time));
    for (const b of this.speedBtns) toggleClass(b.el, 'on', b.speed === s.speed);
  }
}
