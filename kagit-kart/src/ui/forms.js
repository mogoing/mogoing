// Settings and Controls pages. Shared by the main menu and the pause menu.
import { h, svg, clear } from './dom.js';
import { FocusList } from './nav.js';

const PENCIL_CIRCLE = `<svg viewBox="0 0 100 40" preserveAspectRatio="none" aria-hidden="true"><path d="M9 25C5 9 88 2 95 17C99 31 24 39 7 27C2 19 30 5 66 7" fill="none" stroke="#d9483b" stroke-width="2.4" stroke-linecap="round" vector-effect="non-scaling-stroke"/></svg>`;

const ON_OFF = [[true, '开'], [false, '关']];

export const SETTING_ROWS = [
  { key: 'musicVolume', label: '音乐', type: 'range' },
  { key: 'sfxVolume', label: '音效', type: 'range' },
  { key: 'muted', label: '声音', type: 'mute', options: [[false, '开'], [true, '关']] },
  { key: 'quality', label: '画质', options: [['auto', '自动'], ['high', '高'], ['medium', '中'], ['low', '低'], ['minimal', '最低']] },
  { key: 'reducedMotion', label: '减少动画', options: [['auto', '跟随系统'], ['on', '开'], ['off', '关']] },
  { key: 'cameraShake', label: '镜头震动', options: ON_OFF },
  { key: 'touchControls', label: '触屏按钮', options: [['auto', '自动'], ['on', '开'], ['off', '关']] },
  { key: 'autoAccelerate', label: '自动加速', options: ON_OFF },
  { key: 'showFps', label: '显示帧率', options: ON_OFF },
];

export function createSettingsForm(ctx, { onBack }) {
  const { game } = ctx;
  const rowsEl = h('div', { class: 'kk-rows' });
  const focus = new FocusList(ctx, { onBack });
  const refreshers = [];

  const value = (k) => game.settings?.[k];

  function setValue(row, v) {
    if (row.type === 'mute') {
      if (!!value('muted') !== v) ctx.api('toggleMute');
    } else {
      ctx.api('setSetting', row.key, v);
    }
    refresh();
  }

  const items = SETTING_ROWS.map((row) => {
    const el = h('div', { class: 'kk-srow' }, h('span', null, row.label));
    let item;
    if (row.type === 'range') {
      const bars = h('div', { class: 'kk-bars' });
      const cells = [];
      for (let i = 0; i < 10; i++) {
        const c = h('i', { onclick: (e) => { e.stopPropagation(); setValue(row, (i + 1) / 10); ctx.click(); } });
        cells.push(c);
        bars.appendChild(c);
      }
      const step = (d) => setValue(row, Math.round(Math.max(0, Math.min(1, (value(row.key) ?? 0) + d / 10)) * 10) / 10);
      const minus = h('button', { class: 'kk-arrow', onclick: (e) => { e.stopPropagation(); step(-1); ctx.click(); } }, '◀');
      const plus = h('button', { class: 'kk-arrow', onclick: (e) => { e.stopPropagation(); step(1); ctx.click(); } }, '▶');
      el.appendChild(h('div', { class: 'kk-range' }, minus, bars, plus));
      refreshers.push(() => {
        const n = Math.round((value(row.key) ?? 0) * 10);
        cells.forEach((c, i) => c.classList.toggle('on', i < n));
      });
      item = { el, left: () => { step(-1); ctx.click(); }, right: () => { step(1); ctx.click(); } };
    } else {
      const opts = h('div', { class: 'kk-opts' });
      const optEls = row.options.map(([v, label]) => {
        const o = h('button', { class: 'kk-opt', onclick: (e) => { e.stopPropagation(); setValue(row, v); ctx.click(); } },
          svg(PENCIL_CIRCLE, 'kk-circle'), label);
        opts.appendChild(o);
        return o;
      });
      el.appendChild(opts);
      const cur = () => {
        const v = row.type === 'mute' ? !!value('muted') : value(row.key);
        const i = row.options.findIndex(([x]) => x === v);
        return i < 0 ? 0 : i;
      };
      refreshers.push(() => { const c = cur(); optEls.forEach((o, i) => o.classList.toggle('is-on', i === c)); });
      const shift = (d) => {
        const i = Math.max(0, Math.min(row.options.length - 1, cur() + d));
        if (i !== cur()) { setValue(row, row.options[i][0]); ctx.click(); }
      };
      item = { el, left: () => shift(-1), right: () => shift(1), confirm: () => shift(cur() === row.options.length - 1 ? -(row.options.length - 1) : 1) };
    }
    rowsEl.appendChild(el);
    return item;
  });

  function refresh() { for (const r of refreshers) r(); }
  refresh();
  focus.set(items, 0);

  return { el: rowsEl, focus, refresh, dispose: () => focus.release() };
}

