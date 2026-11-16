// 地块详情卡：点击地图上的格子后显示在右上角，带"出征""放弃"按钮。

import { landLevel } from '../data/lands';
import { LAND_RESOURCES, resourceDef } from '../data/resources';
import { STATES } from '../data/states';
import { checkAttack, marchSeconds, tileIndex, tileName } from '../core/territory';
import { PLAYER, Terrain } from '../core/types';
import { clear, h, setText } from './dom';
import { fmtDuration } from './format';
import { resBadge } from './hud';
import type { App } from './app';

const PLACE_KIND = { capital: '都城', city: '州府', town: '郡城', pass: '关卡' } as const;

export class TileCard {
  readonly el: HTMLElement;
  private pos: { x: number; y: number } | null = null;
  private attackBtn: HTMLButtonElement | null = null;
  private reason: HTMLElement | null = null;

  constructor(private app: App) {
    this.el = h('div', { class: 'tile-card', hidden: true });
  }

  show(x: number, y: number): void {
    this.pos = { x, y };
    this.render();
  }

  hide(): void {
    this.pos = null;
    this.el.hidden = true;
  }

  /** 重新生成整张卡片（选中的格子变了，或者领地变了） */
  render(): void {
    const pos = this.pos;
    if (!pos) return;
    const s = this.app.state;
    const map = s.map;
    const { x, y } = pos;
    const i = tileIndex(map, x, y);
    const t = map.terrain[i];
    const owner = map.owner[i];
    this.attackBtn = null;
    this.reason = null;
    clear(this.el);
    this.el.hidden = false;

    const row = (label: string, ...value: (Node | string)[]) => h('div', { class: 't-row' }, h('label', null, label), h('div', null, ...value));
    const ownerName = owner < 0 ? '无主' : owner === PLAYER ? '我方' : s.factions[owner].name;
    const body = h('div', { class: 't-body' });

    if (t === Terrain.Mountain) {
      body.append(h('p', null, '山地。无法通行，也无法占领。'));
    } else if (t === Terrain.River) {
      body.append(h('p', null, '河流。无法通行，只能从渡口过河。'));
    } else if (t === Terrain.City || t === Terrain.Pass) {
      const place = map.places.find((p) => p.x === x && p.y === y);
      body.append(
        row('类型', place ? PLACE_KIND[place.kind] : '城池'),
        row('等级', landLevel(map.level[i]).name),
        row('归属', ownerName),
        h('p', { class: 't-note' }, t === Terrain.Pass ? '扼守进入司隶的要道。攻打关卡将在第四阶段开放。' : '攻打城池将在第四阶段开放，打下后给整片区域加成。'),
      );
    } else if (t === Terrain.Base) {
      const f = s.factions[owner];
      body.append(
        row('势力', h('span', { style: `color:${f.color}` }, f.name)),
        h('p', { class: 't-note' }, f.isPlayer ? '我方主城。在左侧"主城"面板里升级建筑。' : '电脑势力的主城。电脑势力将在第四阶段开始行动。'),
      );
    } else {
      const lv = landLevel(map.level[i]);
      if (t === Terrain.Ferry) {
        body.append(row('类型', '渡口（过河要道，不产资源）'), row('等级', lv.name));
      } else {
        const res = LAND_RESOURCES[map.res[i]];
        body.append(
          row('类型', `资源地（${resourceDef(res).landName}）`),
          row('等级', lv.name),
          row('产出', resBadge(res, true), ` +${lv.yieldPerMin} ${resourceDef(res).name}/分`),
        );
      }
      body.append(row('归属', h('span', owner >= 0 ? { style: `color:${s.factions[owner].color}` } : null, ownerName)));
      if (owner !== PLAYER) {
        body.append(
          row('声望', map.famed[i] ? '已领取过' : `首次占领 +${lv.fame}`),
          row('行军', `单程 ${fmtDuration(marchSeconds(s, x, y))}`),
          row('守军', '第二阶段加入（目前到达即占领）'),
        );
      }
      if (owner === PLAYER) {
        body.append(
          h(
            'div',
            { class: 't-act' },
            h('span', { class: 't-reason' }, '放弃后可以腾出领地名额'),
            h('button', { class: 'btn ghost danger', onclick: () => this.app.askAbandon(x, y) }, '放弃'),
          ),
        );
      } else {
        this.reason = h('span', { class: 't-reason' });
        this.attackBtn = h('button', { class: 'btn', onclick: () => this.app.doDispatch(x, y) }, '出征') as HTMLButtonElement;
        body.append(h('div', { class: 't-act' }, this.reason, this.attackBtn));
      }
    }

    this.el.append(
      h(
        'div',
        { class: 't-head' },
        h('div', null, h('div', { class: 't-title' }, tileName(map, x, y)), h('div', { class: 't-sub num' }, `${STATES[map.state[i]].name} · 坐标 (${x},${y})`)),
        h('button', { class: 'icon-btn', title: '关闭（Esc）', onclick: () => this.app.select(null) }, '×'),
      ),
      body,
    );
    this.refresh();
  }

  /** 只更新会随时间变化的部分（出征按钮能不能点） */
  refresh(): void {
    if (!this.pos || !this.attackBtn || !this.reason) return;
    const check = checkAttack(this.app.state, this.pos.x, this.pos.y);
    this.attackBtn.disabled = !check.ok;
    setText(this.reason, check.ok ? '' : (check.reason ?? ''));
  }
}
