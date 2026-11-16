// 整个游戏界面的总管：持有游戏状态，驱动时间流逝，把各个面板串起来。

import { CONFIG } from '../data/config';
import { PLAYER_FACTION } from '../data/factions';
import { STATES } from '../data/states';
import { advance, formatClock, newGame } from '../core/game';
import { clearBrowserSave, deserialize, loadFromBrowser, saveToBrowser, serialize } from '../core/save';
import { abandon, dispatch, territoryCount, tileFullName } from '../core/territory';
import { PLAYER, type GameState } from '../core/types';
import { confirmModal, isModalOpen, openModal } from './dialogs';
import { h } from './dom';
import { Hud } from './hud';
import { MapView } from './mapview';
import { Minimap } from './minimap';
import { MarchBar, Ticker, Toasts } from './overlays';
import { SidePanel } from './sidepanel';
import { TileCard } from './tilecard';

export const VERSION_LABEL = '第一阶段 · 铺地与建设';

const DIR_NAMES: Record<string, string> = {
  '1,0': '东',
  '1,1': '东南',
  '0,1': '南',
  '-1,1': '西南',
  '-1,0': '西',
  '-1,-1': '西北',
  '0,-1': '北',
  '1,-1': '东北',
};

function randomSeed(): number {
  return Math.floor(Math.random() * 2147483646) + 1;
}

export class App {
  state!: GameState;
  /** 领地每变化一次就加一，面板据此判断要不要重画 */
  territoryRev = 0;

  private root: HTMLElement;
  private hud: Hud;
  private side: SidePanel;
  private tileCard: TileCard;
  private marchBar: MarchBar;
  private ticker: Ticker;
  private toasts: Toasts;
  private mapView: MapView;
  private minimap: Minimap;

  private lastFrame = 0;
  private uiClock = 0;
  private saveClock = 0;
  private lastCount = -1;
  private speedBeforePause = 1;
  /** 第一次打开、还没点"起兵"之前不存档，免得把垫在弹窗后面的临时地图存下来 */
  private saveEnabled = true;

