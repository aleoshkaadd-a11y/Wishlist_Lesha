// Базовые UI-компоненты: иконки, листы (sheet), формы, тосты, подтверждения.
import { uid, putFile } from './store.js';
import { prepareImage } from './scan.js';

export const $ = (s, el = document) => el.querySelector(s);
export const $$ = (s, el = document) => [...el.querySelectorAll(s)];
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const svg = (p, extra = '') => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" ${extra}>${p}</svg>`;
export const I = {
  home: svg('<path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z"/>'),
  syringe: svg('<path d="m18 2 4 4M17 7l3-3M19 9 8.7 19.3a2.4 2.4 0 0 1-3.4 0l-.6-.6a2.4 2.4 0 0 1 0-3.4L15 5M9 11l4 4M5 19l-3 3M14 4l6 6"/>'),
  calendar: svg('<rect x="3" y="4.5" width="18" height="17" rx="3"/><path d="M8 2.5v4M16 2.5v4M3 10h18"/>'),
  health: svg('<path d="M19.5 12.6 12 20l-7.5-7.4A5 5 0 1 1 12 6a5 5 0 1 1 7.5 6.6z"/><path d="M3.5 12h4l2-3 3 6 2-3h6"/>'),
  camera: svg('<path d="M14.5 4h-5L7.5 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3.5z"/><circle cx="12" cy="13" r="3.5"/>'),
  plus: svg('<path d="M12 5v14M5 12h14"/>'),
  settings: svg('<path d="M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1"/><circle cx="15" cy="6" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="17" cy="18" r="2"/>'),
  file: svg('<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h4"/>'),
  paw: svg('<g fill="currentColor" stroke="none"><ellipse cx="5.6" cy="10.2" rx="2.1" ry="2.7" transform="rotate(-18 5.6 10.2)"/><ellipse cx="9.6" cy="5.9" rx="2.1" ry="2.8" transform="rotate(-6 9.6 5.9)"/><ellipse cx="14.6" cy="5.9" rx="2.1" ry="2.8" transform="rotate(6 14.6 5.9)"/><ellipse cx="18.6" cy="10.2" rx="2.1" ry="2.7" transform="rotate(18 18.6 10.2)"/><path d="M12.1 11.4c-2.8 0-6 3.6-6 6.3 0 1.6 1.2 2.5 2.7 2.5 1.3 0 2.1-.7 3.3-.7s2 .7 3.3.7c1.5 0 2.7-.9 2.7-2.5 0-2.7-3.2-6.3-6-6.3z"/></g>'),
  chevD: svg('<path d="m6 9 6 6 6-6"/>'),
  chevL: svg('<path d="m15 18-6-6 6-6"/>'),
  chevR: svg('<path d="m9 18 6-6-6-6"/>'),
  x: svg('<path d="M18 6 6 18M6 6l12 12"/>'),
  edit: svg('<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>'),
  trash: svg('<path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/>'),
  download: svg('<path d="M12 3v12M7 10l5 5 5-5M5 21h14"/>'),
  upload: svg('<path d="M12 21V9M7 14l5-5 5 5M5 3h14"/>'),
  bell: svg('<path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.9 1.9 0 0 0 3.4 0"/>'),
  image: svg('<rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="9" cy="9" r="2"/><path d="m21 15-5-5L5 21"/>'),
  sparkle: svg('<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z"/>'),
  check: svg('<path d="M20 6 9 17l-5-5"/>'),
  flower: svg('<circle cx="12" cy="12" r="2.5"/><path d="M12 9.5C10 6 10.5 3 12 3s2 3 0 6.5M14.5 12c3.5-2 6.5-1.5 6.5 0s-3 2-6.5 0M12 14.5c2 3.5 1.5 6.5 0 6.5s-2-3 0-6.5M9.5 12C6 14 3 13.5 3 12s3-2 6.5 0"/>'),
  repeat: svg('<path d="M17 2l4 4-4 4"/><path d="M3 11V9a3 3 0 0 1 3-3h15M7 22l-4-4 4-4"/><path d="M21 13v2a3 3 0 0 1-3 3H3"/>'),
};