const CONTROLS = {
  keyboard: [
    ['转向', [['k', '←'], ['k', '→'], ' 或 ', ['k', 'A'], ['k', 'D']]],
    ['加速', [['k', '↑'], ['k', 'W']]],
    ['刹车 · 倒车', [['k', '↓'], ['k', 'S']]],
    ['漂移 · 跳跃', [['k', 'Space'], ' 按住 + 方向']],
    ['道具', [['k', 'X'], ['k', 'E'], ' · 向后投: ', ['k', '↓'], '+', ['k', 'X']]],
    ['回头看', [['k', 'C']]],
    ['暂停', [['k', 'Esc'], ['k', 'P']]],
    ['声音', [['k', 'M']]],
    ['重新开始', [['k', 'R'], ' (计时赛)']],
  ],
  gamepad: [
    ['转向', ['左摇杆或方向键']],
    ['加速', [['p', 'A'], ['pw', 'RT']]],
    ['刹车 · 倒车', [['p', 'B'], ['pw', 'LT']]],
    ['漂移 · 跳跃', [['pw', 'RB'], ' 按住 + 方向']],
    ['道具', [['p', 'X'], ['pw', 'LB'], ' · 向后投: 刹车 + 道具']],
    ['回头看', [['p', 'Y']]],
    ['暂停', [['pw', 'Start']]],
  ],
  touch: [
    ['转向', ['左右滑动拇指转向']],
    ['加速', [['k', '加速'], ' 按住（或自动加速）']],
    ['漂移 · 跳跃', [['k', '漂移'], ' 按住 + 方向']],
    ['道具', [['k', '道具'], ' 或道具窗口']],
    ['刹车 · 倒车', [['k', '刹车']]],
    ['暂停', ['点上方 ❚❚ 按钮']],
  ],
};

export function glyphRow(parts) {
  return parts.map((p) => {
    if (typeof p === 'string') return h('span', null, p);
    const [kind, t] = p;
    if (kind === 'k') return h('span', { class: 'kk-key' }, t);
    return h('span', { class: kind === 'pw' ? 'kk-padb kk-wide' : 'kk-padb' }, t);
  });
}

export function controlRows(device, filter = null) {
  const list = CONTROLS[device] || CONTROLS.keyboard;
  return list.filter(([label]) => !filter || filter.includes(label))
    .map(([label, parts]) => h('div', { class: 'kk-crow' }, h('span', null, label), h('div', null, glyphRow(parts))));
}

const DEVICES = [['keyboard', '键盘'], ['gamepad', '手柄'], ['touch', '触屏']];

export function createControlsForm(ctx, { onBack }) {
  let device = ctx.device();
  const tabsEl = h('div', { class: 'kk-devtabs' });
  const rowsEl = h('div', { class: 'kk-rows' });
  const el = h('div', null, tabsEl, rowsEl);
  const focus = new FocusList(ctx, { onBack });

  const tabs = DEVICES.map(([id, label]) => {
    const t = h('button', { class: 'kk-devtab' }, label);
    tabsEl.appendChild(t);
    return { id, el: t };
  });

  function render() {
    tabs.forEach((t) => t.el.classList.toggle('is-on', t.id === device));
    clear(rowsEl);
    for (const r of controlRows(device)) rowsEl.appendChild(r);
  }

  const pick = (i) => { device = tabs[i].id; render(); };
  const items = tabs.map((t, i) => ({
    el: t.el,
    confirm: () => pick(i),
    onFocus: () => pick(i),
  }));
  render();
  focus.set(items, Math.max(0, DEVICES.findIndex(([id]) => id === device)));
  return { el, focus, dispose: () => focus.release() };
}