  constructor(root: HTMLElement) {
    this.root = root;
    this.hud = new Hud(this);
    this.side = new SidePanel(this);
    this.tileCard = new TileCard(this);
    this.marchBar = new MarchBar(this);
    this.ticker = new Ticker(this);
    this.toasts = new Toasts();

    const canvas = h('canvas', { class: 'map-canvas' });
    const miniCanvas = h('canvas', { class: 'minimap', width: 176, height: 176, title: '小地图：点击跳转' });
    const controls = h(
      'div',
      { class: 'map-controls' },
      h(
        'div',
        { class: 'zoom-btns' },
        h('button', { class: 'icon-btn', title: '放大', onclick: () => this.mapView.zoomBy(1.3) }, '+'),
        h('button', { class: 'icon-btn', title: '缩小', onclick: () => this.mapView.zoomBy(1 / 1.3) }, '−'),
        h('button', { class: 'icon-btn', title: '回到主城', onclick: () => this.goHome() }, '城'),
      ),
      miniCanvas,
    );
    const mapWrap = h('section', { class: 'mapwrap' }, canvas, this.marchBar.el, this.tileCard.el, this.ticker.el, controls, this.toasts.el);
    root.append(this.hud.el, h('main', { class: 'stage' }, this.side.el, mapWrap));

    this.mapView = new MapView(canvas);
    this.mapView.onSelect = (x, y) => {
      const cur = this.mapView.selected;
      this.select(cur && cur.x === x && cur.y === y ? null : { x, y });
    };
    this.minimap = new Minimap(miniCanvas, this.mapView);

    document.addEventListener('keydown', (e) => this.onKey(e));
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.save(false);
    });
    window.addEventListener('beforeunload', () => this.save(false));
    if (window.matchMedia('(max-width: 860px)').matches) root.classList.add('side-hidden');
  }

  start(): void {
    const saved = loadFromBrowser();
    if (saved) {
      this.setGame(saved);
    } else {
      // 没有存档：先随机生成一张图垫在后面，再弹出开局窗口
      this.saveEnabled = false;
      this.setGame(newGame({ seed: randomSeed() }));
      this.openNewGame(true);
    }
    requestAnimationFrame((t) => this.frame(t));
  }

  private setGame(state: GameState): void {
    this.state = state;
    this.lastCount = territoryCount(state);
    this.territoryRev++;
    this.mapView.setState(state);
    this.minimap.setState(state);
    this.side.reset();
    this.tileCard.hide();
    this.goHome();
    this.refreshUI();
  }

  private frame(now: number): void {
    const dt = Math.min(0.1, Math.max(0, (now - this.lastFrame) / 1000));
    this.lastFrame = now;
    const s = this.state;
    if (s.speed > 0 && !isModalOpen()) advance(s, dt * s.speed);

    const count = territoryCount(s);
    if (count !== this.lastCount) {
      this.lastCount = count;
      this.territoryChanged();
    }

    this.mapView.draw();
    this.uiClock += dt;
    if (this.uiClock >= 0.1) {
      this.uiClock = 0;
      this.refreshUI();
    }
    this.saveClock += dt;
    if (this.saveClock >= CONFIG.autosaveSeconds) this.save(false);
    requestAnimationFrame((t) => this.frame(t));
  }

  refreshUI(): void {
    this.hud.refresh();
    this.side.refresh();
    this.tileCard.refresh();
    this.marchBar.refresh();
    this.ticker.refresh();
    this.minimap.draw();
  }

  private territoryChanged(): void {
    this.territoryRev++;
    this.mapView.refreshTerritory();
    this.tileCard.render();
  }

  // ---------- 操作 ----------

  setSpeed(speed: number): void {
    if (speed === 0 && this.state.speed > 0) this.speedBeforePause = this.state.speed;
    this.state.speed = speed;
    this.hud.refresh();
  }

  toggleSide(): void {
    this.root.classList.toggle('side-hidden');
  }

  toast(text: string, kind: 'info' | 'good' | 'bad' = 'info'): void {
    this.toasts.show(text, kind);
  }

  select(pos: { x: number; y: number } | null): void {
    this.mapView.selected = pos;
    if (pos) this.tileCard.show(pos.x, pos.y);
    else this.tileCard.hide();
  }

  /** 把镜头移到某个地块并选中它 */
  locate(x: number, y: number): void {
    this.mapView.centerOn(x, y, Math.max(this.mapView.cam.zoom, 30));
    this.select({ x, y });
  }

  goHome(): void {
    const base = this.state.factions[PLAYER];
    this.mapView.centerOn(base.baseX, base.baseY, 40);
  }

  doDispatch(x: number, y: number): void {
    const r = dispatch(this.state, x, y);
    if (!r.ok) this.toast(r.reason ?? '无法出征', 'bad');
    this.refreshUI();
  }

  askAbandon(x: number, y: number): void {
    const name = tileFullName(this.state.map, x, y);
    confirmModal(
      '放弃领地',
      `确定放弃${name}吗？放弃后这块地变回无主，已获得的声望不会减少，再次占领也不会重复获得声望。`,
      '放弃',
      () => {
        const r = abandon(this.state, x, y);
        if (!r.ok) this.toast(r.reason ?? '无法放弃', 'bad');
        this.lastCount = territoryCount(this.state);
        this.territoryChanged();
        this.refreshUI();
      },
      true,
    );
  }

  private onKey(e: KeyboardEvent): void {
    const target = e.target as HTMLElement | null;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
    if (isModalOpen()) return;
    if (e.code === 'Space') {
      e.preventDefault();
      // 让刚点过的按钮失去焦点，否则空格会同时再"按"一次那个按钮
      (document.activeElement as HTMLElement | null)?.blur?.();
      this.setSpeed(this.state.speed === 0 ? this.speedBeforePause : 0);
    } else if (e.key === 'Escape') {
      this.select(null);
    } else if (e.key >= '1' && e.key <= '3') {
      this.setSpeed(CONFIG.speeds[Number(e.key)]);
    }
  }

  // ---------- 存档 ----------

  save(notify: boolean): void {
    this.saveClock = 0;
    if (!this.saveEnabled) return;
    const ok = saveToBrowser(this.state);
    if (notify) this.toast(ok ? '已存档' : '存档失败：浏览器不允许本地存储', ok ? 'good' : 'bad');
  }

  private exportSave(): void {
    const blob = new Blob([serialize(this.state)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const day = Math.floor(this.state.time / 600) + 1;
    const a = h('a', { href: url, download: `三国沙盘存档-第${day}日.json` });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    this.toast('存档文件已导出，请在浏览器的下载文件夹里查看', 'good');
  }

  private importSave(): void {
    const input = h('input', { type: 'file', accept: '.json,application/json' });
    input.addEventListener('change', async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        const state = deserialize(await file.text());
        this.setGame(state);
        this.save(false);
        this.toast(`已读取存档：${formatClock(state.time)}`, 'good');
      } catch (err) {
        this.toast(err instanceof Error ? err.message : '存档文件无法读取', 'bad');
      }
    });
    input.click();
  }

  // ---------- 弹窗 ----------

  openMenu(): void {
    const modal = openModal({
      title: '菜单',
      body: [
        h(
          'div',
          { class: 'menu-list' },
          this.menuItem('立即存档', '游戏每 10 秒自动存一次，存在这个浏览器里', () => this.save(true)),
          this.menuItem('导出存档文件', '把存档下载成一个文件，可以备份或换电脑继续玩', () => this.exportSave()),
          this.menuItem('导入存档文件', '读取之前导出的存档文件（会覆盖当前进度）', () => {
            modal.close();
            this.importSave();
          }),
          this.menuItem('新开一局', '重新生成地图，从头开始', () => {
            modal.close();
            this.openNewGame(false);
          }),
          this.menuItem('玩法说明', '这个阶段能做什么、怎么操作', () => {
            modal.close();
            this.openHelp();
          }),
        ),
        h('p', { class: 'menu-foot' }, `${VERSION_LABEL} · 地图种子 ${this.state.seed}`),
      ],
    });
  }

  private menuItem(title: string, desc: string, onClick: () => void): HTMLElement {
    return h('button', { class: 'menu-item', onclick: onClick }, h('b', null, title), h('span', null, desc));
  }

  openNewGame(first: boolean): void {
    let startState = 0; // 0 = 随机
    const nameInput = h('input', { type: 'text', maxlength: 8, value: PLAYER_FACTION.name, class: 'field' }) as HTMLInputElement;
    const seedInput = h('input', { type: 'text', inputmode: 'numeric', placeholder: '留空则随机', class: 'field' }) as HTMLInputElement;
    const stateBtns: HTMLElement[] = [];
    const pick = (id: number) => {
      startState = id;
      stateBtns.forEach((b, k) => b.classList.toggle('on', k === id));
    };
    const grid = h('div', { class: 'state-grid' });
    const addBtn = (id: number, label: string, sub: string) => {
      const b = h('button', { class: 'state-btn', onclick: () => pick(id) }, h('b', null, label), h('span', null, sub));
      stateBtns[id] = b;
      grid.append(b);
    };
    addBtn(0, '随机', '听天由命');
    for (const st of STATES) {
      if (st.dir) addBtn(st.id, st.name, `洛阳以${DIR_NAMES[st.dir.join(',')]}`);
    }
    pick(0);

    openModal({
      title: first ? '三国沙盘 · 起兵' : '新开一局',
      closable: !first,
      body: [
        first
          ? h('p', null, '天下大乱，群雄并起。选一个州起兵，从主城开始一格一格向外铺地，建设主城，最终目标是洛阳。')
          : h('p', { class: 'warn-text' }, '新开一局会覆盖当前进度。想保留的话，先在菜单里"导出存档文件"。'),
        h('label', { class: 'form-row' }, h('span', null, '势力名称'), nameInput),
        h('div', { class: 'form-row' }, h('span', null, '出生的州'), grid),
        h('label', { class: 'form-row' }, h('span', null, '地图种子'), seedInput),
        h('p', { class: 'hint' }, '地图种子是一个数字：同一个数字永远生成同一张地图。想重玩某张图时填上它，平时留空即可。'),
      ],
      buttons: [
        ...(first ? [] : [{ label: '取消', kind: 'ghost' as const }]),
        {
          label: '起兵',
          onClick: () => {
            const typed = Number.parseInt(seedInput.value.trim(), 10);
            const seed = Number.isFinite(typed) && typed > 0 ? typed : randomSeed();
            clearBrowserSave();
            this.saveEnabled = true;
            this.setGame(newGame({ seed, startState: startState || undefined, name: nameInput.value }));
            this.save(false);
            if (first) this.openHelp();
          },
        },
      ],
    });
  }

  openHelp(): void {
    const li = (title: string, text: string) => h('li', null, h('b', null, title), text);
    openModal({
      title: '玩法说明',
      body: [
        h(
          'ul',
          { class: 'help-list' },
          li('看地图：', '按住鼠标拖动，滚轮缩放。右下角是小地图，"城"按钮回到主城。'),
          li('铺地：', '只能占领与自己领地上下左右相邻的地（四角带亮色角标的格子）。点一下格子，再点"出征"，队伍到达后就占下来。'),
          li('资源：', '占下的地按等级每分钟产出木、铁、石、粮。格子右下角的数字是等级，越靠近洛阳等级越高。'),
          li('主城：', '左侧"主城"面板里升级建筑：议政厅决定其他建筑的等级上限，府库提高存放上限，点将台增加队伍数量。'),
          li('领地上限：', '第一次占领一块地会获得声望，声望越高能占的地越多。满了可以在"领地"面板里放弃低级地。'),
          li('时间：', '顶部可以暂停、1 倍、5 倍、20 倍速，空格键暂停。关掉网页或切到别的标签页时，时间不流动。'),
          li('存档：', '自动存在这个浏览器里。菜单里可以导出、导入存档文件。'),
        ),
        h('p', { class: 'hint' }, '目前是第一阶段：占地不用打仗，到达即占领；城池、关卡和电脑势力要到后面的阶段才开放。'),
      ],
      buttons: [{ label: '知道了' }],
    });
  }
}
