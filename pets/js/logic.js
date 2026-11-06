// Вычисления: даты, статусы прививок, прогноз течки, события, аллергии, анализы.
import { state, list } from './store.js';
import { SPECIES, REC_KINDS, ALLERGEN_STEMS, findLabParam } from './data.js';

// ---------- даты ----------
const pad = n => String(n).padStart(2, '0');
export const isoOf = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const today = () => isoOf(new Date());
export const parseISO = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d, 12); };
export const addDays = (iso, n) => { const d = parseISO(iso); d.setDate(d.getDate() + n); return isoOf(d); };
export const diffDays = (a, b) => Math.round((parseISO(b) - parseISO(a)) / 864e5);
export const addMonths = (iso, n) => { const d = parseISO(iso); d.setMonth(d.getMonth() + n); return isoOf(d); };

export function plural(n, forms) {
  const a = Math.abs(n) % 100, b = a % 10;
  if (a > 10 && a < 20) return forms[2];
  if (b > 1 && b < 5) return forms[1];
  if (b === 1) return forms[0];
  return forms[2];
}
const DAYS = ['день', 'дня', 'дней'];
export const nDays = n => `${n} ${plural(n, DAYS)}`;

export function fmtDate(iso, withYear) {
  if (!iso) return '';
  const d = parseISO(iso);
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', ...(withYear || !sameYear ? { year: 'numeric' } : {}) }).replace(' г.', '');
}
export function relDays(iso) {
  const n = diffDays(today(), iso);
  if (n === 0) return 'сегодня';
  if (n === 1) return 'завтра';
  if (n === -1) return 'вчера';
  if (n > 0) return n < 60 ? `через ${nDays(n)}` : `через ${Math.round(n / 30)} мес.`;
  return -n < 60 ? `${nDays(-n)} назад` : `${Math.round(-n / 30)} мес. назад`;
}
export function ageText(birth) {
  if (!birth) return '';
  const b = parseISO(birth), t = new Date();
  let months = (t.getFullYear() - b.getFullYear()) * 12 + t.getMonth() - b.getMonth();
  if (t.getDate() < b.getDate()) months--;
  if (months < 0) return '';
  if (months < 1) return nDays(diffDays(birth, today()));
  const y = Math.floor(months / 12), m = months % 12;
  const parts = [];
  if (y) parts.push(`${y} ${plural(y, ['год', 'года', 'лет'])}`);
  if (m) parts.push(`${m} мес.`);
  return parts.join(' ');
}

// ---------- питомцы ----------
export const currentPet = () => state.pets.find(p => p.id === state.currentPetId) || state.pets[0] || null;
export const petEmoji = p => (SPECIES[p?.species] || SPECIES.other).emoji;
export const isFemale = p => p && p.sex === 'f';
export const tracksHeat = p => isFemale(p) && !p.sterilized && p.species !== 'other';

export function latestWeight(petId) {
  const w = list('weights', petId).sort((a, b) => (a.date < b.date ? 1 : -1));
  return w[0] || null;
}

// ---------- прививки и обработки ----------
const keyOf = r => r.kind + '|' + (r.name || '').toLowerCase().replace(/\s+/g, ' ').trim();

export function vaccineStatus(next) {
  if (!next) return { cls: '', label: 'без повтора' };
  const n = diffDays(today(), next);
  const soon = state.settings.reminderDays || 14;
  if (n < 0) return { cls: 'bad', label: `просрочено ${nDays(-n)}`, n };
  if (n === 0) return { cls: 'warn', label: 'сегодня', n };
  if (n <= soon) return { cls: 'warn', label: `через ${nDays(n)}`, n };
  return { cls: 'ok', label: fmtDate(next), n };
}

// Последняя запись в каждой «группе» (тип + название)
export function vaccineGroups(petId) {
  const groups = new Map();
  list('vaccines', petId).forEach(r => {
    const k = keyOf(r);
    const g = groups.get(k);
    if (!g || r.date > g.date) groups.set(k, r);
  });
  return [...groups.values()].sort((a, b) => (a.next || '9999') < (b.next || '9999') ? -1 : 1);
}

export function suggestNext(kind, date) {
  return date ? addDays(date, (REC_KINDS[kind] || REC_KINDS.other).defaultNextDays) : '';
}

// ---------- течка ----------
export function heatInfo(pet) {
  const sp = SPECIES[pet.species] || SPECIES.other;
  const recs = list('heats', pet.id).slice().sort((a, b) => (a.start < b.start ? -1 : 1));
  const defInterval = +pet.cycleDays || sp.cycleDays;
  const intervals = [];
  for (let i = 1; i < recs.length; i++) {
    const d = diffDays(recs[i - 1].start, recs[i].start);
    if (d > defInterval * 0.35 && d < defInterval * 2.6) intervals.push(d);
  }
  const lastInts = intervals.slice(-4);
  const interval = lastInts.length ? Math.round(lastInts.reduce((a, b) => a + b, 0) / lastInts.length) : defInterval;
  const durs = recs.filter(r => r.end).map(r => diffDays(r.start, r.end) + 1).filter(d => d > 0 && d < 45);
  const duration = durs.length ? Math.round(durs.reduce((a, b) => a + b, 0) / durs.length) : sp.heatDays;
  const t = today();
  const last = recs[recs.length - 1];
  let current = null;
  if (last) {
    const end = last.end || addDays(last.start, duration - 1);
    if (last.start <= t && t <= end) current = { rec: last, day: diffDays(last.start, t) + 1, end, open: !last.end };
    else if (!last.end && diffDays(last.start, t) < 40 && last.start <= t) current = { rec: last, day: diffDays(last.start, t) + 1, end, open: true, long: true };
  }
  const predicted = [];
  if (last) {
    let s = addDays(last.start, interval);
    const grace = Math.min(30, Math.round(interval / 2));
    while (diffDays(s, t) > grace) s = addDays(s, interval); // пропущенные циклы не тянем бесконечно
    for (let i = 0; i < 3; i++) {
      const st = addDays(s, interval * i);
      predicted.push({ start: st, end: addDays(st, duration - 1), fertile: pet.species === 'dog' ? [addDays(st, 9), addDays(st, 14)] : null });
    }
  }
  const next = predicted[0] || null;
  const daysToNext = next ? diffDays(t, next.start) : null;
  const fertileNow = current && pet.species === 'dog' && current.day >= 10 && current.day <= 15;
  return { recs, interval, duration, intervals, current, predicted, next, daysToNext, fertileNow, learned: lastInts.length > 0, count: recs.length };
}

