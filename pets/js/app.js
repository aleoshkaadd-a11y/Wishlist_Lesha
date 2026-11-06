import { state, storage, loadState, save, upsert, remove, list, uid, putFile, fileUrl, exportAll, importAll, wipeAll } from './store.js';
import { env, initEnv } from './env.js';
import * as D from './data.js';
import * as L from './logic.js';
import { prepareImage, processPhoto, sampleReady } from './scan.js';
import { $, $$, esc, I, toast, openSheet, openForm, confirmBox, afterSheets, pickFile, setField, liRow, readLiRows } from './ui.js';

const ui = { vacFilter: 'all', calMonth: L.today().slice(0, 7), calSel: L.today(), calAll: false, charts: new Map() };

// ---------- маршрутизация ----------
function route() {
  const h = location.hash.replace(/^#\/?/, '') || 'home';
  const [name, ...args] = h.split(/[-/]/);
  return { name, args };
}
const go = r => { const h = '#' + r.replace(/\//g, '-'); if (location.hash === h) render(); else location.hash = h; };
window.addEventListener('hashchange', () => { render(); window.scrollTo(0, 0); });

// ---------- общие куски разметки ----------
const avatar = (p, size = '') => `<span class="avatar ${size}">${p?.photoId ? `<img data-file="${esc(p.photoId)}" alt="">` : L.petEmoji(p)}</span>`;
const sexLabel = p => (p.sex === 'f' ? '♀ Девочка' : p.sex === 'm' ? '♂ Мальчик' : '');
const emptyBox = (e, title, text, btns = '') => `<div class="empty"><div class="e">${e}</div><b>${esc(title)}</b><p class="small">${text}</p>${btns ? `<div class="row wrap" style="justify-content:center">${btns}</div>` : ''}</div>`;
const pill = (cls, text) => `<span class="pill ${cls}">${esc(text)}</span>`;

function hydrate(root = document) {
  $$('img[data-file]', root).forEach(async img => {
    const u = await fileUrl(img.dataset.file);
    if (u) img.src = u; else img.closest('.avatar, .doc-img')?.classList.add('noimg');
  });
}

function applyTheme() {
  const t = state.settings.theme;
  if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t;
  else delete document.documentElement.dataset.theme;
}

const NAV = [
  { r: 'home', label: 'Главная', icon: I.home },
  { r: 'vaccines', label: 'Прививки', icon: I.syringe },
  { r: 'calendar', label: 'Календарь', icon: I.calendar },
  { r: 'heat', label: 'Течка', icon: I.flower, heat: true },
  { r: 'health', label: 'Здоровье', icon: I.health },
  { r: 'docs', label: 'Документы', icon: I.file },
  { r: 'prefs', label: 'Настройки', icon: I.settings },
];

function renderSidebar(pet, r) {
  return `<div class="logo"><span class="logo-mark">${I.paw}</span>Лапки</div>
  <div>
    <div class="side-label">Питомцы</div>
    <div class="side-pets">
      ${state.pets.map(p => `<button class="side-pet ${p.id === pet.id ? 'active' : ''}" data-act="switchPet" data-id="${p.id}">${avatar(p, 'sm')}<span class="grow"><b class="ellipsis" style="display:block">${esc(p.name)}</b><span class="tiny muted">${esc(p.breed || D.SPECIES[p.species]?.label || '')}</span></span></button>`).join('')}
      <button class="side-pet" data-act="addPet"><span class="avatar sm" style="background:var(--surface-2)">${I.plus}</span><span class="muted" style="font-weight:600">Добавить питомца</span></button>
    </div>
  </div>
  <button class="btn btn-primary btn-block" data-act="scan">${I.camera} Фото документа</button>
  <nav class="side-nav">
    ${NAV.filter(n => !n.heat || L.tracksHeat(pet)).map(n => `<button class="side-link ${r.name === n.r || (n.r === 'health' && r.name === 'test') ? 'active' : ''}" data-act="go" data-route="${n.r}">${n.icon}${n.label}</button>`).join('')}
  </nav>
  <div class="side-foot tiny muted">${storage.mode === 'cloud' ? 'Данные видны только вам.' : 'Данные хранятся только на этом устройстве.'}<br>Не заменяет консультацию ветеринара.</div>`;
}

function renderTopbar(pet) {
  return `<button class="pet-switch grow" data-act="petPicker" aria-label="Выбрать питомца">${avatar(pet, 'sm')}<b class="ellipsis">${esc(pet.name)}</b>${I.chevD.replace('<svg', '<svg style="width:18px;height:18px;flex:none;color:var(--muted)"')}</button>
  <button class="icon-btn" data-act="go" data-route="docs" aria-label="Документы">${I.file}</button>
  <button class="icon-btn" data-act="go" data-route="prefs" aria-label="Настройки">${I.settings}</button>`;
}

function renderTabbar(r) {
  const t = (route, label, icon) => `<button class="tab ${r.name === route || (route === 'health' && r.name === 'test') ? 'active' : ''}" data-act="go" data-route="${route}">${icon}<span>${label}</span></button>`;
  return t('home', 'Главная', I.home) + t('vaccines', 'Прививки', I.syringe) +
    `<button class="tab tab-fab" data-act="scan" aria-label="Сфотографировать документ"><span>${I.camera}</span></button>` +
    t('calendar', 'Календарь', I.calendar) + t('health', 'Здоровье', I.health);
}

// ---------- рендер ----------
function render() {
  applyTheme();
  const app = $('#app');
  if (!state.pets.length) {
    app.classList.add('bare');
    $('#view').innerHTML = vWelcome();
    return;
  }
  app.classList.remove('bare');
  const pet = L.currentPet();
  if (state.currentPetId !== pet.id) { state.currentPetId = pet.id; save(); }
  const r = route();
  $('#sidebar').innerHTML = renderSidebar(pet, r);
  $('#topbar').innerHTML = renderTopbar(pet, r);
  $('#tabbar').innerHTML = renderTabbar(r);
  const views = { home: vHome, vaccines: vVaccines, calendar: vCalendar, heat: vHeat, health: vHealth, test: vTest, docs: vDocs, prefs: vSettings, pets: vPets };
  ui.charts.clear();
  $('#view').innerHTML = (views[r.name] || vHome)(pet, r.args);
  hydrate($('#view'));
  hydrate($('#sidebar'));
  hydrate($('#topbar'));
  bindCharts();
  $$('.seg .on', $('#view')).forEach(b => b.scrollIntoView({ inline: 'center', block: 'nearest' }));
  document.title = `${pet.name} · Лапки`;
}

// ---------- приветствие ----------
function vWelcome() {
  return `<div class="welcome"><div class="welcome-card">
    <div class="welcome-art">${I.paw}</div>
    <h1>Лапки</h1>
    <p class="muted" style="margin:8px 0 0">Медицинская карта вашего питомца — всегда под рукой, на телефоне и компьютере.</p>
    <div class="feature-list">
      <div><span class="bubble c-vac">💉</span>Прививки и обработки с напоминаниями</div>
      <div><span class="bubble c-heat">🌸</span>Календарь течки и прогноз следующей</div>
      <div><span class="bubble c-test">🧪</span>Анализы с автоматической расшифровкой</div>
      <div><span class="bubble c-accent">📷</span>Сфотографируйте документ — всё разнесётся само</div>
    </div>
    <div class="stack">
      <button class="btn btn-primary btn-block" data-act="addPet">${I.plus} Добавить питомца</button>
      <button class="btn btn-block" data-act="demo">Посмотреть на примере</button>
      <button class="btn btn-ghost btn-block small" data-act="importJson">${I.upload} Восстановить из резервной копии</button>
    </div>
  </div></div>`;
}

// ---------- главная ----------
function eventItem(e, showPet) {
  const d = L.parseISO(e.date);
  return `<button class="item" data-act="${e.act}" data-id="${e.id || ''}" data-route="${e.route || ''}" data-pet="${e.pet.id}">
    <span class="bubble c-${e.kind === 'vac' ? 'vac' : e.kind === 'heat' ? 'heat' : 'med'}" style="flex-direction:column;gap:0;font-size:11px;font-weight:800;line-height:1.05"><span style="font-size:16px;font-family:var(--font-display)">${d.getDate()}</span>${d.toLocaleDateString('ru-RU', { month: 'short' }).replace('.', '')}</span>
    <span class="item-main"><span class="item-title ellipsis" style="display:block">${e.icon} ${esc(e.title)}</span><span class="item-sub">${showPet ? esc(e.pet.name) + ' · ' : ''}${esc(e.sub)}</span></span>
    <span class="item-meta">${pill(e.cls, e.status)}</span>
  </button>`;
}

function petAlerts(pet) {
  const out = [];
  const overdue = L.vaccineGroups(pet.id).filter(r => r.next && r.next < L.today());
  if (overdue.length) out.push(`<button class="alert" data-act="go" data-route="vaccines" style="text-align:left;width:100%"><span class="alert-icon">⏰</span><span class="grow"><b>Просрочено: ${overdue.map(r => esc(r.name)).join(', ')}</b><br><span class="small">Запишитесь к ветеринару или отметьте процедуру, если она уже сделана.</span></span></button>`);
  const conflicts = [];
  list('feeds', pet.id).filter(f => !f.until || f.until >= L.today()).forEach(f => {
    const c = L.allergyConflicts(pet.id, L.feedText(f));
    if (c.length) conflicts.push(`корм «${esc(f.name)}» — ${c.map(a => esc(a.allergen)).join(', ')}`);
  });
  list('meds', pet.id).filter(L.medActive).forEach(m => {
    const c = L.allergyConflicts(pet.id, L.medText(m));
    if (c.length) conflicts.push(`лекарство «${esc(m.name)}» — ${c.map(a => esc(a.allergen)).join(', ')}`);
  });
  if (conflicts.length) out.push(`<button class="alert" data-act="go" data-route="health/allergies" style="text-align:left;width:100%"><span class="alert-icon">⚠️</span><span class="grow"><b>Возможный аллерген</b><br><span class="small">${conflicts.join('<br>')}</span></span></button>`);
  if (L.tracksHeat(pet)) {
    const h = L.heatInfo(pet);
    if (h.current) out.push(`<button class="alert heat" data-act="go" data-route="heat" style="text-align:left;width:100%"><span class="alert-icon">🌸</span><span class="grow"><b>Идёт течка — ${h.current.day}-й день</b><br><span class="small">${h.fertileNow ? 'Сейчас благоприятные дни для вязки (ориентировочно).' : 'Будьте внимательны на прогулках.'} ${h.current.open ? 'Не забудьте отметить окончание.' : ''}</span></span></button>`);
  }
  return out.join('');
}

function vHome(pet) {
  const w = L.latestWeight(pet.id);
  const age = L.ageText(pet.birth);
  const groups = L.vaccineGroups(pet.id);
  const overdue = groups.filter(g => g.next && g.next < L.today()).length;
  const events = L.petEvents(pet, { from: L.today(), to: L.addDays(L.today(), 120) }).slice(0, 6);
  const meds = list('meds', pet.id).filter(L.medActive);
  const feeds = list('feeds', pet.id).filter(f => !f.until || f.until >= L.today());
  const tests = list('tests', pet.id).sort((a, b) => (a.date < b.date ? 1 : -1));
  const lastTest = tests[0];
  const lastSum = lastTest ? L.testSummary(lastTest, pet.species) : null;
  const allergies = list('allergies', pet.id);
  const docs = list('docs', pet.id);
  const nextVac = groups.find(g => g.next);
  const ws = list('weights', pet.id).sort((a, b) => (a.date < b.date ? -1 : 1));
  const wDelta = ws.length > 1 ? +(ws[ws.length - 1].kg - ws[ws.length - 2].kg).toFixed(2) : null;
  let heatTile = '';
  if (L.tracksHeat(pet)) {
    const h = L.heatInfo(pet);
    heatTile = tile('heat', '🌸', 'Течка', h.current ? `Идёт ${h.current.day}-й день` : h.next ? (h.daysToNext >= 0 ? `Через ${L.nDays(h.daysToNext)} · ${L.fmtDate(h.next.start)}` : 'Задерживается') : 'Добавьте первую запись', 'heat');
  }
  return `<div class="stack-lg">
    <section class="card hero">
      <svg class="hero-paw" viewBox="0 0 24 24">${I.paw.replace(/^<svg[^>]*>|<\/svg>$/g, '')}</svg>
      <div class="row" style="align-items:flex-start">
        ${avatar(pet, 'lg')}
        <div class="grow">
          <h1 class="ellipsis">${esc(pet.name)}</h1>
          <div class="row wrap" style="gap:6px;margin-top:6px">
            ${pet.breed ? `<span class="chip-light">${esc(pet.breed)}</span>` : ''}
            ${sexLabel(pet) ? `<span class="chip-light">${sexLabel(pet)}</span>` : ''}
            ${pet.sterilized ? `<span class="chip-light">стерилизован${pet.sex === 'f' ? 'а' : ''}</span>` : ''}
          </div>
        </div>
        <button class="icon-btn" data-act="editPet" data-id="${pet.id}" aria-label="Редактировать профиль">${I.edit}</button>
      </div>
      <div class="hero-stats">
        <button class="hero-stat" data-act="go" data-route="health/weight" style="text-align:left;color:inherit"><b>${w ? String(w.kg).replace('.', ',') + ' кг' : '—'}</b><span>вес</span></button>
        <div class="hero-stat"><b>${esc(age || '—')}</b><span>возраст</span></div>
        <button class="hero-stat" data-act="go" data-route="vaccines" style="text-align:left;color:inherit"><b>${groups.length ? (overdue ? `${overdue} ⏰` : 'В норме') : '—'}</b><span>прививки</span></button>
      </div>
    </section>
    ${petAlerts(pet)}
    <button class="card scan-card" data-act="scan">
      <span class="bubble c-accent">${I.camera}</span>
      <span class="grow"><b style="font-family:var(--font-display);font-size:17px">Сфотографировать документ</b><br><span class="small muted">Ветпаспорт, анализы, лекарство или корм — приложение само распознает и разнесёт по разделам</span></span>
      ${I.chevR.replace('<svg', '<svg style="width:22px;color:var(--muted);flex:none"')}
    </button>
    <div class="grid-2">
      <section class="card">
        <div class="card-head"><h2>Ближайшие события</h2><button class="link-btn" data-act="go" data-route="calendar">Календарь</button></div>
        ${events.length ? `<div class="list">${events.map(e => eventItem(e)).join('')}</div>` : emptyBox('🗓️', 'Пока ничего не запланировано', 'Добавьте прививки или обработки — здесь появятся напоминания о следующих.', `<button class="btn btn-sm" data-act="addVaccine">${I.plus} Прививка</button>`)}
      </section>
      <section class="tiles">
        ${tile('vaccines', '💉', 'Прививки', nextVac ? `${esc(nextVac.name)} · ${L.vaccineStatus(nextVac.next).label}` : 'Нет записей', 'vac')}
        ${heatTile}
        ${tile('health/meds', '💊', 'Лекарства', meds.length ? meds.map(m => esc(m.name)).join(', ') : 'Нет активных курсов', 'med')}
        ${tile('health/feeds', '🥣', 'Корма', feeds.length ? feeds.map(f => esc(f.name)).join(', ') : 'Не указан', 'feed')}
        ${tile('health/tests', '🧪', 'Анализы', lastTest ? `${L.fmtDate(lastTest.date)} · ${lastSum.bad.length ? `отклонений: ${lastSum.bad.length}` : 'в норме'}` : 'Нет результатов', 'test')}
        ${tile('health/allergies', '⚠️', 'Аллергии', allergies.length ? allergies.map(a => esc(a.allergen)).join(', ') : 'Не выявлены', 'allergy')}
        ${tile('health/weight', '⚖️', 'Вес', w ? `${String(w.kg).replace('.', ',')} кг${wDelta ? ` (${wDelta > 0 ? '+' : ''}${String(wDelta).replace('.', ',')})` : ''}` : 'Не указан', 'weight')}
        ${tile('docs', '📄', 'Документы', docs.length ? `${docs.length} ${L.plural(docs.length, ['файл', 'файла', 'файлов'])}` : 'Нет фото', 'doc')}
      </section>
    </div>
  </div>`;
}
const tile = (r, e, title, sub, c) => `<button class="tile c-${c}" data-act="go" data-route="${r}"><span class="bubble c-${c}">${e}</span><span><b>${title}</b><small>${sub}</small></span></button>`;

// ---------- прививки ----------
function vaccineForm(rec = {}, pet = L.currentPet()) {
  const isNew = !rec.id;
  const kind = rec.kind || 'vaccine';
  let nextTouched = !!rec.next;
  const listFor = k => (k === 'deworm' ? 'dl-deworm' : k === 'flea' ? 'dl-flea' : 'dl-vac');
  const { form } = openForm({
    title: isNew ? 'Новая запись' : 'Прививка / обработка',
    values: { kind, date: L.today(), next: L.suggestNext(kind, rec.date || L.today()), ...rec },
    fields: [
      { name: 'kind', label: 'Тип', type: 'seg', options: [['vaccine', '💉 Вакцина'], ['deworm', '🪱 Глисты'], ['flea', '🕷️ Клещи'], ['other', '🩺 Другое']] },
      { name: 'name', label: 'Препарат', required: true, list: listFor(kind), placeholder: 'Например, Нобивак DHPPi+L' },
      { name: 'date', label: 'Когда сделано', type: 'date', half: true, required: true },
      { name: 'next', label: 'Следующая', type: 'date', half: true },
      { name: 'nextHint', type: 'hint', text: '' },
      { name: 'clinic', label: 'Клиника / врач', half: true },
      { name: 'batch', label: 'Серия препарата', half: true },
      { name: 'notes', label: 'Заметки', type: 'textarea', rows: 2 },
    ],
    onChange(v, f, changed) {
      if (changed === 'next') nextTouched = true;
      if ((changed === 'kind' || changed === 'date') && !nextTouched) setField(f, 'next', L.suggestNext(v.kind, v.date));
      if (changed === 'kind') f.querySelector('[name=name]').setAttribute('list', listFor(v.kind));
      const n = v.next || '';
      const hint = f.querySelector('[data-f=nextHint]');
      hint.innerHTML = n ? `🔔 Напомню ${L.fmtDate(n, true)} (${L.relDays(n)}). Обычно: прививки — раз в год, от глистов — раз в 3 месяца, от блох и клещей — каждый месяц (Бравекто — раз в 12 недель).` : 'Без даты повтора напоминания не будет.';
    },
    onSave(v) {
      delete v.nextHint;
      upsert('vaccines', { ...rec, ...v, petId: rec.petId || pet.id });
      toast(isNew ? 'Запись добавлена' : 'Сохранено');
      render();
    },
    onDelete: isNew ? null : () => { remove('vaccines', rec.id); toast('Удалено'); render(); },
  });
  return form;
}

function vVaccines(pet) {
  const all = list('vaccines', pet.id).sort((a, b) => (a.date < b.date ? 1 : -1));
  const f = ui.vacFilter;
  const filt = r => f === 'all' || r.kind === f;
  const groups = L.vaccineGroups(pet.id).filter(filt);
  const hist = all.filter(filt);
  const seg = [['all', 'Все'], ['vaccine', 'Прививки'], ['deworm', 'Глисты'], ['flea', 'Блохи и клещи']];
  const groupRow = g => {
    const st = L.vaccineStatus(g.next);
    const total = g.next ? Math.max(1, L.diffDays(g.date, g.next)) : 1;
    const passed = g.next ? Math.min(total, Math.max(0, L.diffDays(g.date, L.today()))) : 0;
    const pct = g.next ? Math.round((passed / total) * 100) : 0;
    const c = st.cls === 'bad' ? 'var(--bad)' : st.cls === 'warn' ? 'var(--warn)' : 'var(--c-vac)';
    return `<div class="item" style="flex-wrap:wrap">
      <span class="bubble c-vac">${D.REC_KINDS[g.kind]?.icon || '💉'}</span>
      <button class="item-main" data-act="editVaccine" data-id="${g.id}" style="text-align:left">
        <span class="item-title">${esc(g.name)}</span>
        <span class="item-sub" style="display:block">${D.REC_KINDS[g.kind]?.label} · сделано ${L.fmtDate(g.date)}${g.next ? ` · повтор ${L.fmtDate(g.next, true)}` : ''}</span>
        ${g.next ? `<div class="progress" style="margin-top:8px;--c:${c}"><i style="width:${pct}%"></i></div>` : ''}
      </button>
      <span class="item-meta stack" style="gap:6px;align-items:flex-end">${pill(st.cls, st.label)}
        ${g.next ? `<button class="btn btn-sm" data-act="repeatVaccine" data-id="${g.id}">${I.check} Сделано</button>` : ''}</span>
    </div>`;
  };
  return `<div class="view-head"><h1>Прививки</h1><button class="icon-btn" data-act="scanKind" data-kind="vaccines" aria-label="Сфотографировать ветпаспорт">${I.camera}</button><button class="add-btn" data-act="addVaccine" aria-label="Добавить">${I.plus}</button></div>
  <div class="stack-lg">
    <div class="seg sticky">${seg.map(([k, l]) => `<button class="${f === k ? 'on' : ''}" data-act="vacFilter" data-k="${k}">${l}</button>`).join('')}</div>
    ${groups.length ? `<section class="card"><div class="card-head"><h2>Актуальный статус</h2></div><div class="list">${groups.map(groupRow).join('')}</div></section>` :
      `<section class="card">${emptyBox('💉', 'Записей пока нет', 'Сфотографируйте страницу ветпаспорта с наклейками вакцин — даты и препараты подставятся сами. Или добавьте вручную.', `<button class="btn btn-primary btn-sm" data-act="scanKind" data-kind="vaccines">${I.camera} Ветпаспорт</button><button class="btn btn-sm" data-act="addVaccine">${I.plus} Вручную</button>`)}</section>`}
    ${hist.length ? `<section class="card"><div class="card-head"><h2>История</h2><span class="muted small">${hist.length}</span></div><div class="list">
      ${hist.map(r => `<button class="item" data-act="editVaccine" data-id="${r.id}"><span class="bubble c-vac" style="width:36px;height:36px;font-size:16px">${D.REC_KINDS[r.kind]?.icon || '💉'}</span><span class="item-main"><span class="item-title">${esc(r.name)}</span><span class="item-sub" style="display:block">${[r.clinic, r.batch && 'серия ' + r.batch].filter(Boolean).map(esc).join(' · ') || D.REC_KINDS[r.kind]?.label}</span></span><span class="item-meta">${L.fmtDate(r.date, true)}${r.docId ? '<br>📎' : ''}</span></button>`).join('')}
    </div></section>` : ''}
  </div>`;
}

// ---------- течка ----------
function heatForm(rec = {}, pet = L.currentPet()) {
  const isNew = !rec.id;
  openForm({
    title: isNew ? 'Новая течка' : 'Течка',
    values: { start: L.today(), ...rec },
    fields: [
      { name: 'start', label: 'Начало', type: 'date', half: true, required: true },
      { name: 'end', label: 'Окончание', type: 'date', half: true },
      { name: 'h', type: 'hint', text: 'Если течка ещё идёт — оставьте окончание пустым и отметьте позже.' },
      { name: 'mating', label: 'Дата вязки (если была)', type: 'date' },
      { name: 'notes', label: 'Заметки', type: 'textarea', rows: 2, placeholder: 'Обильность, поведение, самочувствие' },
    ],
    onSave(v) {
      if (v.end && v.end < v.start) { toast('Окончание раньше начала'); return false; }
      delete v.h;
      upsert('heats', { ...rec, ...v, petId: rec.petId || pet.id });
      toast('Сохранено');
      render();
    },
    onDelete: isNew ? null : () => { remove('heats', rec.id); render(); },
  });
}

function vHeat(pet) {
  if (!L.tracksHeat(pet)) {
    return `<div class="view-head"><h1>Течка</h1></div><section class="card">${emptyBox('🌸', 'Не отслеживается', pet.sex !== 'f' ? 'Календарь течки доступен для девочек. Пол указывается в профиле питомца.' : 'Питомец отмечен как стерилизованный. Если это не так — измените профиль.', `<button class="btn btn-sm" data-act="editPet" data-id="${pet.id}">${I.edit} Профиль</button>`)}</section>`;
  }
  const h = L.heatInfo(pet);
  const R = 62, C = 2 * Math.PI * R;
  let frac = 0, big = '—', small = '';
  if (h.current) { frac = Math.min(1, h.current.day / h.duration); big = h.current.day; small = 'день течки'; }
  else if (h.next) {
    const last = h.recs[h.recs.length - 1];
    const tot = L.diffDays(last.start, h.next.start) || h.interval;
    frac = Math.min(1, Math.max(0, L.diffDays(last.start, L.today()) / tot));
    big = h.daysToNext >= 0 ? h.daysToNext : '!';
    small = h.daysToNext >= 0 ? `${L.plural(h.daysToNext, ['день', 'дня', 'дней'])} до течки` : 'задерживается';
  }
  const ring = `<div class="ring-wrap"><svg viewBox="0 0 150 150"><circle cx="75" cy="75" r="${R}" fill="none" stroke="var(--surface-2)" stroke-width="12"/><circle cx="75" cy="75" r="${R}" fill="none" stroke="var(--c-heat)" stroke-width="12" stroke-linecap="round" stroke-dasharray="${C}" stroke-dashoffset="${C * (1 - frac)}"/></svg><div class="ring-label"><div><b>${big}</b><span>${small}</span></div></div></div>`;
  const open = h.current?.open;
  const recs = h.recs.slice().reverse();
  return `<div class="view-head"><h1>Течка</h1><button class="add-btn" data-act="addHeat" aria-label="Добавить">${I.plus}</button></div>
  <div class="grid-2">
    <section class="card stack">
      <div class="row" style="gap:18px;flex-wrap:wrap">
        ${ring}
        <div class="grow stack" style="gap:8px;min-width:180px">
          ${h.current ? `<h2>Идёт течка</h2><div class="muted small">Началась ${L.fmtDate(h.current.rec.start, true)}. Ожидаемое окончание — ${L.fmtDate(h.current.end)}.</div>${h.fertileNow ? pill('heat', '💗 Благоприятные дни для вязки') : ''}` :
            h.next ? `<h2>${h.daysToNext >= 0 ? 'Следующая течка' : 'Течка задерживается'}</h2><div class="muted small">Прогноз: <b style="color:var(--ink)">${L.fmtDate(h.next.start, true)} – ${L.fmtDate(h.next.end)}</b>${h.daysToNext < 0 ? `<br>Ожидалась ${L.nDays(-h.daysToNext)} назад. Если началась — отметьте.` : ''}</div>` :
            `<h2>Нет данных</h2><div class="muted small">Отметьте начало текущей или прошлой течки — приложение рассчитает прогноз.</div>`}
          <div class="row wrap">
            ${open ? `<button class="btn btn-primary btn-sm" data-act="heatEnd" data-id="${h.current.rec.id}">${I.check} Закончилась сегодня</button>` :
              !h.current ? `<button class="btn btn-primary btn-sm" data-act="heatStart">${I.flower} Началась сегодня</button>` : ''}
          </div>
        </div>
      </div>
      <div class="stat-row">
        <div class="stat"><b>${h.interval}</b><span>дней — цикл${h.learned ? '' : ' (обычно)'}</span></div>
        <div class="stat"><b>${h.duration}</b><span>дней — длительность</span></div>
        <div class="stat"><b>${h.count}</b><span>${L.plural(h.count, ['запись', 'записи', 'записей'])}</span></div>
      </div>
      ${!h.learned ? `<div class="hint">📈 Прогноз станет точнее после двух и более записей — приложение подстроится под индивидуальный цикл питомца.</div>` : ''}
    </section>
    <section class="card">
      <div class="card-head"><h2>Прогноз</h2></div>
      ${h.predicted.length ? `<div class="list">${h.predicted.map((p, i) => `<div class="item"><span class="bubble c-heat">${i + 1}</span><span class="item-main"><span class="item-title">${L.fmtDate(p.start, true)} – ${L.fmtDate(p.end)}</span>${p.fertile ? `<span class="item-sub" style="display:block">💗 вязка ≈ ${L.fmtDate(p.fertile[0])} – ${L.fmtDate(p.fertile[1])}</span>` : ''}</span><span class="item-meta">${L.relDays(p.start)}</span></div>`).join('')}</div>
      ${pet.species === 'dog' ? '<p class="tiny muted" style="margin:10px 0 0">Благоприятные дни — ориентировочно 10–15-й день от начала. Точнее определяется тестом на прогестерон у ветеринара.</p>' : ''}` : emptyBox('🔮', 'Пока нечего прогнозировать', 'Нужна хотя бы одна запись.')}
    </section>
    <section class="card span-2">
      <div class="card-head"><h2>История</h2><button class="link-btn" data-act="go" data-route="calendar">В календаре</button></div>
      ${recs.length ? `<div class="list">${recs.map((r, i) => {
        const prev = recs[i + 1];
        const dur = r.end ? L.diffDays(r.start, r.end) + 1 : null;
        return `<button class="item" data-act="editHeat" data-id="${r.id}"><span class="bubble c-heat">🌸</span><span class="item-main"><span class="item-title">${L.fmtDate(r.start, true)}${r.end ? ' – ' + L.fmtDate(r.end, true) : ' — идёт'}</span><span class="item-sub" style="display:block">${[dur && L.nDays(dur), prev && `цикл ${L.nDays(L.diffDays(prev.start, r.start))}`, r.mating && `вязка ${L.fmtDate(r.mating)}`, r.notes].filter(Boolean).map(esc).join(' · ')}</span></span>${I.chevR.replace('<svg', '<svg style="width:18px;color:var(--muted);flex:none"')}</button>`;
      }).join('')}</div>` : emptyBox('🌸', 'Записей нет', 'Отметьте последнюю течку, даже если помните дату примерно.', `<button class="btn btn-sm" data-act="addHeat">${I.plus} Добавить</button>`)}
    </section>
  </div>`;
}

// ---------- календарь ----------
function calendarMarks(pets, from, to) {
  const m = {};
  const add = (d, k, info) => { if (d < from || d > to) return; (m[d] ||= { cls: new Set(), dots: [], items: [], med: false }); m[d].cls.add(k); if (info) m[d].items.push(info); };
  const range = (a, b, fn) => { let d = a < from ? from : a; const end = b > to ? to : b; let n = 0; while (d <= end && n < 400) { fn(d); d = L.addDays(d, 1); n++; } };
  const multi = pets.length > 1;
  for (const pet of pets) {
    const pn = multi ? pet.name + ': ' : '';
    list('vaccines', pet.id).forEach(r => { add(r.date, 'dot-vac', { e: D.REC_KINDS[r.kind]?.icon || '💉', t: pn + r.name, s: 'сделано', act: 'editVaccine', id: r.id, pet: pet.id }); m[r.date]?.dots.push('vac'); });
    L.vaccineGroups(pet.id).forEach(r => { if (r.next) { add(r.next, 'due', { e: '🔔', t: pn + r.name, s: 'запланировано', act: 'editVaccine', id: r.id, pet: pet.id, cls: L.vaccineStatus(r.next).cls }); m[r.next]?.dots.push('due'); } });
    list('tests', pet.id).forEach(t => { add(t.date, 'test', { e: '🧪', t: pn + t.type, s: 'анализ', act: 'openTest', id: t.id, pet: pet.id }); m[t.date]?.dots.push('test'); });
    list('meds', pet.id).forEach(md => {
      if (!md.start) return;
      const end = md.end || (md.start <= L.today() ? L.today() : md.start);
      range(md.start, end, d => { add(d, 'med', d === md.start ? { e: '💊', t: pn + md.name, s: 'начало курса', act: 'editMed', id: md.id, pet: pet.id } : d === md.end ? { e: '💊', t: pn + md.name, s: 'конец курса', act: 'editMed', id: md.id, pet: pet.id } : null); m[d].med = true; });
    });
    if (L.tracksHeat(pet)) {
      const h = L.heatInfo(pet);
      h.recs.forEach(r => {
        const end = r.end || (h.current?.rec.id === r.id ? h.current.end : L.addDays(r.start, h.duration - 1));
        range(r.start, end, d => add(d, 'heat', d === r.start ? { e: '🌸', t: pn + 'Начало течки', s: '', act: 'editHeat', id: r.id, pet: pet.id } : null));
        if (pet.species === 'dog') range(L.addDays(r.start, 9), L.addDays(r.start, 14) > end ? end : L.addDays(r.start, 14), d => add(d, 'fertile'));
        if (r.mating) add(r.mating, 'heat', { e: '💗', t: pn + 'Вязка', s: '', act: 'editHeat', id: r.id, pet: pet.id });
      });
      h.predicted.forEach(p => {
        range(p.start, p.end, d => add(d, 'heat-pred', d === p.start ? { e: '🔮', t: pn + 'Ожидается течка', s: 'прогноз', act: 'go', route: 'heat', pet: pet.id } : null));
        if (p.fertile) range(p.fertile[0], p.fertile[1], d => add(d, 'fertile'));
      });
    }
  }
  return m;
}

function vCalendar(pet) {
  const [y, mo] = ui.calMonth.split('-').map(Number);
  const first = new Date(y, mo - 1, 1, 12);
  const startOffset = (first.getDay() + 6) % 7;
  const gridStart = L.addDays(L.isoOf(first), -startOffset);
  const gridEnd = L.addDays(gridStart, 41);
  const pets = ui.calAll ? state.pets : [pet];
  const marks = calendarMarks(pets, gridStart, gridEnd);
  const t = L.today();
  let cells = '';
  for (let i = 0; i < 42; i++) {
    const d = L.addDays(gridStart, i);
    const mk = marks[d];
    const cls = ['cal-day'];
    if (d.slice(0, 7) !== ui.calMonth) cls.push('out');
    if (d === t) cls.push('today');
    if (d === ui.calSel) cls.push('sel');
    if (mk) {
      if (mk.cls.has('fertile')) cls.push('fertile');
      if (mk.cls.has('heat')) cls.push('heat');
      else if (mk.cls.has('heat-pred')) cls.push('heat-pred');
    }
    const dots = mk ? [...new Set(mk.dots)].slice(0, 3).map(k => k === 'vac' ? '<i style="--c:var(--c-vac)"></i>' : k === 'due' ? '<i class="ring" style="--c:var(--c-vac)"></i>' : '<i style="--c:var(--c-test)"></i>').join('') : '';
    cells += `<button class="${cls.join(' ')}" data-act="calDay" data-d="${d}" aria-label="${L.fmtDate(d, true)}"><span class="num">${+d.slice(8)}</span><span class="cal-dots">${dots}</span>${mk?.med ? '<span class="cal-medline"></span>' : ''}</button>`;
  }
  const sel = marks[ui.calSel];
  const selItems = sel ? sel.items : [];
  const selFlags = [];
  if (sel?.cls.has('heat')) selFlags.push('🌸 течка');
  if (sel?.cls.has('heat-pred') && !sel.cls.has('heat')) selFlags.push('🔮 прогноз течки');
  if (sel?.cls.has('fertile')) selFlags.push('💗 благоприятные дни для вязки');
  const monthName = first.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' }).replace(' г.', '');
  return `<div class="view-head"><h1>Календарь</h1>${env.artifact ? '' : `<button class="btn btn-sm" data-act="exportIcs" title="Добавить события в календарь телефона">${I.download} В календарь</button>`}</div>
  <div class="grid-2">
    <section class="card">
      <div class="cal-head">
        <button class="icon-btn" data-act="calMove" data-n="-1" aria-label="Предыдущий месяц">${I.chevL}</button>
        <h2 class="center">${monthName}</h2>
        <button class="icon-btn" data-act="calMove" data-n="1" aria-label="Следующий месяц">${I.chevR}</button>
      </div>
      <div class="cal-grid">${['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].map(d => `<div class="cal-dow">${d}</div>`).join('')}${cells}</div>
      <div class="legend">
        <span><i style="--c:var(--c-vac)"></i>сделано</span><span><i class="ring" style="--c:var(--c-vac)"></i>запланировано</span>
        <span><i style="--c:var(--c-test)"></i>анализ</span><span><i class="bar"></i>лекарство</span>
        ${pets.some(L.tracksHeat) ? '<span><i class="band"></i>течка</span><span><i class="band pred"></i>прогноз</span><span><i class="band fert"></i>вязка</span>' : ''}
      </div>
      <div class="row between" style="margin-top:14px">
        ${state.pets.length > 1 ? `<label class="check small"><input type="checkbox" data-act="calAll" ${ui.calAll ? 'checked' : ''}> Все питомцы</label>` : '<span></span>'}
        ${ui.calMonth !== t.slice(0, 7) ? `<button class="link-btn" data-act="calToday">Сегодня</button>` : ''}
      </div>
    </section>
    <section class="card">
      <div class="card-head"><h2>${L.fmtDate(ui.calSel, true)}</h2><span class="muted small">${ui.calSel === t ? 'сегодня' : L.relDays(ui.calSel)}</span></div>
      ${selFlags.length ? `<div class="row wrap" style="gap:6px;margin-bottom:8px">${selFlags.map(f => pill('heat', f)).join('')}</div>` : ''}
      ${selItems.length ? `<div class="list">${selItems.map(it => `<button class="item" data-act="${it.act}" data-id="${it.id || ''}" data-route="${it.route || ''}" data-pet="${it.pet}"><span class="bubble">${it.e}</span><span class="item-main"><span class="item-title">${esc(it.t)}</span><span class="item-sub">${esc(it.s)}</span></span>${it.cls ? pill(it.cls, it.cls === 'bad' ? 'просрочено' : it.cls === 'warn' ? 'скоро' : 'в плане') : ''}</button>`).join('')}</div>` :
        selFlags.length ? '' : `<p class="muted small">Событий нет.</p>`}
      <div class="row wrap" style="margin-top:12px">
        <button class="btn btn-sm" data-act="addVaccine" data-date="${ui.calSel}">${I.plus} Прививка</button>
        ${L.tracksHeat(pet) ? `<button class="btn btn-sm" data-act="addHeat" data-date="${ui.calSel}">${I.plus} Течка</button>` : ''}
        <button class="btn btn-sm" data-act="addWeight" data-date="${ui.calSel}">${I.plus} Вес</button>
      </div>
    </section>
  </div>`;
}

// ---------- здоровье ----------
const HEALTH_TABS = [['meds', '💊 Лекарства'], ['feeds', '🥣 Корма'], ['tests', '🧪 Анализы'], ['allergies', '⚠️ Аллергии'], ['weight', '⚖️ Вес']];

function vHealth(pet, args) {
  const tab = HEALTH_TABS.some(t => t[0] === args[0]) ? args[0] : 'meds';
  const body = { meds: hMeds, feeds: hFeeds, tests: hTests, allergies: hAllergies, weight: hWeight }[tab](pet);
  return `<div class="view-head"><h1>Здоровье</h1></div>
  <div class="stack-lg">
    <div class="seg sticky">${HEALTH_TABS.map(([k, l]) => `<button class="${tab === k ? 'on' : ''}" data-act="go" data-route="health/${k}">${l}</button>`).join('')}</div>
    ${body}
  </div>`;
}

const conflictNote = (pet, text) => {
  const c = L.allergyConflicts(pet.id, text);
  return c.length ? `<span class="pill bad">⚠️ ${c.map(a => esc(a.allergen)).join(', ')}</span>` : '';
};

function hMeds(pet) {
  const meds = list('meds', pet.id).sort((a, b) => ((a.start || '') < (b.start || '') ? 1 : -1));
  const active = meds.filter(L.medActive), past = meds.filter(m => !L.medActive(m));
  const row = m => `<button class="item" data-act="editMed" data-id="${m.id}"><span class="bubble c-med">💊</span><span class="item-main"><span class="item-title">${esc(m.name)}</span><span class="item-sub" style="display:block">${[m.dose, m.schedule, m.reason].filter(Boolean).map(esc).join(' · ') || '—'}</span><span class="item-sub">${m.start ? L.fmtDate(m.start) : ''}${m.end ? ' – ' + L.fmtDate(m.end) : m.start ? ' — постоянно' : ''}</span></span><span class="item-meta stack" style="gap:4px;align-items:flex-end">${L.medActive(m) && m.end ? pill('info', 'ещё ' + L.nDays(L.diffDays(L.today(), m.end))) : ''}${conflictNote(pet, L.medText(m))}</span></button>`;
  return `<section class="card"><div class="card-head"><h2>Принимает сейчас</h2><button class="icon-btn" data-act="scanKind" data-kind="meds" aria-label="Сфотографировать упаковку">${I.camera}</button><button class="add-btn" data-act="addMed" aria-label="Добавить">${I.plus}</button></div>
    ${active.length ? `<div class="list">${active.map(row).join('')}</div>` : emptyBox('💊', 'Нет активных курсов', 'Сфотографируйте упаковку или назначение врача — название и дозировка подставятся сами.')}
  </section>
  ${past.length ? `<section class="card"><div class="card-head"><h2>Ранее</h2></div><div class="list">${past.map(row).join('')}</div></section>` : ''}`;
}

function medForm(rec = {}, pet = L.currentPet()) {
  const isNew = !rec.id;
  openForm({
    title: isNew ? 'Лекарство' : rec.name,
    values: { start: L.today(), ...rec },
    fields: [
      { name: 'name', label: 'Название', required: true, placeholder: 'Например, Апоквел 16 мг' },
      { name: 'warn', type: 'slot' },
      { name: 'dose', label: 'Дозировка', half: true, placeholder: '½ таблетки' },
      { name: 'schedule', label: 'Схема приёма', half: true, placeholder: '2 раза в день' },
      { name: 'start', label: 'Начало', type: 'date', half: true },
      { name: 'end', label: 'Окончание', type: 'date', half: true },
      { name: 'reason', label: 'От чего / назначение', placeholder: 'Зуд, после операции…' },
      { name: 'notes', label: 'Заметки, реакция', type: 'textarea', rows: 2 },
    ],
    onChange(v, f) {
      const c = L.allergyConflicts(pet.id, v.name + ' ' + v.notes);
      f.querySelector('[data-slot=warn]').innerHTML = c.length ? `<div class="warnbox">⚠️ Внимание: у питомца отмечена аллергия — ${c.map(a => esc(a.allergen)).join(', ')}</div>` : '';
    },
    onSave(v) { upsert('meds', { ...rec, ...v, petId: rec.petId || pet.id }); toast('Сохранено'); render(); },
    onDelete: isNew ? null : () => { remove('meds', rec.id); render(); },
  });
}

function hFeeds(pet) {
  const feeds = list('feeds', pet.id).sort((a, b) => ((a.since || '') < (b.since || '') ? 1 : -1));
  const cur = feeds.filter(f => !f.until || f.until >= L.today()), past = feeds.filter(f => f.until && f.until < L.today());
  const verdict = { ok: pill('ok', '👍 подходит'), bad: pill('bad', '👎 не подошёл'), '': '' };
  const row = f => `<button class="item" data-act="editFeed" data-id="${f.id}"><span class="bubble c-feed">🥣</span><span class="item-main"><span class="item-title">${esc(f.name)}</span><span class="item-sub" style="display:block">${[f.type, f.brand, f.portion].filter(Boolean).map(esc).join(' · ')}</span>${f.ingredients ? `<span class="item-sub ellipsis" style="display:block">Состав: ${esc(f.ingredients)}</span>` : ''}</span><span class="item-meta stack" style="gap:4px;align-items:flex-end">${verdict[f.verdict || '']}${conflictNote(pet, L.feedText(f))}</span></button>`;
  return `<section class="card"><div class="card-head"><h2>Сейчас ест</h2><button class="icon-btn" data-act="scanKind" data-kind="feeds" aria-label="Сфотографировать этикетку">${I.camera}</button><button class="add-btn" data-act="addFeed" aria-label="Добавить">${I.plus}</button></div>
    ${cur.length ? `<div class="list">${cur.map(row).join('')}</div>` : emptyBox('🥣', 'Корм не указан', 'Сфотографируйте этикетку — приложение распознает марку и состав и проверит его на аллергены.')}
  </section>
  ${past.length ? `<section class="card"><div class="card-head"><h2>Пробовали раньше</h2></div><div class="list">${past.map(row).join('')}</div></section>` : ''}`;
}

function feedForm(rec = {}, pet = L.currentPet()) {
  const isNew = !rec.id;
  openForm({
    title: isNew ? 'Корм' : rec.name,
    values: { type: 'Сухой', since: L.today(), verdict: '', ...rec },
    fields: [
      { name: 'name', label: 'Название', required: true, placeholder: 'Royal Canin Hypoallergenic' },
      { name: 'warn', type: 'slot' },
      { name: 'brand', label: 'Марка', half: true, list: 'dl-brands' },
      { name: 'type', label: 'Тип', type: 'select', half: true, options: D.FEED_TYPES },
      { name: 'portion', label: 'Порция', half: true, placeholder: '180 г в день' },
      { name: 'verdict', label: 'Как подходит', type: 'select', half: true, options: [['', 'Пока не ясно'], ['ok', '👍 Подходит'], ['bad', '👎 Не подошёл']] },
      { name: 'since', label: 'С какого числа', type: 'date', half: true },
      { name: 'until', label: 'По какое', type: 'date', half: true },
      { name: 'ingredients', label: 'Состав', type: 'textarea', rows: 3, placeholder: 'Можно вставить с упаковки — проверю на аллергены' },
      { name: 'notes', label: 'Заметки, реакция', type: 'textarea', rows: 2 },
    ],
    onChange(v, f) {
      const c = L.allergyConflicts(pet.id, L.feedText(v));
      f.querySelector('[data-slot=warn]').innerHTML = c.length ? `<div class="warnbox">⚠️ Содержит возможный аллерген: ${c.map(a => esc(a.allergen)).join(', ')}</div>` : '';
    },
    onSave(v) { upsert('feeds', { ...rec, ...v, petId: rec.petId || pet.id }); toast('Сохранено'); render(); },
    onDelete: isNew ? null : () => { remove('feeds', rec.id); render(); },
  });
}

function hTests(pet) {
  const tests = list('tests', pet.id).sort((a, b) => (a.date < b.date ? 1 : -1));
  return `<section class="card"><div class="card-head"><h2>Результаты анализов</h2><button class="icon-btn" data-act="scanKind" data-kind="tests" aria-label="Сфотографировать бланк">${I.camera}</button><button class="add-btn" data-act="addTest" aria-label="Добавить">${I.plus}</button></div>
  ${tests.length ? `<div class="list">${tests.map(t => {
    const s = L.testSummary(t, pet.species);
    return `<button class="item" data-act="openTest" data-id="${t.id}"><span class="bubble c-test">🧪</span><span class="item-main"><span class="item-title">${esc(t.type)}</span><span class="item-sub" style="display:block">${L.fmtDate(t.date, true)}${t.lab ? ' · ' + esc(t.lab) : ''}${s.total ? ` · ${s.total} ${L.plural(s.total, ['показатель', 'показателя', 'показателей'])}` : ''}</span>${s.bad.length ? `<span class="item-sub ellipsis" style="display:block">${s.bad.map(x => `${esc(x.i.name)} ${x.r.s === 'high' ? '↑' : '↓'}`).join(', ')}</span>` : ''}</span><span class="item-meta">${s.total ? (s.bad.length ? pill('bad', `${s.bad.length} вне нормы`) : pill('ok', 'в норме')) : ''}</span></button>`;
  }).join('')}</div>` : emptyBox('🧪', 'Анализов пока нет', 'Сфотографируйте бланк из лаборатории — показатели распознаются и сравнятся с нормами для ' + (pet.species === 'cat' ? 'кошек' : 'собак') + '.', `<button class="btn btn-primary btn-sm" data-act="scanKind" data-kind="tests">${I.camera} Бланк анализа</button>`)}
  </section>`;
}

function testForm(rec = {}, pet = L.currentPet()) {
  const isNew = !rec.id;
  openForm({
    title: isNew ? 'Анализ' : rec.type,
    wide: true,
    values: { date: L.today(), type: 'Общий анализ крови', items: [{}], ...rec },
    fields: [
      { name: 'type', label: 'Вид анализа', type: 'select', half: true, options: D.TEST_TYPES },
      { name: 'date', label: 'Дата', type: 'date', half: true, required: true },
      { name: 'lab', label: 'Лаборатория / клиника' },
      { name: 'items', label: 'Показатели', type: 'labitems' },
      { name: 'h', type: 'hint', text: 'Норму можно не заполнять — для известных показателей подставятся типичные референсы для вида питомца.' },
      { name: 'conclusion', label: 'Заключение врача', type: 'textarea', rows: 3 },
    ],
    onSave(v) { delete v.h; const r = upsert('tests', { ...rec, ...v, petId: rec.petId || pet.id }); toast('Сохранено'); afterSheets(() => go('test/' + r.id)); },
    onDelete: isNew ? null : () => { remove('tests', rec.id); afterSheets(() => go('health/tests')); },
  });
}

function vTest(pet, args) {
  const t = state.records.tests.find(x => x.id === args[0]);
  if (!t) return emptyBox('🧪', 'Анализ не найден', '', `<button class="btn btn-sm" data-act="go" data-route="health/tests">К анализам</button>`);
  const p = state.pets.find(x => x.id === t.petId) || pet;
  const s = L.testSummary(t, p.species);
  const doc = t.docId && state.records.docs.find(d => d.id === t.docId);
  const rows = s.res.map(({ i, r }) => {
    let bar = '';
    if (r.v != null && r.min != null && r.max != null && !isNaN(r.min) && !isNaN(r.max) && r.max > r.min) {
      const span = r.max - r.min;
      const lo = r.min - span * 0.5, hi = r.max + span * 0.5;
      const pos = v => Math.max(0, Math.min(100, ((v - lo) / (hi - lo)) * 100));
      bar = `<div><div class="range"><div class="track"></div><div class="norm" style="left:${pos(r.min)}%;right:${100 - pos(r.max)}%"></div><div class="mark ${r.s}" style="left:${pos(r.v)}%"></div></div><div class="range-lbl"><span></span><span>${r.min} – ${r.max}</span><span></span></div></div>`;
    } else bar = `<div class="tiny muted">${r.min != null && !isNaN(r.min) ? 'норма ' + r.min + ' – ' + r.max : 'нет нормы'}</div>`;
    return `<div class="lab-row"><div><b>${esc(i.name)}</b>${r.hint ? `<div class="tiny" style="color:var(--bad)">${r.s === 'high' ? '↑ выше нормы' : '↓ ниже нормы'}: ${esc(r.hint)}</div>` : r.s === 'high' || r.s === 'low' ? `<div class="tiny" style="color:var(--bad)">${r.s === 'high' ? '↑ выше нормы' : '↓ ниже нормы'}</div>` : ''}</div><div class="lab-val ${r.s}">${esc(i.value)}<small>${esc(i.unit || r.p?.unit || '')}</small></div>${bar}</div>`;
  }).join('');
  const isAllergyPanel = t.type === 'Аллергопанель';
  return `<div class="view-head"><button class="icon-btn" data-act="go" data-route="health/tests" aria-label="Назад">${I.chevL}</button><h1 class="ellipsis">${esc(t.type)}</h1><button class="icon-btn" data-act="editTest" data-id="${t.id}" aria-label="Редактировать">${I.edit}</button></div>
  <div class="grid-2">
    <section class="card stack">
      <div class="row wrap" style="gap:6px">${pill('', L.fmtDate(t.date, true))}${t.lab ? pill('', t.lab) : ''}${state.pets.length > 1 ? pill('', p.name) : ''}</div>
      ${s.total ? (s.bad.length ? `<div class="alert"><span class="alert-icon">🔎</span><span><b>Вне нормы: ${s.bad.length} из ${s.total}</b><br><span class="small">${s.bad.map(x => `${esc(x.i.name)} ${x.r.s === 'high' ? '↑' : '↓'}${x.r.hint ? ' — ' + esc(x.r.hint) : ''}`).join('<br>')}</span></span></div>` :
        `<div class="alert info" style="background:color-mix(in srgb,var(--ok) 10%,var(--surface));border-color:color-mix(in srgb,var(--ok) 25%,transparent)"><span class="alert-icon">✅</span><span><b>Все ${s.total} ${L.plural(s.total, ['показатель', 'показателя', 'показателей'])} в норме</b></span></div>`) : ''}
      ${t.conclusion ? `<div><div class="small muted" style="font-weight:700">Заключение</div><p style="margin:4px 0 0">${esc(t.conclusion)}</p></div>` : ''}
      ${isAllergyPanel && s.bad.some(x => x.r.s === 'high') ? `<button class="btn btn-sm" data-act="testToAllergies" data-id="${t.id}">⚠️ Добавить положительные в аллергии</button>` : ''}
      <p class="tiny muted" style="margin:0">Расшифровка ориентировочная и не является диагнозом. Нормы зависят от лаборатории, возраста и породы — обсудите результат с ветеринаром.</p>
      ${doc ? `<button class="doc" data-act="openDoc" data-id="${doc.id}" style="box-shadow:none;border:1px solid var(--line);max-width:240px"><div class="doc-img"><img data-file="${esc(doc.thumbId || doc.fileId)}" alt=""></div><div class="doc-cap"><b>📎 Фото бланка</b></div></button>` : ''}
    </section>
    <section class="card">${rows || emptyBox('📋', 'Нет показателей', 'Добавьте значения вручную.', `<button class="btn btn-sm" data-act="editTest" data-id="${t.id}">${I.edit} Заполнить</button>`)}</section>
  </div>`;
}

function hAllergies(pet) {
  const al = list('allergies', pet.id);
  const sev = { mild: 'warn', medium: 'warn', severe: 'bad' };
  const conflicts = [];
  list('feeds', pet.id).forEach(f => { const c = L.allergyConflicts(pet.id, L.feedText(f)); if (c.length) conflicts.push({ e: '🥣', n: f.name, c, cur: !f.until || f.until >= L.today() }); });
  list('meds', pet.id).forEach(m => { const c = L.allergyConflicts(pet.id, L.medText(m)); if (c.length) conflicts.push({ e: '💊', n: m.name, c, cur: L.medActive(m) }); });
  return `<section class="card"><div class="card-head"><h2>Аллергии</h2><button class="icon-btn" data-act="scanKind" data-kind="allergies" aria-label="Сфотографировать аллергопанель">${I.camera}</button><button class="add-btn" data-act="addAllergy" aria-label="Добавить">${I.plus}</button></div>
  ${al.length ? `<div class="list">${al.map(a => `<button class="item" data-act="editAllergy" data-id="${a.id}"><span class="bubble c-allergy">⚠️</span><span class="item-main"><span class="item-title">${esc(a.allergen)}</span><span class="item-sub" style="display:block">${[a.category, a.reaction].filter(Boolean).map(esc).join(' · ')}</span></span><span class="item-meta stack" style="gap:4px;align-items:flex-end">${pill(sev[a.severity] || '', D.SEVERITY[a.severity] || '')}${a.confirmed ? pill('info', 'подтверждена') : ''}</span></button>`).join('')}</div>` :
    emptyBox('🌿', 'Аллергии не отмечены', 'Если они есть — добавьте: приложение будет проверять корма и лекарства на совпадения.')}
  </section>
  ${al.length ? `<section class="card"><div class="card-head"><h2>Проверка кормов и лекарств</h2></div>
    ${conflicts.length ? `<div class="list">${conflicts.map(x => `<div class="item"><span class="bubble c-allergy">${x.e}</span><span class="item-main"><span class="item-title">${esc(x.n)}</span><span class="item-sub">совпадение: ${x.c.map(a => esc(a.allergen)).join(', ')}</span></span>${x.cur ? pill('bad', 'используется') : pill('', 'раньше')}</div>`).join('')}</div>` :
      `<p class="muted small" style="margin:0">✅ В отмеченных кормах и лекарствах аллергенов не найдено. Добавляйте состав кормов — проверка станет точнее.</p>`}
  </section>` : ''}`;
}

function allergyForm(rec = {}, pet = L.currentPet()) {
  const isNew = !rec.id;
  openForm({
    title: isNew ? 'Аллергия' : rec.allergen,
    values: { category: 'Пищевая', severity: 'medium', ...rec },
    fields: [
      { name: 'allergen', label: 'Аллерген', required: true, list: 'dl-allergens', placeholder: 'Курица, пыльца, антибиотик…' },
      { name: 'category', label: 'Тип', type: 'select', half: true, options: D.ALLERGY_CATS },
      { name: 'severity', label: 'Тяжесть', type: 'select', half: true, options: Object.entries(D.SEVERITY) },
      { name: 'reaction', label: 'Как проявляется', placeholder: 'Зуд, покраснение ушей, расстройство ЖКТ' },
      { name: 'date', label: 'Когда выявлена', type: 'date', half: true },
      { name: 'confirmed', label: 'Подтверждена анализом', type: 'check' },
      { name: 'notes', label: 'Заметки', type: 'textarea', rows: 2 },
    ],
    onSave(v) { upsert('allergies', { ...rec, ...v, petId: rec.petId || pet.id }); toast('Сохранено'); render(); },
    onDelete: isNew ? null : () => { remove('allergies', rec.id); render(); },
  });
}

function weightChart(ws) {
  // Ширина под реальный контейнер, чтобы подписи не мельчили на телефоне
  const W = Math.round(Math.max(300, Math.min(900, ($('#view')?.clientWidth || 640) - 72)));
  const H = Math.round(Math.max(190, Math.min(260, W * 0.42))), pl = 40, pr = 14, pt = 14, pb = 28;
  const xs = ws.map(w => L.parseISO(w.date).getTime());
  let x0 = Math.min(...xs), x1 = Math.max(...xs);
  if (x1 === x0) { x0 -= 864e5 * 15; x1 += 864e5 * 15; }
  const ys = ws.map(w => +w.kg);
  let y0 = Math.min(...ys), y1 = Math.max(...ys);
  const padY = Math.max((y1 - y0) * 0.2, 0.3);
  y0 = Math.max(0, y0 - padY); y1 += padY;
  const X = t => pl + ((t - x0) / (x1 - x0)) * (W - pl - pr);
  const Y = v => pt + (1 - (v - y0) / (y1 - y0)) * (H - pt - pb);
  const pts = ws.map((w, i) => ({ x: X(xs[i]), y: Y(ys[i]), w }));
  const line = pts.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join('');
  const area = `${line}L${pts[pts.length - 1].x.toFixed(1)},${H - pb}L${pts[0].x.toFixed(1)},${H - pb}Z`;
  const ticks = [0, 0.5, 1].map(k => y0 + (y1 - y0) * k);
  const xl = [pts[0], pts.length > 2 ? pts[Math.floor(pts.length / 2)] : null, pts[pts.length - 1]].filter(Boolean);
  const id = 'c' + uid();
  ui.charts.set(id, { pts, W });
  return `<div class="chart" data-chart="${id}">
    <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="График веса">
      <g class="grid">${ticks.map(v => `<line x1="${pl}" x2="${W - pr}" y1="${Y(v)}" y2="${Y(v)}"/>`).join('')}</g>
      <g class="axis">${ticks.map(v => `<text x="${pl - 8}" y="${Y(v) + 4}" text-anchor="end">${v.toFixed(1).replace('.', ',')}</text>`).join('')}
      ${xl.map((p, i) => `<text x="${p.x}" y="${H - 8}" text-anchor="${i === 0 ? 'start' : i === xl.length - 1 ? 'end' : 'middle'}">${L.fmtDate(p.w.date)}</text>`).join('')}</g>
      <path class="area" d="${area}"/><path class="line" d="${line}"/>
      <line class="cross" x1="0" x2="0" y1="${pt}" y2="${H - pb}" visibility="hidden"/>
      ${pts.map(p => `<circle class="pt" cx="${p.x}" cy="${p.y}" r="5"/>`).join('')}
    </svg><div class="chart-tip" hidden></div></div>`;
}

function bindCharts() {
  $$('[data-chart]').forEach(el => {
    const c = ui.charts.get(el.dataset.chart);
    if (!c) return;
    const { pts, W } = c;
    const svgEl = el.querySelector('svg'), tip = el.querySelector('.chart-tip'), cross = el.querySelector('.cross');
    const move = e => {
      const r = svgEl.getBoundingClientRect();
      const k = W / r.width;
      const x = (e.clientX - r.left) * k;
      const p = pts.reduce((a, b) => (Math.abs(b.x - x) < Math.abs(a.x - x) ? b : a));
      cross.setAttribute('x1', p.x); cross.setAttribute('x2', p.x); cross.setAttribute('visibility', 'visible');
      tip.hidden = false;
      tip.style.left = p.x / k + 'px'; tip.style.top = p.y / k + 'px';
      tip.textContent = `${String(p.w.kg).replace('.', ',')} кг · ${L.fmtDate(p.w.date, true)}`;
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerdown', move);
    el.addEventListener('pointerleave', () => { tip.hidden = true; cross.setAttribute('visibility', 'hidden'); });
  });
}

function hWeight(pet) {
  const ws = list('weights', pet.id).sort((a, b) => (a.date < b.date ? -1 : 1));
  const last = ws[ws.length - 1], prev = ws[ws.length - 2];
  const delta = last && prev ? +(last.kg - prev.kg).toFixed(2) : null;
  const first = ws[0];
  return `<section class="card">
    <div class="card-head"><h2>Вес, кг</h2><button class="add-btn" data-act="addWeight" aria-label="Добавить">${I.plus}</button></div>
    ${last ? `<div class="row" style="gap:18px;margin-bottom:10px;flex-wrap:wrap"><div><b style="font-family:var(--font-display);font-size:30px">${String(last.kg).replace('.', ',')}</b> <span class="muted">кг · ${L.fmtDate(last.date, true)}</span></div>
      ${delta != null ? pill(delta === 0 ? '' : 'info', `${delta > 0 ? '+' : ''}${String(delta).replace('.', ',')} кг с прошлого раза`) : ''}
      ${first && first !== last ? `<span class="small muted">с ${L.fmtDate(first.date, true)}: ${(last.kg - first.kg > 0 ? '+' : '') + (last.kg - first.kg).toFixed(1).replace('.', ',')} кг</span>` : ''}</div>` : ''}
    ${ws.length >= 2 ? weightChart(ws) : ws.length ? '<p class="small muted">Добавьте ещё одно взвешивание, чтобы увидеть график.</p>' : emptyBox('⚖️', 'Вес не указан', 'Взвешивайте питомца раз в месяц — так проще заметить изменения.')}
  </section>
  ${ws.length ? `<section class="card"><div class="card-head"><h2>Все взвешивания</h2></div><div class="list">${ws.slice().reverse().map((w, i, arr) => {
    const p = arr[i + 1];
    const d = p ? +(w.kg - p.kg).toFixed(2) : null;
    return `<button class="item" data-act="editWeight" data-id="${w.id}"><span class="bubble c-weight">⚖️</span><span class="item-main"><span class="item-title">${String(w.kg).replace('.', ',')} кг</span><span class="item-sub">${esc(w.notes || '')}</span></span><span class="item-meta">${L.fmtDate(w.date, true)}${d ? `<br>${d > 0 ? '+' : ''}${String(d).replace('.', ',')}` : ''}</span></button>`;
  }).join('')}</div></section>` : ''}`;
}

function weightForm(rec = {}, pet = L.currentPet()) {
  const isNew = !rec.id;
  openForm({
    title: 'Взвешивание',
    values: { date: L.today(), ...rec },
    fields: [
      { name: 'kg', label: 'Вес, кг', type: 'number', half: true, required: true, placeholder: '12,4' },
      { name: 'date', label: 'Дата', type: 'date', half: true, required: true },
      { name: 'notes', label: 'Заметка', placeholder: 'После стрижки, на диете…' },
    ],
    onSave(v) { if (!(v.kg > 0)) { toast('Укажите вес'); return false; } upsert('weights', { ...rec, ...v, petId: rec.petId || pet.id }); toast('Сохранено'); render(); },
    onDelete: isNew ? null : () => { remove('weights', rec.id); render(); },
  });
}

// ---------- документы ----------
const DOC_KIND = { vaccines: '💉 Ветпаспорт', tests: '🧪 Анализы', meds: '💊 Лекарство', feeds: '🥣 Корм', allergies: '⚠️ Аллергия', other: '📄 Документ' };
function vDocs(pet) {
  const docs = list('docs', pet.id).sort((a, b) => ((a.date || a.createdAt) < (b.date || b.createdAt) ? 1 : -1));
  return `<div class="view-head"><h1>Документы</h1><button class="add-btn" data-act="scan" aria-label="Добавить">${I.camera}</button></div>
  ${docs.length ? `<div class="doc-grid">${docs.map(d => `<button class="doc" data-act="openDoc" data-id="${d.id}"><div class="doc-img">${d.thumbId || d.fileId ? `<img data-file="${esc(d.thumbId || d.fileId)}" alt="">` : '📄'}</div><div class="doc-cap"><b class="ellipsis">${esc(d.title || 'Документ')}</b><span class="tiny muted">${DOC_KIND[d.kind] || ''} · ${L.fmtDate(d.date || d.createdAt?.slice(0, 10), true)}</span></div></button>`).join('')}</div>` :
    `<section class="card">${emptyBox('📄', 'Здесь будут фото документов', 'Все сфотографированные ветпаспорта, бланки и чеки хранятся здесь — всегда можно показать врачу.', `<button class="btn btn-primary btn-sm" data-act="scan">${I.camera} Сфотографировать</button>`)}</section>`}`;
}

function openDoc(id) {
  const d = state.records.docs.find(x => x.id === id);
  if (!d) return;
  const linked = ['vaccines', 'tests', 'meds', 'feeds', 'allergies'].flatMap(c => state.records[c].filter(r => r.docId === d.id).map(r => ({ c, r })));
  const sh = openSheet({
    title: d.title || 'Документ', wide: true,
    body: `<div class="stack">
      <div class="viewer-img"><img data-file="${esc(d.fileId)}" alt="${esc(d.title)}"></div>
      <div class="row wrap" style="gap:6px">${pill('', DOC_KIND[d.kind] || 'Документ')}${pill('', L.fmtDate(d.date || d.createdAt?.slice(0, 10), true))}${d.source === 'ai' ? pill('info', '✨ распознано Claude') : ''}</div>
      ${d.summary ? `<div class="hint">${esc(d.summary)}</div>` : ''}
      ${linked.length ? `<div><div class="small muted" style="font-weight:700;margin-bottom:4px">Создано из документа</div>${linked.map(({ c, r }) => `<div class="small">• ${esc(r.name || r.type || r.allergen)} ${r.date ? '— ' + L.fmtDate(r.date, true) : ''}</div>`).join('')}</div>` : ''}
      <label class="field"><span>Название</span><input class="input" data-doc-title value="${esc(d.title)}"></label>
      ${d.text ? `<details><summary class="small muted" style="cursor:pointer;font-weight:700">Распознанный текст</summary><pre class="ocr" style="margin-top:8px">${esc(d.text)}</pre></details>` : ''}
    </div>`,
    foot: `<button class="btn btn-danger" data-x="del" style="flex:0 0 auto" aria-label="Удалить">${I.trash}</button><button class="btn" data-x="dl" type="button">${I.download} Скачать</button><button class="btn btn-primary" data-x="ok">Готово</button>`,
  });
  hydrate(sh.el);
  sh.foot.querySelector('[data-x=dl]').onclick = async () => {
    try {
      const b = await (await fetch(await fileUrl(d.fileId))).blob();
      await download((d.title || 'документ') + '.jpg', b, 'image/jpeg');
    } catch (e) { toast('Не удалось сохранить фото'); }
  };
  sh.foot.querySelector('[data-x=ok]').onclick = () => {
    const t = sh.body.querySelector('[data-doc-title]').value.trim();
    if (t !== d.title) { d.title = t; save(); render(); }
    sh.close();
  };
  sh.foot.querySelector('[data-x=del]').onclick = async () => {
    if (!(await confirmBox('Удалить фото документа? Созданные из него записи останутся.'))) return;
    linked.forEach(({ r }) => delete r.docId);
    remove('docs', d.id);
    sh.close(); render();
  };
}

// ---------- сканирование ----------
const SCAN_KINDS = [['auto', '✨', 'Определить сам'], ['vaccines', '💉', 'Ветпаспорт'], ['tests', '🧪', 'Анализы'], ['allergies', '⚠️', 'Аллергопанель'], ['meds', '💊', 'Лекарство'], ['feeds', '🥣', 'Корм']];

function openScan(preset = 'auto') {
  let kind = preset;
  const ai = sampleReady() || (!!state.settings.apiKey && !env.artifact);
  const sh = openSheet({
    title: 'Сфотографировать документ',
    body: `<div class="stack">
      <p class="muted small" style="margin:0">Что на фото?</p>
      <div class="scan-kinds">${SCAN_KINDS.map(([k, e, l]) => `<button class="scan-kind ${k === kind ? 'on' : ''}" data-k="${k}" type="button"><span class="e">${e}</span>${l}</button>`).join('')}</div>
      <div class="hint">${ai ? '✨ <b>Умный режим включён</b> — Claude прочитает даже рукописный ветпаспорт и печати.' : env.artifact ? '📴 Распознавание работает прямо на устройстве — лучше всего с печатным текстом.' : '📴 Распознавание работает прямо на устройстве — лучше всего с печатным текстом. Для рукописных ветпаспортов включите <button class="link-btn" data-act="go" data-route="prefs" type="button">умный режим</button>.'}</div>
      <p class="tiny muted" style="margin:0">Совет: положите документ на ровную поверхность при хорошем свете, чтобы текст заполнил кадр.</p>
    </div>`,
    foot: `<button class="btn" data-x="gal" type="button">${I.image} Из галереи</button><button class="btn btn-primary" data-x="cam" type="button">${I.camera} Камера</button>`,
  });
  sh.body.addEventListener('click', e => {
    const b = e.target.closest('.scan-kind');
    if (!b) return;
    kind = b.dataset.k;
    $$('.scan-kind', sh.body).forEach(x => x.classList.toggle('on', x === b));
  });
  const start = async sel => {
    const file = await pickFile(sel);
    if (file) runScan(sh, file, kind);
  };
  sh.foot.querySelector('[data-x=cam]').onclick = () => start('#file-camera');
  sh.foot.querySelector('[data-x=gal]').onclick = () => start('#file-gallery');
}

async function runScan(sh, file, kind) {
  const pet = L.currentPet();
  sh.setTitle('Распознаю…');
  sh.setFoot('');
  let prepared;
  try { prepared = await prepareImage(file); } catch (e) { toast(e.message); sh.close(); return; }
  const previewUrl = URL.createObjectURL(prepared.thumb);
  sh.setBody(`<div class="scan-progress"><div class="scan-preview"><img src="${previewUrl}" alt=""></div><b data-msg>Подготовка…</b><div class="bar" style="max-width:320px"><i data-bar style="width:5%"></i></div><p class="tiny muted center" style="margin:0">Фото не покидает устройство${state.settings.apiKey ? ', кроме отправки в Claude для распознавания' : ''}.</p></div>`);
  const onProgress = (msg, p) => {
    const m = sh.body.querySelector('[data-msg]'), b = sh.body.querySelector('[data-bar]');
    if (m) m.textContent = msg;
    if (b && p != null) b.style.width = Math.round(p * 100) + '%';
  };
  let result;
  try {
    result = await processPhoto(prepared, kind, pet, state.settings, onProgress);
  } catch (e) {
    console.error(e);
    result = { docType: kind === 'auto' ? 'other' : kind, title: 'Документ', date: L.today(), vaccines: [], tests: [], meds: [], feeds: [], allergies: [], text: '', warning: 'Не удалось распознать: ' + e.message };
  }
  if (sh.closed) return;
  showReview(sh, result, prepared, previewUrl, pet);
}

function showReview(sh, r, prepared, previewUrl, pet) {
  sh.setTitle('Проверьте данные');
  const f = (path, label, val, type = 'text', half = true, extra = '') => `<label class="field ${half ? '' : 'full'}"><span>${label}</span><input data-p="${path}" type="${type}" value="${esc(val ?? '')}" ${extra}></label>`;
  const sel = (path, label, val, opts, half = true) => `<label class="field ${half ? '' : 'full'}"><span>${label}</span><select data-p="${path}">${opts.map(o => (Array.isArray(o) ? o : [o, o])).map(([k, l]) => `<option value="${esc(k)}" ${k === val ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label>`;
  const cb = path => `<input type="checkbox" data-on="${path}" checked aria-label="Сохранить">`;
  const block = (title, key, inner, addLabel) => `<div class="review-block"><div class="row between"><h3>${title}</h3>${addLabel ? `<button class="btn btn-sm" data-add="${key}" type="button">${I.plus} ${addLabel}</button>` : ''}</div>${inner}</div>`;

  const draw = () => {
    const found = r.vaccines.length + r.tests.length + r.meds.length + r.feeds.length + r.allergies.length;
    const html = `<div class="stack">
      ${r.warning ? `<div class="warnbox">${esc(r.warning)}</div>` : ''}
      <div class="row" style="align-items:flex-start;gap:12px">
        <img src="${previewUrl}" alt="" style="width:76px;height:76px;object-fit:cover;border-radius:14px;flex:none">
        <div class="grow stack" style="gap:6px">
          <div class="row wrap" style="gap:6px">${r.source === 'ai' ? pill('info', '✨ Claude') : pill('', '📴 офлайн-распознавание')}${found ? pill('ok', `найдено: ${found}`) : pill('warn', 'данные не найдены')}</div>
          ${r.summary ? `<div class="small">${esc(r.summary)}</div>` : ''}
          ${!found ? `<div class="small muted">Не получилось извлечь данные автоматически. Фото сохранится в документах — данные можно добавить вручную кнопками ниже.</div>` : ''}
        </div>
      </div>
      ${r.vaccines.length ? block('💉 Прививки и обработки', 'vaccines', r.vaccines.map((v, i) => `<div class="review-item">${cb('vaccines.' + i)}<div class="fgrid">
        ${f(`vaccines.${i}.name`, 'Препарат', v.name, 'text', false, 'list="dl-vac"')}
        ${f(`vaccines.${i}.date`, 'Сделано', v.date, 'date')}
        ${f(`vaccines.${i}.next`, 'Следующая', v.next || L.suggestNext(v.kind || 'vaccine', v.date), 'date')}
        ${sel(`vaccines.${i}.kind`, 'Тип', v.kind || 'vaccine', Object.entries(D.REC_KINDS).map(([k, x]) => [k, x.label]), false)}
      </div></div>`).join(''), 'ещё') : ''}
      ${r.tests.map((t, ti) => block('🧪 ' + esc(t.type || 'Анализ'), 'tests', `<div class="review-item">${cb('tests.' + ti)}<div class="stack" style="gap:8px"><div class="fgrid">
        ${sel(`tests.${ti}.type`, 'Вид', t.type || 'Другое', D.TEST_TYPES)}
        ${f(`tests.${ti}.date`, 'Дата', t.date || r.date || L.today(), 'date')}
        ${f(`tests.${ti}.lab`, 'Лаборатория', t.lab, 'text', false)}</div>
        <div class="li-table" data-li-test="${ti}"><div class="li-row li-head"><div>Показатель</div><div>Значение</div><div>Норма</div><div></div></div>${(t.items || []).map(liRow).join('')}</div>
        <button type="button" class="btn btn-sm" data-li-add-test="${ti}" style="align-self:flex-start">${I.plus} Показатель</button>
        ${(t.items || []).map((it, ii) => it.suggest ? `<div class="warnbox stack" style="gap:8px"><span>Проверьте: ${esc(it.name)} — «${esc(it.value)}». Возможно, ${esc(it.suggest.replace('.', ','))}: запятая могла не распознаться.</span><div class="row wrap"><button class="btn btn-sm" type="button" data-fix="${ti}.${ii}">Исправить на ${esc(it.suggest.replace('.', ','))}</button><button class="btn btn-sm btn-ghost" type="button" data-keepval="${ti}.${ii}">Верно, оставить</button></div></div>` : '').join('')}
        ${t.conclusion ? f(`tests.${ti}.conclusion`, 'Заключение', t.conclusion, 'text', false) : ''}
        ${testPreview(t, pet)}
      </div></div>`)).join('')}
      ${r.allergies.length ? block('⚠️ Аллергены', 'allergies', r.allergies.map((a, i) => `<div class="review-item">${cb('allergies.' + i)}<div class="fgrid">
        ${f(`allergies.${i}.allergen`, 'Аллерген', a.allergen)}
        ${sel(`allergies.${i}.severity`, 'Тяжесть', a.severity || 'medium', Object.entries(D.SEVERITY))}
        ${f(`allergies.${i}.reaction`, 'Реакция', a.reaction, 'text', false)}
      </div></div>`).join(''), 'ещё') : ''}
      ${r.meds.length ? block('💊 Лекарства', 'meds', r.meds.map((m, i) => `<div class="review-item">${cb('meds.' + i)}<div class="fgrid">
        ${f(`meds.${i}.name`, 'Название', m.name, 'text', false)}
        ${f(`meds.${i}.dose`, 'Дозировка', m.dose)}${f(`meds.${i}.schedule`, 'Схема', m.schedule)}
        ${f(`meds.${i}.start`, 'Начало', m.start || L.today(), 'date')}${f(`meds.${i}.end`, 'Окончание', m.end, 'date')}
        ${conflictWarn(pet, m.name)}
      </div></div>`).join('')) : ''}
      ${r.feeds.length ? block('🥣 Корм', 'feeds', r.feeds.map((x, i) => `<div class="review-item">${cb('feeds.' + i)}<div class="fgrid">
        ${f(`feeds.${i}.name`, 'Название', x.name, 'text', false)}
        ${f(`feeds.${i}.brand`, 'Марка', x.brand, 'text', true, 'list="dl-brands"')}${sel(`feeds.${i}.type`, 'Тип', D.FEED_TYPES.includes(x.type) ? x.type : 'Сухой', D.FEED_TYPES)}
        <label class="field full"><span>Состав</span><textarea data-p="feeds.${i}.ingredients" rows="3">${esc(x.ingredients)}</textarea></label>
        ${conflictWarn(pet, L.feedText(x))}
      </div></div>`).join('')) : ''}
      <div class="row wrap">
        ${!r.vaccines.length ? `<button class="btn btn-sm" data-add="vaccines" type="button">${I.plus} Прививка</button>` : ''}
        ${!r.tests.length ? `<button class="btn btn-sm" data-add="tests" type="button">${I.plus} Анализ</button>` : ''}
        ${!r.meds.length ? `<button class="btn btn-sm" data-add="meds" type="button">${I.plus} Лекарство</button>` : ''}
        ${!r.feeds.length ? `<button class="btn btn-sm" data-add="feeds" type="button">${I.plus} Корм</button>` : ''}
      </div>
      <div class="fgrid">
        <label class="field full"><span>Название документа</span><input data-p="title" value="${esc(r.title || 'Документ')}"></label>
        <label class="check full"><input type="checkbox" data-keep checked> Сохранить фото в «Документы»</label>
      </div>
      ${r.text ? `<details><summary class="small muted" style="cursor:pointer;font-weight:700">Распознанный текст</summary><pre class="ocr" style="margin-top:8px">${esc(r.text)}</pre></details>` : ''}
    </div>`;
    sh.setBody(html);
  };

  const sync = () => {
    $$('[data-p]', sh.body).forEach(el => {
      const path = el.dataset.p.split('.');
      let o = r;
      for (let i = 0; i < path.length - 1; i++) o = o[path[i]];
      o[path[path.length - 1]] = el.value.trim();
    });
    $$('[data-li-test]', sh.body).forEach(tb => { r.tests[+tb.dataset.liTest].items = readLiRows(tb); });
    r._off = new Set($$('[data-on]', sh.body).filter(c => !c.checked).map(c => c.dataset.on));
    r._keep = sh.body.querySelector('[data-keep]')?.checked ?? true;
  };

  sh.body.onclick = e => {
    const add = e.target.closest('[data-add]');
    if (add) {
      sync();
      const k = add.dataset.add;
      const blank = { vaccines: { kind: 'vaccine', name: '', date: r.date || L.today(), next: '' }, tests: { type: 'Общий анализ крови', date: r.date || L.today(), lab: '', items: [{}], conclusion: '' }, meds: { name: '', dose: '', schedule: '', start: L.today(), end: '' }, feeds: { name: '', brand: '', type: 'Сухой', ingredients: '' }, allergies: { allergen: '', severity: 'medium', reaction: '' } }[k];
      r[k].push(blank);
      draw();
      return;
    }
    const fix = e.target.closest('[data-fix]'), keep = e.target.closest('[data-keepval]');
    if (fix || keep) {
      sync();
      const [ti, ii] = (fix || keep).dataset[fix ? 'fix' : 'keepval'].split('.').map(Number);
      const it = r.tests[ti]?.items[ii];
      if (it) { if (fix) it.value = it.suggest; delete it.suggest; }
      draw();
      return;
    }
    const addLi = e.target.closest('[data-li-add-test]');
    if (addLi) sh.body.querySelector(`[data-li-test="${addLi.dataset.liAddTest}"]`).insertAdjacentHTML('beforeend', liRow());
    const del = e.target.closest('[data-li-del]');
    if (del) del.closest('[data-li]').remove();
  };

  draw();
  sh.setFoot(`<button class="btn" data-x="cancel" type="button">Отмена</button><button class="btn btn-primary" data-x="save" type="button">${I.check} Сохранить</button>`);
  sh.foot.querySelector('[data-x=cancel]').onclick = () => sh.close();
  sh.foot.querySelector('[data-x=save]').onclick = async () => {
    sync();
    const btn = sh.foot.querySelector('[data-x=save]');
    btn.disabled = true;
    const on = (k, i) => !r._off.has(`${k}.${i}`);
    let docId = null;
    if (r._keep) {
      const fileId = await putFile(prepared.blob);
      const thumbId = await putFile(prepared.thumb);
      docId = upsert('docs', { petId: pet.id, title: r.title || 'Документ', kind: r.docType || 'other', date: r.date || L.today(), fileId, thumbId, text: r.text || '', summary: r.summary || '', source: r.source, createdAt: new Date().toISOString() }).id;
    }
    const counts = { vaccines: 0, tests: 0, meds: 0, feeds: 0, allergies: 0 };
    r.vaccines.forEach((v, i) => { if (on('vaccines', i) && v.name) { upsert('vaccines', { petId: pet.id, kind: v.kind || 'vaccine', name: v.name, date: v.date || L.today(), next: v.next || '', clinic: v.clinic || '', batch: v.batch || '', docId }); counts.vaccines++; } });
    let lastTestId = null;
    r.tests.forEach((t, i) => { if (on('tests', i) && (t.items || []).length) { lastTestId = upsert('tests', { petId: pet.id, type: t.type, date: t.date || L.today(), lab: t.lab || '', items: t.items.map(({ suggest, ...x }) => x), conclusion: t.conclusion || '', docId }).id; counts.tests++; } });
    r.meds.forEach((m, i) => { if (on('meds', i) && m.name) { upsert('meds', { petId: pet.id, name: m.name, dose: m.dose, schedule: m.schedule, start: m.start, end: m.end, reason: m.reason || '', docId }); counts.meds++; } });
    r.feeds.forEach((x, i) => { if (on('feeds', i) && x.name) { upsert('feeds', { petId: pet.id, name: x.name, brand: x.brand, type: x.type, ingredients: x.ingredients, since: L.today(), verdict: '', docId }); counts.feeds++; } });
    r.allergies.forEach((a, i) => { if (on('allergies', i) && a.allergen) { upsert('allergies', { petId: pet.id, allergen: a.allergen, category: a.category || 'Пищевая', severity: a.severity || 'medium', reaction: a.reaction || '', confirmed: true, date: r.date || L.today(), docId }); counts.allergies++; } });
    const parts = [];
    if (counts.vaccines) parts.push(`${counts.vaccines} ${L.plural(counts.vaccines, ['прививка', 'прививки', 'прививок'])}`);
    if (counts.tests) parts.push(`${counts.tests} ${L.plural(counts.tests, ['анализ', 'анализа', 'анализов'])}`);
    if (counts.meds) parts.push(`${counts.meds} ${L.plural(counts.meds, ['лекарство', 'лекарства', 'лекарств'])}`);
    if (counts.feeds) parts.push(`${counts.feeds} ${L.plural(counts.feeds, ['корм', 'корма', 'кормов'])}`);
    if (counts.allergies) parts.push(`${counts.allergies} ${L.plural(counts.allergies, ['аллерген', 'аллергена', 'аллергенов'])}`);
    toast(parts.length ? 'Добавлено: ' + parts.join(', ') : docId ? 'Фото сохранено в документах' : 'Ничего не сохранено');
    const dest = counts.tests === 1 && lastTestId ? 'test/' + lastTestId : counts.vaccines ? 'vaccines' : counts.tests ? 'health/tests' : counts.meds ? 'health/meds' : counts.feeds ? 'health/feeds' : counts.allergies ? 'health/allergies' : docId ? 'docs' : route().name;
    afterSheets(() => go(dest));
  };
}

function conflictWarn(pet, text) {
  const c = L.allergyConflicts(pet.id, text);
  return c.length ? `<div class="warnbox full">⚠️ Возможный аллерген для ${esc(pet.name)}: ${c.map(a => esc(a.allergen)).join(', ')}</div>` : '';
}
function testPreview(t, pet) {
  const s = L.testSummary(t, pet.species);
  if (!s.total) return '';
  return s.bad.length ? `<div class="warnbox">Вне нормы: ${s.bad.map(x => `${esc(x.i.name)} ${x.r.s === 'high' ? '↑' : '↓'}`).join(', ')}</div>` : `<div class="hint">✅ Все показатели в пределах нормы</div>`;
}

// ---------- питомцы ----------
function petForm(rec = {}) {
  const isNew = !rec.id;
  const w = rec.id ? L.latestWeight(rec.id) : null;
  const listFor = s => 'dl-breed-' + (s || 'dog');
  openForm({
    title: isNew ? 'Новый питомец' : rec.name,
    values: { species: 'dog', sex: 'f', ...rec, weight: w ? w.kg : '' },
    fields: [
      { name: 'photoId', label: 'Фото питомца', type: 'photo', emoji: '🐾' },
      { name: 'name', label: 'Кличка', required: true, placeholder: 'Как зовут питомца?' },
      { name: 'species', label: 'Вид', type: 'seg', options: [['dog', '🐶 Собака'], ['cat', '🐱 Кошка'], ['other', '🐾 Другое']] },
      { name: 'breed', label: 'Порода', list: listFor(rec.species), placeholder: 'Начните вводить…' },
      { name: 'sex', label: 'Пол', type: 'seg', options: [['f', '♀ Девочка'], ['m', '♂ Мальчик']] },
      { name: 'birth', label: 'Дата рождения', type: 'date', half: true },
      { name: 'weight', label: 'Вес, кг', type: 'number', half: true, placeholder: '0,0' },
      { name: 'color', label: 'Окрас', half: true },
      { name: 'chip', label: 'Номер чипа / клейма', half: true, placeholder: '643…' },
      { name: 'sterilized', label: 'Стерилизован(а) / кастрирован', type: 'check' },
      { name: 'cycleDays', label: 'Обычный интервал между течками, дней', type: 'number', show: v => v.sex === 'f' && !v.sterilized && v.species !== 'other', placeholder: 'по умолчанию 183 для собак, 21 для кошек' },
      { name: 'notes', label: 'Особенности, хронические болезни', type: 'textarea', rows: 2 },
    ],
    onChange(v, f, changed) {
      if (changed === 'species') f.querySelector('[name=breed]').setAttribute('list', listFor(v.species));
    },
    hydrate,
    onSave(v) {
      const weight = v.weight; delete v.weight;
      const p = upsertPet({ ...rec, ...v, createdAt: rec.createdAt || new Date().toISOString() });
      if (weight > 0 && (!w || +w.kg !== +weight)) upsert('weights', { petId: p.id, kg: weight, date: L.today() });
      state.currentPetId = p.id; save();
      toast(isNew ? `${p.name} добавлен${p.sex === 'f' ? 'а' : ''} 🎉` : 'Профиль сохранён');
      afterSheets(() => (isNew ? go('home') : render()));
    },
    onDelete: isNew ? null : async () => {
      state.pets = state.pets.filter(p => p.id !== rec.id);
      ['vaccines', 'heats', 'meds', 'feeds', 'tests', 'allergies', 'weights'].forEach(c => (state.records[c] = state.records[c].filter(r => r.petId !== rec.id)));
      state.records.docs.filter(d => d.petId === rec.id).forEach(d => remove('docs', d.id));
      state.currentPetId = state.pets[0]?.id || null;
      save();
      toast('Питомец удалён');
      afterSheets(() => go('home'));
    },
  });
}
// Питомцы хранятся в state.pets, а не в records
function upsertPet(rec) {
  if (!rec.id) rec.id = uid();
  const i = state.pets.findIndex(p => p.id === rec.id);
  if (i >= 0) state.pets[i] = { ...state.pets[i], ...rec }; else state.pets.push(rec);
  save();
  return rec;
}

function vPets(pet) {
  return `<div class="view-head"><h1>Питомцы</h1><button class="add-btn" data-act="addPet" aria-label="Добавить">${I.plus}</button></div>
  <section class="card"><div class="list">${state.pets.map(p => `<div class="item">${avatar(p)}<button class="item-main" data-act="switchPet" data-id="${p.id}" style="text-align:left"><span class="item-title">${esc(p.name)} ${p.id === pet.id ? pill('ok', 'выбран') : ''}</span><span class="item-sub" style="display:block">${[p.breed || D.SPECIES[p.species]?.label, sexLabel(p), L.ageText(p.birth)].filter(Boolean).map(esc).join(' · ')}</span></button><button class="icon-btn" data-act="editPet" data-id="${p.id}" aria-label="Редактировать">${I.edit}</button></div>`).join('')}</div></section>`;
}

function petPicker() {
  const sh = openSheet({
    title: 'Питомцы',
    body: `<div class="list">${state.pets.map(p => `<button class="item" data-pick="${p.id}">${avatar(p)}<span class="item-main"><span class="item-title">${esc(p.name)}</span><span class="item-sub" style="display:block">${[p.breed || D.SPECIES[p.species]?.label, L.ageText(p.birth)].filter(Boolean).map(esc).join(' · ')}</span></span>${p.id === L.currentPet().id ? I.check.replace('<svg', '<svg style="width:22px;color:var(--accent)"') : ''}</button>`).join('')}</div>`,
    foot: `<button class="btn" data-x="edit" type="button">${I.edit} Профиль</button><button class="btn btn-primary" data-x="add" type="button">${I.plus} Добавить</button>`,
  });
  hydrate(sh.el);
  sh.body.onclick = e => { const b = e.target.closest('[data-pick]'); if (b) { state.currentPetId = b.dataset.pick; save(); sh.close(); render(); } };
  sh.foot.querySelector('[data-x=add]').onclick = () => afterSheets(() => petForm());
  sh.foot.querySelector('[data-x=edit]').onclick = () => afterSheets(() => petForm(L.currentPet()));
}

// ---------- настройки ----------
function vSettings() {
  const s = state.settings;
  const notifyState = env.artifact ? 'на главной при каждом открытии' : !('Notification' in window) ? 'не поддерживаются этим браузером' : Notification.permission === 'granted' && s.notify ? 'включены' : Notification.permission === 'denied' ? 'запрещены в браузере' : 'выключены';
  return `<div class="view-head"><h1>Настройки</h1></div>
  <div class="grid-2">
    ${env.artifact ? `<section class="card stack">
      <div class="row"><span class="bubble c-accent">${I.sparkle}</span><div class="grow"><h2>Умное распознавание</h2><div class="small muted">${sampleReady() ? '✅ через ваш Claude, ключ не нужен' : 'недоступно здесь — работает распознавание на устройстве'}</div></div></div>
      <p class="small muted" style="margin:0">Фото документов разбирает Claude с вашего аккаунта: он понимает рукописные ветпаспорта, печати, наклейки вакцин и бланки анализов. При первом распознавании Claude попросит разрешения.</p>
    </section>` : `<section class="card stack">
      <div class="row"><span class="bubble c-accent">${I.sparkle}</span><div class="grow"><h2>Умное распознавание</h2><div class="small muted">${s.apiKey ? '✅ включено' : 'выключено — работает офлайн-OCR'}</div></div></div>
      <p class="small muted" style="margin:0">С ключом Claude приложение понимает рукописные ветпаспорта, печати, наклейки вакцин и любые бланки анализов, а также пишет краткую сводку. Ключ можно получить на <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noopener">console.anthropic.com</a>. Ключ хранится только на этом устройстве и не попадает в резервные копии.</p>
      <label class="field"><span>API-ключ Claude</span><input class="input" type="password" id="set-key" placeholder="sk-ant-…" value="${esc(s.apiKey)}" autocomplete="off"></label>
      <label class="field"><span>Модель</span><select id="set-model">
        ${[['claude-opus-5-5', 'Claude Opus 5.5 — лучшее качество'], ['claude-sonnet-5-5', 'Claude Sonnet 5.5 — быстрее и дешевле'], ['claude-haiku-5-5', 'Claude Haiku 5.5 — самый экономный']].map(([k, l]) => `<option value="${k}" ${s.model === k ? 'selected' : ''}>${l}</option>`).join('')}
      </select></label>
      <div class="row"><button class="btn btn-primary btn-sm" data-act="saveAi">Сохранить</button>${s.apiKey ? `<button class="btn btn-sm btn-ghost" data-act="clearAi">Удалить ключ</button>` : ''}</div>
    </section>`}
    <section class="card stack">
      <div class="row"><span class="bubble c-vac">${I.bell}</span><div class="grow"><h2>Напоминания</h2><div class="small muted">${env.artifact ? 'Напоминания: ' : 'Уведомления: '}${notifyState}</div></div></div>
      <label class="field"><span>Предупреждать заранее</span><select id="set-remind">${[3, 7, 14, 30].map(n => `<option value="${n}" ${+s.reminderDays === n ? 'selected' : ''}>за ${L.nDays(n)}</option>`).join('')}</select></label>
      <div class="row wrap">
        ${'Notification' in window && !env.artifact ? `<button class="btn btn-sm" data-act="toggleNotify">${s.notify && Notification.permission === 'granted' ? 'Выключить уведомления' : 'Включить уведомления'}</button>` : ''}
        ${env.artifact ? '' : `<button class="btn btn-sm" data-act="exportIcs">${I.download} Экспорт в календарь (.ics)</button>`}
      </div>
      <p class="tiny muted" style="margin:0">${env.artifact ? 'Просроченные и ближайшие процедуры показываются на главной при каждом открытии. Уведомления на телефон и экспорт в календарь доступны в версии-приложении (PWA).' : 'Уведомления показываются при открытии приложения. Чтобы напоминания приходили даже когда приложение закрыто — экспортируйте события в календарь телефона: в файле уже есть будильники.'}</p>
    </section>
    <section class="card stack">
      <h2>Оформление</h2>
      <div class="seg">${[['auto', 'Как в системе'], ['light', 'Светлая'], ['dark', 'Тёмная']].map(([k, l]) => `<button class="${s.theme === k ? 'on' : ''}" data-act="setTheme" data-k="${k}">${l}</button>`).join('')}</div>
      <div class="divider"></div>
      <h2>Питомцы</h2>
      <button class="btn btn-sm" data-act="go" data-route="pets" style="align-self:flex-start">Управление питомцами (${state.pets.length})</button>
    </section>
    <section class="card stack">
      <h2>Данные</h2>
      <p class="small muted" style="margin:0">${storage.mode === 'cloud' ? 'Записи хранятся в вашем личном разделе этой страницы — другие люди, которым вы её покажете, их не видят. Фото документов лежат в файлах страницы. Резервная копия переносит всё в версию-приложение и обратно.' : 'Всё хранится локально в браузере. Делайте резервную копию, чтобы перенести данные на другое устройство.'}</p>
      ${storage.error ? `<div class="warnbox">${esc(storage.error)}</div>` : ''}
      <div class="row wrap">
        <button class="btn btn-sm" data-act="exportJson">${I.download} Резервная копия</button>
        <button class="btn btn-sm" data-act="importJson">${I.upload} Восстановить</button>
        <button class="btn btn-sm" data-act="demo">Добавить демо-питомцев</button>
      </div>
      <button class="btn btn-sm btn-danger" data-act="wipe" style="align-self:flex-start">${I.trash} Удалить все данные</button>
    </section>
  </div>
  <p class="tiny muted center" style="margin-top:24px">Лапки · приложение не заменяет консультацию ветеринара</p>`;
}

// ---------- экспорт календаря ----------
function buildIcs() {
  const e = s => String(s).replace(/[\\,;]/g, m => '\\' + m).replace(/\n/g, '\\n');
  const d = iso => iso.replace(/-/g, '');
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Lapki//RU', 'CALSCALE:GREGORIAN', 'X-WR-CALNAME:Лапки'];
  const stamp = new Date().toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z';
  const ev = (uidv, date, end, title, desc, alarm = true) => {
    lines.push('BEGIN:VEVENT', `UID:${uidv}@lapki`, `DTSTAMP:${stamp}`, `DTSTART;VALUE=DATE:${d(date)}`, `DTEND;VALUE=DATE:${d(L.addDays(end || date, 1))}`, `SUMMARY:${e(title)}`);
    if (desc) lines.push(`DESCRIPTION:${e(desc)}`);
    if (alarm) lines.push('BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${e(title)}`, 'TRIGGER:-P2DT-9H', 'END:VALARM', 'BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${e(title)}`, 'TRIGGER:PT9H', 'END:VALARM');
    lines.push('END:VEVENT');
  };
  let n = 0;
  for (const p of state.pets) {
    L.vaccineGroups(p.id).forEach(r => { if (r.next && r.next >= L.addDays(L.today(), -30)) { ev('v' + r.id, r.next, null, `${p.name}: ${r.name}`, `${D.REC_KINDS[r.kind]?.label}. Прошлый раз: ${L.fmtDate(r.date, true)}`); n++; } });
    if (L.tracksHeat(p)) L.heatInfo(p).predicted.forEach((x, i) => { ev(`h${p.id}${i}`, x.start, x.end, `${p.name}: ожидается течка`, 'Прогноз приложения Лапки'); n++; });
    list('meds', p.id).forEach(m => { if (m.end && m.end >= L.today()) { ev('m' + m.id, m.end, null, `${p.name}: конец курса ${m.name}`, [m.dose, m.schedule].filter(Boolean).join(', ')); n++; } });
  }
  lines.push('END:VCALENDAR');
  return { text: lines.join('\r\n'), n };
}

async function download(name, content, type) {
  const blob = content instanceof Blob ? content : new Blob([content], { type });
  if (env.downloads) {
    try { await env.downloads.save({ filename: name, data: blob }); return true; }
    catch (e) { if (e?.code !== 'declined') toast('Не удалось сохранить файл'); return false; }
  }
  if (env.artifact) { toast('Сохранение файлов здесь недоступно'); return false; }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  return true;
}

// ---------- уведомления ----------
async function checkReminders(force) {
  const s = state.settings;
  if (!('Notification' in window) || Notification.permission !== 'granted' || !s.notify) return;
  if (!force && s.lastNotified === L.today()) return;
  const due = L.allEvents({ from: L.addDays(L.today(), -365), to: L.addDays(L.today(), 3) }).filter(e => e.kind === 'vac' || (e.kind === 'heat' && !e.predicted) || e.kind === 'med');
  s.lastNotified = L.today(); save();
  if (!due.length) return;
  const body = due.slice(0, 4).map(e => `${e.pet.name}: ${e.title} — ${e.status}`).join('\n');
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    const opts = { body, icon: 'icons/icon-192.png', badge: 'icons/icon-192.png', tag: 'lapki-daily' };
    if (reg) reg.showNotification('Лапки: напоминания', opts); else new Notification('Лапки: напоминания', opts);
  } catch (e) { console.warn(e); }
}

// ---------- демо ----------
function seedDemo() {
  const t = L.today();
  const a = n => L.addDays(t, n);
  const dog = { id: uid(), name: 'Бусинка', species: 'dog', breed: 'Вельш-корги пемброк', sex: 'f', birth: L.addDays(t, -365 * 3 - 120), color: 'рыже-белый', chip: '643094100123456', sterilized: false, notes: '', createdAt: new Date().toISOString() };
  const cat = { id: uid(), name: 'Барсик', species: 'cat', breed: 'Британская короткошёрстная', sex: 'm', birth: L.addDays(t, -365 * 5 - 30), color: 'голубой', sterilized: true, notes: '', createdAt: new Date().toISOString() };
  upsertPet(dog); upsertPet(cat);
  const P = dog.id, C = cat.id;
  [[-330, 11.2], [-240, 11.6], [-150, 12.1], [-90, 12.4], [-40, 12.0], [-5, 11.8]].forEach(([d, kg]) => upsert('weights', { petId: P, date: a(d), kg }));
  [[-300, 5.9], [-120, 6.3], [-10, 6.1]].forEach(([d, kg]) => upsert('weights', { petId: C, date: a(d), kg }));
  upsert('vaccines', { petId: P, kind: 'vaccine', name: 'Нобивак DHPPi+L', date: a(-730), next: a(-365), clinic: 'Вет-клиника «Айболит»' });
  upsert('vaccines', { petId: P, kind: 'vaccine', name: 'Нобивак DHPPi+L', date: a(-358), next: a(7), clinic: 'Вет-клиника «Айболит»', batch: 'A421B01' });
  upsert('vaccines', { petId: P, kind: 'vaccine', name: 'Нобивак Rabies', date: a(-200), next: a(165), clinic: 'Вет-клиника «Айболит»', batch: 'R118C07' });
  upsert('vaccines', { petId: P, kind: 'deworm', name: 'Мильбемакс', date: a(-95), next: a(-5) });
  upsert('vaccines', { petId: P, kind: 'flea', name: 'Бравекто', date: a(-60), next: a(24) });
  upsert('vaccines', { petId: C, kind: 'vaccine', name: 'Пуревакс RCPCh', date: a(-150), next: a(215) });
  upsert('vaccines', { petId: C, kind: 'deworm', name: 'Профендер', date: a(-30), next: a(60) });
  [[-555, -535], [-372, -351], [-190, -170], [-12, null]].forEach(([s, e]) => upsert('heats', { petId: P, start: a(s), end: e == null ? '' : a(e), notes: '' }));
  upsert('meds', { petId: P, name: 'Апоквел 16 мг', dose: '½ таблетки', schedule: '1 раз в день', start: a(-8), end: a(9), reason: 'зуд, дерматит' });
  upsert('meds', { petId: P, name: 'Омега-3 для собак', dose: '1 капсула', schedule: 'во время еды', start: a(-60), end: '', reason: 'шерсть и кожа' });
  upsert('feeds', { petId: P, name: 'Royal Canin Hypoallergenic', brand: 'Royal Canin', type: 'Лечебный', portion: '180 г в день', since: a(-75), verdict: 'ok', ingredients: 'гидролизат соевого белка, рисовая мука, животные жиры, минеральные вещества' });
  upsert('feeds', { petId: P, name: 'Pro Plan Medium Adult', brand: 'Purina Pro Plan', type: 'Сухой', since: a(-400), until: a(-76), verdict: 'bad', ingredients: 'курица (20%), пшеница, кукуруза, рис, жир животный', notes: 'зуд, покраснение ушей' });
  upsert('feeds', { petId: C, name: "Hill's Science Plan Sterilised Cat", brand: "Hill's", type: 'Сухой', since: a(-200), verdict: 'ok', ingredients: 'тунец, пшеница, кукурузный глютен' });
  upsert('allergies', { petId: P, allergen: 'Курица', category: 'Пищевая', severity: 'medium', reaction: 'зуд, покраснение ушей и лап', date: a(-80), confirmed: true });
  upsert('tests', { petId: P, type: 'Биохимия крови', date: a(-20), lab: 'Лаборатория «ВетЛаб»', items: [
    { name: 'АЛТ', value: '88', unit: 'Ед/л', min: '10', max: '65' }, { name: 'АСТ', value: '35', unit: 'Ед/л', min: '10', max: '42' },
    { name: 'Щелочная фосфатаза', value: '96', unit: 'Ед/л', min: '10', max: '150' }, { name: 'Общий белок', value: '66', unit: 'г/л', min: '55', max: '75' },
    { name: 'Альбумин', value: '32', unit: 'г/л', min: '25', max: '40' }, { name: 'Мочевина', value: '6.1', unit: 'ммоль/л', min: '3.5', max: '9.2' },
    { name: 'Креатинин', value: '102', unit: 'мкмоль/л', min: '44', max: '138' }, { name: 'Глюкоза', value: '5.4', unit: 'ммоль/л', min: '4.3', max: '7.3' },
  ], conclusion: '' });
  upsert('tests', { petId: P, type: 'Общий анализ крови', date: a(-20), lab: 'Лаборатория «ВетЛаб»', items: [
    { name: 'Эритроциты', value: '7.1', unit: '×10¹²/л' }, { name: 'Гемоглобин', value: '164', unit: 'г/л' }, { name: 'Гематокрит', value: '47', unit: '%' },
    { name: 'Лейкоциты', value: '12.8', unit: '×10⁹/л' }, { name: 'Эозинофилы', value: '13', unit: '%' }, { name: 'Тромбоциты', value: '310', unit: '×10⁹/л' },
  ], conclusion: 'Эозинофилия — вероятно, аллергическая реакция.' });
  upsert('tests', { petId: C, type: 'Биохимия крови', date: a(-100), lab: 'Лаборатория «ВетЛаб»', items: [
    { name: 'Мочевина', value: '9.8', unit: 'ммоль/л' }, { name: 'Креатинин', value: '148', unit: 'мкмоль/л' }, { name: 'Глюкоза', value: '5.9', unit: 'ммоль/л' }, { name: 'АЛТ', value: '52', unit: 'Ед/л' },
  ], conclusion: '' });
  state.currentPetId = P;
  save();
}

// ---------- действия ----------
const findRec = (c, id) => state.records[c].find(r => r.id === id);
const petOf = el => (el.dataset.pet ? state.pets.find(p => p.id === el.dataset.pet) : null);
const actions = {
  go: el => afterSheets(() => go(el.dataset.route)),
  switchPet: el => { state.currentPetId = el.dataset.id; save(); afterSheets(() => (route().name === 'pets' ? go('home') : render())); },
  petPicker,
  addPet: () => petForm(),
  editPet: el => petForm(state.pets.find(p => p.id === el.dataset.id)),
  scan: () => openScan('auto'),
  scanKind: el => openScan(el.dataset.kind),
  addVaccine: el => vaccineForm(el.dataset.date ? { date: el.dataset.date, next: L.suggestNext('vaccine', el.dataset.date) } : {}),
  editVaccine: el => { const r = findRec('vaccines', el.dataset.id); if (r) vaccineForm(r, petOf(el) || L.currentPet()); },
  repeatVaccine: el => {
    const r = findRec('vaccines', el.dataset.id);
    if (!r) return;
    const gap = r.next ? L.diffDays(r.date, r.next) : D.REC_KINDS[r.kind].defaultNextDays;
    vaccineForm({ kind: r.kind, name: r.name, clinic: r.clinic, date: L.today(), next: L.addDays(L.today(), gap), petId: r.petId });
  },
  vacFilter: el => { ui.vacFilter = el.dataset.k; render(); },
  addHeat: el => heatForm(el.dataset.date ? { start: el.dataset.date } : {}),
  editHeat: el => { const r = findRec('heats', el.dataset.id); if (r) heatForm(r, petOf(el) || L.currentPet()); },
  heatStart: () => { upsert('heats', { petId: L.currentPet().id, start: L.today(), end: '' }); toast('Отмечено начало течки 🌸'); render(); },
  heatEnd: el => { const r = findRec('heats', el.dataset.id); if (r) { r.end = L.today(); save(); toast('Отмечено окончание'); render(); } },
  addMed: () => medForm(),
  editMed: el => { const r = findRec('meds', el.dataset.id); if (r) medForm(r, petOf(el) || L.currentPet()); },
  addFeed: () => feedForm(),
  editFeed: el => { const r = findRec('feeds', el.dataset.id); if (r) feedForm(r); },
  addTest: () => testForm(),
  editTest: el => { const r = findRec('tests', el.dataset.id); if (r) testForm(r); },
  openTest: el => afterSheets(() => go('test/' + el.dataset.id)),
  testToAllergies: el => {
    const t = findRec('tests', el.dataset.id);
    const p = state.pets.find(x => x.id === t.petId);
    let n = 0;
    L.testSummary(t, p.species).bad.filter(x => x.r.s === 'high').forEach(x => {
      if (!list('allergies', p.id).some(a => a.allergen.toLowerCase() === x.i.name.toLowerCase())) { upsert('allergies', { petId: p.id, allergen: x.i.name, category: 'Пищевая', severity: 'medium', confirmed: true, date: t.date, reaction: '' }); n++; }
    });
    toast(n ? `Добавлено аллергенов: ${n}` : 'Все уже в списке');
    go('health/allergies');
  },
  addAllergy: () => allergyForm(),
  editAllergy: el => { const r = findRec('allergies', el.dataset.id); if (r) allergyForm(r); },
  addWeight: el => weightForm(el.dataset.date ? { date: el.dataset.date } : {}),
  editWeight: el => { const r = findRec('weights', el.dataset.id); if (r) weightForm(r); },
  openDoc: el => openDoc(el.dataset.id),
  calMove: el => { const m = L.addMonths(ui.calMonth + '-01', +el.dataset.n); ui.calMonth = m.slice(0, 7); render(); },
  calToday: () => { ui.calMonth = L.today().slice(0, 7); ui.calSel = L.today(); render(); },
  calDay: el => { ui.calSel = el.dataset.d; if (el.dataset.d.slice(0, 7) !== ui.calMonth) ui.calMonth = el.dataset.d.slice(0, 7); render(); },
  calAll: el => { ui.calAll = el.checked; render(); },
  exportIcs: () => {
    const { text, n } = buildIcs();
    if (!n) { toast('Нет предстоящих событий для экспорта'); return; }
    download('lapki-calendar.ics', text, 'text/calendar');
    toast(`Экспортировано событий: ${n}. Откройте файл, чтобы добавить в календарь`);
  },
  saveAi: () => {
    state.settings.apiKey = $('#set-key').value.trim();
    state.settings.model = $('#set-model').value;
    save(); toast(state.settings.apiKey ? 'Умный режим включён ✨' : 'Сохранено'); render();
  },
  clearAi: () => { state.settings.apiKey = ''; save(); toast('Ключ удалён'); render(); },
  toggleNotify: async () => {
    if (state.settings.notify && Notification.permission === 'granted') { state.settings.notify = false; save(); render(); return; }
    const p = await Notification.requestPermission();
    state.settings.notify = p === 'granted';
    save(); render();
    if (p === 'granted') { toast('Уведомления включены'); checkReminders(true); } else toast('Разрешение не получено');
  },
  setTheme: el => { state.settings.theme = el.dataset.k; save(); render(); },
  exportJson: async () => {
    toast('Готовлю резервную копию…');
    const data = await exportAll();
    if (await download(`lapki-backup-${L.today()}.json`, JSON.stringify(data), 'application/json')) toast('Резервная копия сохранена');
  },
  importJson: async () => {
    const file = await pickFile('#file-import');
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      if (state.pets.length && !(await confirmBox('Текущие данные будут заменены данными из копии. Продолжить?', 'Восстановить'))) return;
      await importAll(data);
      toast('Данные восстановлены');
      afterSheets(() => go('home'));
    } catch (e) { toast('Ошибка: ' + e.message); }
  },
  demo: () => { seedDemo(); toast('Добавлены демо-питомцы — можно всё потрогать'); afterSheets(() => go('home')); },
  wipe: async () => {
    if (!(await confirmBox(storage.mode === 'cloud' ? 'Удалить всех питомцев, записи и фото? Сначала сделайте резервную копию.' : 'Удалить всех питомцев, записи и фото с этого устройства? Сначала сделайте резервную копию.', 'Удалить всё'))) return;
    await wipeAll();
    location.hash = '';
    render();
  },
};

document.addEventListener('click', e => {
  const el = e.target.closest('[data-act]');
  if (!el || el.tagName === 'INPUT') return;
  const fn = actions[el.dataset.act];
  if (fn) { e.preventDefault(); fn(el, e); }
});
document.addEventListener('change', e => {
  const el = e.target.closest('input[data-act]');
  if (el && actions[el.dataset.act]) actions[el.dataset.act](el, e);
  if (e.target.id === 'set-remind') { state.settings.reminderDays = +e.target.value; save(); render(); }
});

// ---------- справочные datalist ----------
function datalists() {
  const dl = (id, items) => `<datalist id="${id}">${[...new Set(items)].map(x => `<option value="${esc(x)}">`).join('')}</datalist>`;
  const nice = arr => arr.filter(x => /^[A-ZА-Я]/.test(x) && x.length > 3);
  document.body.insertAdjacentHTML('beforeend',
    dl('dl-breed-dog', D.BREEDS.dog) + dl('dl-breed-cat', D.BREEDS.cat) + dl('dl-breed-other', D.BREEDS.other) +
    dl('dl-vac', [...nice(D.VACCINE_NAMES), 'Нобивак DHPPi+L', 'Нобивак Rabies', 'Эурикан DHPPI2-LR', 'Пуревакс RCPCh', 'Мультифел-4']) +
    dl('dl-deworm', nice(D.DEWORM_NAMES)) + dl('dl-flea', nice(D.FLEA_NAMES)) + dl('dl-brands', D.FEED_BRANDS) +
    dl('dl-lab', D.LAB_PARAMS.map(p => p.name)) +
    dl('dl-allergens', Object.keys(D.ALLERGEN_STEMS).map(k => k[0].toUpperCase() + k.slice(1)).concat(['Пыльца', 'Пылевые клещи', 'Блохи (слюна)', 'Плесень', 'Пенициллин'])));
}

// ---------- старт ----------
(async function init() {
  await initEnv();
  await loadState();
  datalists();
  render();
  if (storage.error) toast(storage.error);
  window.addEventListener('lapki:storage-error', e => toast(e.detail));
  if (env.artifact) return;
  checkReminders();
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js').catch(e => console.warn('SW', e));
  }
})();
