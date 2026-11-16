// 弹窗：菜单、开新局、玩法说明、确认框都用这一个通用弹窗。

import { h } from './dom';

export interface ModalButton {
  label: string;
  kind?: 'primary' | 'ghost' | 'danger';
  /** 返回 false 表示先不关闭弹窗 */
  onClick?: () => boolean | void;
}

export interface ModalOptions {
  title: string;
  body: (Node | string)[];
  buttons?: ModalButton[];
  /** 能否用 Esc、点空白处、右上角 × 关闭。默认可以 */
  closable?: boolean;
  onClose?: () => void;
}

let openCount = 0;

/** 当前是否有弹窗打开（有弹窗时游戏时间暂停） */
export function isModalOpen(): boolean {
  return openCount > 0;
}

export function openModal(opts: ModalOptions): { close: () => void } {
  const closable = opts.closable !== false;
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    openCount--;
    backdrop.remove();
    document.removeEventListener('keydown', onKey, true);
    opts.onClose?.();
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && closable) {
      e.stopPropagation();
      close();
    }
  };

  const footer = h('div', { class: 'modal-foot' });
  for (const b of opts.buttons ?? []) {
    footer.append(
      h(
        'button',
        {
          class: `btn ${b.kind === 'primary' || !b.kind ? '' : b.kind}`,
          onclick: () => {
            if (b.onClick?.() !== false) close();
          },
        },
        b.label,
      ),
    );
  }

  const box = h(
    'div',
    { class: 'modal', role: 'dialog' },
    h('div', { class: 'modal-head' }, h('h2', null, opts.title), closable ? h('button', { class: 'icon-btn', title: '关闭', onclick: close }, '×') : null),
    h('div', { class: 'modal-body' }, ...opts.body),
    opts.buttons?.length ? footer : null,
  );
  const backdrop = h('div', {
    class: 'modal-backdrop',
    onpointerdown: (e: PointerEvent) => {
      if (e.target === backdrop && closable) close();
    },
  });
  backdrop.append(box);
  document.body.append(backdrop);
  document.addEventListener('keydown', onKey, true);
  openCount++;
  return { close };
}

export function confirmModal(title: string, text: string, okLabel: string, onOk: () => void, danger = false): void {
  openModal({
    title,
    body: [h('p', null, text)],
    buttons: [
      { label: '取消', kind: 'ghost' },
      { label: okLabel, kind: danger ? 'danger' : 'primary', onClick: onOk },
    ],
  });
}