// ---------- лекарства ----------
export function medActive(m) {
  const t = today();
  return (!m.start || m.start <= t) && (!m.end || m.end >= t);
}

// ---------- аллергии ----------
export function allergyStems(a) {
  const name = (a.allergen || '').toLowerCase().trim();
  if (!name) return [];
  for (const [k, stems] of Object.entries(ALLERGEN_STEMS)) {
    if (name.includes(k) || stems.some(s => name.includes(s.trim()))) return [k.slice(0, Math.max(4, k.length - 2)), ...stems];
  }
  return [name.length > 5 ? name.slice(0, name.length - 2) : name];
}
export function allergyConflicts(petId, text) {
  if (!text) return [];
  const t = ' ' + text.toLowerCase().replace(/ё/g, 'е') + ' ';
  return list('allergies', petId).filter(a => allergyStems(a).some(s => s && t.includes(s.toLowerCase())));
}
export const feedText = f => [f.name, f.brand, f.ingredients].filter(Boolean).join(' ');
export const medText = m => [m.name, m.notes].filter(Boolean).join(' ');

// ---------- анализы ----------
export function labStatus(item, species) {
  const v = parseFloat(String(item.value).replace(',', '.'));
  let min = item.min === '' || item.min == null ? null : parseFloat(String(item.min).replace(',', '.'));
  let max = item.max === '' || item.max == null ? null : parseFloat(String(item.max).replace(',', '.'));
  const p = findLabParam(item.name);
  if ((min == null || isNaN(min)) && (max == null || isNaN(max)) && p) {
    const r = p.ref[species] || p.ref.dog;
    min = r[0]; max = r[1];
  }
  if (isNaN(v)) return { v: null, min, max, s: 'na', p };
  let s = 'ok';
  if (min != null && !isNaN(min) && v < min) s = 'low';
  if (max != null && !isNaN(max) && v > max) s = 'high';
  return { v, min, max, s, p, hint: s === 'high' ? p?.high : s === 'low' ? p?.low : '' };
}
export function testSummary(test, species) {
  const res = (test.items || []).map(i => ({ i, r: labStatus(i, species) }));
  const bad = res.filter(x => x.r.s === 'high' || x.r.s === 'low');
  return { res, bad, total: res.filter(x => x.r.s !== 'na').length };
}

// ---------- события ----------
export function petEvents(pet, { from = addDays(today(), -60), to = addDays(today(), 120) } = {}) {
  if (!pet) return [];
  const ev = [];
  vaccineGroups(pet.id).forEach(r => {
    if (r.next && r.next <= to) {
      const st = vaccineStatus(r.next);
      ev.push({ date: r.next, kind: 'vac', title: r.name || REC_KINDS[r.kind]?.label, sub: `${REC_KINDS[r.kind]?.label || ''} · повтор`, icon: REC_KINDS[r.kind]?.icon || '💉', cls: st.cls, status: st.label, act: 'editVaccine', id: r.id, overdue: st.n < 0, pet });
    }
  });
  if (tracksHeat(pet)) {
    const h = heatInfo(pet);
    if (h.current) ev.push({ date: today(), kind: 'heat', title: `Течка: ${h.current.day}-й день`, sub: h.fertileNow ? 'Благоприятные дни для вязки' : `ожидаемое окончание ${fmtDate(h.current.end)}`, icon: '🌸', cls: 'heat', status: 'идёт', act: 'go', route: 'heat', pet });
    const p = h.next;
    if (p && p.start <= to) {
      const n = diffDays(today(), p.start);
      ev.push({ date: n < 0 ? today() : p.start, kind: 'heat', title: n < 0 ? 'Течка задерживается' : 'Ожидается течка', sub: `прогноз: ${fmtDate(p.start)} – ${fmtDate(p.end)}`, icon: '🌸', cls: 'heat', status: n < 0 ? `ждали ${nDays(-n)} назад` : relDays(p.start), act: 'go', route: 'heat', pet, predicted: true });
    }
  }
  list('meds', pet.id).forEach(m => {
    if (m.end && m.end >= today() && m.end <= to && medActive(m)) ev.push({ date: m.end, kind: 'med', title: `Конец курса: ${m.name}`, sub: [m.dose, m.schedule].filter(Boolean).join(' · '), icon: '💊', cls: 'info', status: relDays(m.end), act: 'editMed', id: m.id, pet });
  });
  return ev.filter(e => e.date >= from || e.overdue).sort((a, b) => (a.date < b.date ? -1 : 1));
}

export function allEvents(opts) {
  return state.pets.flatMap(p => petEvents(p, opts));
}