// ---------- тост ----------
let toastTimer;
export function toast(msg, action) {
  const t = $('#toast');
  t.innerHTML = `<span>${esc(msg)}</span>${action ? `<button type="button">${esc(action.label)}</button>` : ''}`;
  if (action) t.querySelector('button').onclick = () => { t.classList.remove('show'); action.fn(); };
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), action ? 5000 : 2600);
}

// ---------- листы ----------
const sheets = [];
let ignorePop = 0;
const pending = [];
export const sheetOpen = () => sheets.length > 0;

export function openSheet({ title, body, foot = '', wide = false, onClose }) {
  const wrap = document.createElement('div');
  wrap.className = 'sheet-wrap';
  wrap.innerHTML = `<div class="sheet-backdrop"></div>
  <div class="sheet ${wide ? 'wide' : ''}" role="dialog" aria-modal="true" aria-label="${esc(title)}">
    <div class="sheet-grab"></div>
    <div class="sheet-head"><h2>${esc(title)}</h2><button class="icon-btn" type="button" data-x="close" aria-label="Закрыть">${I.x}</button></div>
    <div class="sheet-body"></div>
    <div class="sheet-foot" ${foot ? '' : 'hidden'}></div>
  </div>`;
  const sh = {
    el: wrap, closed: false, onClose,
    body: wrap.querySelector('.sheet-body'),
    foot: wrap.querySelector('.sheet-foot'),
    close: () => closeSheet(sh),
    setBody(html) { this.body.innerHTML = html; this.body.scrollTop = 0; },
    setFoot(html) { this.foot.innerHTML = html; this.foot.hidden = !html; },
    setTitle(t) { wrap.querySelector('.sheet-head h2').textContent = t; },
  };
  sh.body.innerHTML = body;
  sh.foot.innerHTML = foot;
  document.getElementById('sheets').appendChild(wrap);
  requestAnimationFrame(() => requestAnimationFrame(() => wrap.classList.add('open')));
  document.documentElement.style.overflow = 'hidden';
  sheets.push(sh);
  history.pushState({ sheet: sheets.length }, '');
  wrap.querySelector('.sheet-backdrop').onclick = () => sh.close();
  wrap.querySelector('[data-x=close]').onclick = () => sh.close();
  return sh;
}

function closeSheet(sh, fromPop) {
  if (sh.closed) return;
  sh.closed = true;
  const i = sheets.indexOf(sh);
  if (i >= 0) sheets.splice(i, 1);
  sh.el.classList.remove('open');
  setTimeout(() => sh.el.remove(), 320);
  if (!sheets.length) document.documentElement.style.overflow = '';
  sh.onClose?.();
  if (!fromPop) { ignorePop++; history.back(); }
}

// Выполнить после закрытия всех листов (чтобы history.back не съел переход)
export function afterSheets(fn) {
  [...sheets].reverse().forEach(s => closeSheet(s));
  if (ignorePop === 0) fn(); else pending.push(fn);
}

window.addEventListener('popstate', e => {
  if (ignorePop > 0) {
    ignorePop--;
    if (ignorePop === 0) while (pending.length) pending.shift()();
    e.stopImmediatePropagation();
    return;
  }
  const top = sheets[sheets.length - 1];
  if (top) { closeSheet(top, true); e.stopImmediatePropagation(); }
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && sheets.length) sheets[sheets.length - 1].close();
});

export function confirmBox(text, okLabel = 'Удалить', danger = true) {
  return new Promise(resolve => {
    let done = false;
    const sh = openSheet({
      title: 'Подтвердите',
      body: `<p style="margin:4px 0 8px">${esc(text)}</p>`,
      foot: `<button class="btn" type="button" data-c="no">Отмена</button><button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" type="button" data-c="yes">${esc(okLabel)}</button>`,
      onClose: () => { if (!done) resolve(false); },
    });
    sh.foot.querySelector('[data-c=no]').onclick = () => sh.close();
    sh.foot.querySelector('[data-c=yes]').onclick = () => { done = true; resolve(true); sh.close(); };
  });
}

// ---------- формы ----------
const optList = o => (o || []).map(x => (Array.isArray(x) ? x : [x, x]));

