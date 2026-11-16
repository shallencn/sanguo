// 浮在地图上的小部件：行军列表、最近记事、缩放按钮、提示消息。

import { idleTeams, teamCount, tileName } from '../core/territory';
import { clear, h, setText } from './dom';
import { fmtCountdown } from './format';
import type { App } from './app';

/** 行军列表：常驻在地图左上角 */
export class MarchBar {
  readonly el: HTMLElement;
  private head: HTMLElement;
  private list: HTMLElement;
  private sig = '';
  private timers: { id: number; el: HTMLElement }[] = [];

  constructor(private app: App) {
    this.head = h('div', { class: 'm-head' });
    this.list = h('div', { class: 'm-list' });
    this.el = h('div', { class: 'march-bar' }, this.head, this.list);
  }

  refresh(): void {
    const s = this.app.state;
    setText(this.head, `队伍　空闲 ${idleTeams(s)}/${teamCount(s)}`);
    const sig = s.marches.map((m) => `${m.id}${m.phase}`).join(',');
    if (sig !== this.sig) {
      this.sig = sig;
      clear(this.list);
      this.timers = [];
      for (const m of s.marches) {
        const timer = h('b', { class: 'num' });
        this.timers.push({ id: m.id, el: timer });
        const going = m.phase === 'go';
        this.list.append(
          h(
            'button',
            { class: `m-row ${going ? 'go' : 'back'}`, title: '点击定位', onclick: () => this.app.locate(m.x, m.y) },
            h('span', { class: 'm-dir' }, going ? '出征' : '回城'),
            h('span', { class: 'm-name' }, `${tileName(s.map, m.x, m.y)} (${m.x},${m.y})`),
            timer,
          ),
        );
      }
    }
    for (const t of this.timers) {
      const m = s.marches.find((k) => k.id === t.id);
      if (m) setText(t.el, fmtCountdown((m.phase === 'go' ? m.arrive : m.back) - s.time));
    }
  }
}

/** 最近三条记事：常驻在地图左下角 */
export class Ticker {
  readonly el = h('div', { class: 'ticker' });
  private sig = '';

  constructor(private app: App) {}

  refresh(): void {
    const log = this.app.state.log;
    const last = log[log.length - 1];
    const sig = `${log.length}|${last?.time}|${last?.text}`;
    if (sig === this.sig) return;
    this.sig = sig;
    clear(this.el);
    for (const e of log.slice(-3)) this.el.append(h('div', { class: `tick ${e.kind}` }, e.text));
  }
}

/** 屏幕上方短暂出现的提示 */
export class Toasts {
  readonly el = h('div', { class: 'toasts' });

  show(text: string, kind: 'info' | 'good' | 'bad' = 'info'): void {
    const item = h('div', { class: `toast ${kind}` }, text);
    this.el.append(item);
    while (this.el.children.length > 3) this.el.firstElementChild?.remove();
    setTimeout(() => item.classList.add('out'), 2200);
    setTimeout(() => item.remove(), 2700);
  }
}