function fieldHtml(f, v) {
  const val = v[f.name] ?? f.default ?? '';
  const cls = f.half ? 'field' : 'field full';
  const lab = `<span>${esc(f.label)}${f.required ? ' *' : ''}</span>`;
  const ph = f.placeholder ? `placeholder="${esc(f.placeholder)}"` : '';
  switch (f.type) {
    case 'textarea':
      return `<label class="${cls}" data-f="${f.name}">${lab}<textarea name="${f.name}" ${ph} rows="${f.rows || 3}">${esc(val)}</textarea></label>`;
    case 'select':
      return `<label class="${cls}" data-f="${f.name}">${lab}<select name="${f.name}">${optList(f.options).map(([k, l]) => `<option value="${esc(k)}" ${String(k) === String(val) ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label>`;
    case 'seg':
      return `<div class="field full" data-f="${f.name}">${lab}<div class="seg" role="radiogroup">${optList(f.options).map(([k, l]) => `<label><input type="radio" name="${f.name}" value="${esc(k)}" ${String(k) === String(val) ? 'checked' : ''}><span>${esc(l)}</span></label>`).join('')}</div></div>`;
    case 'check':
      return `<label class="check full" data-f="${f.name}"><input type="checkbox" name="${f.name}" ${val ? 'checked' : ''}> ${esc(f.label)}</label>`;
    case 'hint':
      return `<div class="hint full" data-f="${f.name}">${f.html || esc(f.text)}</div>`;
    case 'slot':
      return `<div class="full" data-f="${f.name}" data-slot="${f.name}"></div>`;
    case 'photo':
      return `<div class="field full" data-f="${f.name}"><div class="photo-pick">
        <span class="avatar lg" data-photo-preview>${val ? `<img data-file="${esc(val)}" alt="">` : (f.emoji || '📷')}</span>
        <div class="stack" style="gap:6px"><b>${esc(f.label)}</b><button type="button" class="btn btn-sm" data-photo-pick>${I.image} Выбрать фото</button></div>
        <input type="hidden" name="${f.name}" value="${esc(val)}"></div></div>`;
    case 'labitems':
      return `<div class="field full" data-f="${f.name}">${lab}<div class="li-table" data-li-table>
        <div class="li-row li-head"><div>Показатель</div><div>Значение</div><div>Норма</div><div></div></div>
        ${(val || []).map(liRow).join('')}
        </div><button type="button" class="btn btn-sm" data-li-add style="align-self:flex-start">${I.plus} Показатель</button></div>`;
    default: {
      const type = f.type === 'number' ? 'text' : (f.type || 'text');
      const im = f.type === 'number' ? 'inputmode="decimal"' : '';
      const listAttr = f.list ? `list="${f.list}"` : '';
      return `<label class="${cls}" data-f="${f.name}">${lab}<input name="${f.name}" type="${type}" ${im} ${listAttr} ${ph} value="${esc(val)}" autocomplete="off"></label>`;
    }
  }
}

export function liRow(i = {}) {
  return `<div class="li-row" data-li>
    <input data-k="name" list="dl-lab" placeholder="АЛТ" value="${esc(i.name)}">
    <input data-k="value" inputmode="decimal" placeholder="значение" value="${esc(i.value)}">
    <div class="li-range"><input data-k="min" inputmode="decimal" placeholder="от" value="${esc(i.min)}"><input data-k="max" inputmode="decimal" placeholder="до" value="${esc(i.max)}"></div>
    <button type="button" class="li-del" data-li-del aria-label="Удалить">${I.x}</button>
    <input data-k="unit" type="hidden" value="${esc(i.unit)}">
    <input data-k="suggest" type="hidden" value="${esc(i.suggest)}">
  </div>`;
}
export function readLiRows(root) {
  return $$('[data-li]', root).map(r => {
    const o = {};
    $$('[data-k]', r).forEach(inp => (o[inp.dataset.k] = inp.value.trim().replace(',', '.')));
    if (!o.suggest || o.suggest === o.value) delete o.suggest;
    return o;
  }).filter(o => o.name || o.value);
}

function readForm(form, fields) {
  const v = {};
  for (const f of fields) {
    if (['hint', 'slot'].includes(f.type)) continue;
    if (f.type === 'check') v[f.name] = !!form.querySelector(`[name="${f.name}"]`)?.checked;
    else if (f.type === 'seg') v[f.name] = form.querySelector(`[name="${f.name}"]:checked`)?.value ?? '';
    else if (f.type === 'labitems') v[f.name] = readLiRows(form.querySelector(`[data-f="${f.name}"]`));
    else {
      let x = (form.querySelector(`[name="${f.name}"]`)?.value ?? '').trim();
      if (f.type === 'number') x = x === '' ? '' : (parseFloat(x.replace(',', '.')) || 0);
      v[f.name] = x;
    }
  }
  return v;
}

export function setField(form, name, value) {
  const el = form.querySelector(`[name="${name}"]`);
  if (el) el.value = value;
}

export function openForm({ title, fields, values = {}, onSave, onDelete, saveLabel = 'Сохранить', onChange, wide, hydrate }) {
  const fid = 'f' + uid();
  const body = `<form class="form" id="${fid}" novalidate onsubmit="return false"><div class="fgrid">${fields.map(f => fieldHtml(f, values)).join('')}</div></form>`;
  const foot = `${onDelete ? `<button class="btn btn-danger" type="button" data-x="del" style="flex:0 0 auto" aria-label="Удалить">${I.trash}</button>` : ''}<button class="btn btn-primary" type="button" data-x="save">${esc(saveLabel)}</button>`;
  const sh = openSheet({ title, body, foot, wide });
  const form = sh.body.querySelector('form');
  const refresh = changed => {
    const v = readForm(form, fields);
    fields.forEach(f => { if (f.show) form.querySelector(`[data-f="${f.name}"]`).hidden = !f.show(v); });
    onChange?.(v, form, changed);
  };
  form.addEventListener('input', e => refresh(e.target.name));
  form.addEventListener('change', e => refresh(e.target.name));
  form.addEventListener('click', async e => {
    if (e.target.closest('[data-li-add]')) {
      form.querySelector('[data-li-table]').insertAdjacentHTML('beforeend', liRow());
      const rows = $$('[data-li]', form); rows[rows.length - 1].querySelector('input').focus();
    }
    const del = e.target.closest('[data-li-del]');
    if (del) del.closest('[data-li]').remove();
    const pick = e.target.closest('[data-photo-pick]');
    if (pick) {
      const box = pick.closest('[data-f]');
      const file = await pickFile('#file-photo');
      if (!file) return;
      try {
        const { thumb } = await prepareImage(file);
        const id = await putFile(thumb);
        box.querySelector('input[type=hidden]').value = id;
        box.querySelector('[data-photo-preview]').innerHTML = `<img src="${URL.createObjectURL(thumb)}" alt="">`;
      } catch (err) { toast(err.message); }
    }
  });
  form.addEventListener('keydown', e => {
    if (e.key === 'Enter' && e.target.tagName === 'INPUT') { e.preventDefault(); sh.foot.querySelector('[data-x=save]').click(); }
  });
  refresh();
  hydrate?.(sh.el);
  sh.foot.querySelector('[data-x=save]').onclick = async () => {
    const v = readForm(form, fields);
    const missing = fields.find(f => f.required && (v[f.name] === '' || v[f.name] == null) && (!f.show || f.show(v)));
    if (missing) {
      toast(`Заполните поле «${missing.label}»`);
      form.querySelector(`[name="${missing.name}"]`)?.focus();
      return;
    }
    const res = await onSave(v);
    if (res !== false) sh.close();
  };
  if (onDelete) {
    sh.foot.querySelector('[data-x=del]').onclick = async () => {
      if (await confirmBox('Удалить эту запись? Действие нельзя отменить.')) { onDelete(); sh.close(); }
    };
  }
  return { sh, form };
}

export function pickFile(sel) {
  return new Promise(resolve => {
    const inp = $(sel);
    inp.value = '';
    const onChange = () => { inp.removeEventListener('change', onChange); resolve(inp.files[0] || null); };
    inp.addEventListener('change', onChange);
    inp.click();
  });
}
