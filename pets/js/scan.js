// Распознавание фото документов.
// 1) Умный режим — Claude (если в настройках указан API-ключ): понимает рукописные ветпаспорта,
//    бланки анализов, упаковки лекарств и кормов и возвращает структурированные данные.
// 2) Офлайн-режим — Tesseract OCR прямо в браузере + разбор текста правилами.
import {
  VACCINE_NAMES, DEWORM_NAMES, FLEA_NAMES, FEED_BRANDS, LAB_PARAMS, ALLERGEN_STEMS, REC_KINDS,
  aliasIndex, findLabParam,
} from './data.js';

const TESSERACT_URL = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js';
const SDK_URL = 'https://cdn.jsdelivr.net/npm/@anthropic-ai/sdk@1.2.0/+esm';

// ---------- изображения ----------
export function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Не удалось открыть изображение'));
    img.src = url;
  });
}

export function resizeToCanvas(img, max) {
  const k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
  const c = document.createElement('canvas');
  c.width = Math.round(img.naturalWidth * k);
  c.height = Math.round(img.naturalHeight * k);
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  return c;
}

export const canvasToBlob = (c, q = 0.82) => new Promise(r => c.toBlob(r, 'image/jpeg', q));

export async function prepareImage(file) {
  const img = await loadImage(file);
  const canvas = resizeToCanvas(img, 1600);
  const blob = await canvasToBlob(canvas);
  const thumbCanvas = resizeToCanvas(img, 480);
  const thumb = await canvasToBlob(thumbCanvas, 0.75);
  return { img, canvas, blob, thumb };
}

function ocrCanvas(img) {
  const c = resizeToCanvas(img, 2200);
  const ctx = c.getContext('2d');
  const d = ctx.getImageData(0, 0, c.width, c.height);
  const p = d.data;
  for (let i = 0; i < p.length; i += 4) {
    let g = 0.299 * p[i] + 0.587 * p[i + 1] + 0.114 * p[i + 2];
    g = Math.max(0, Math.min(255, (g - 128) * 1.45 + 140)); // контраст
    p[i] = p[i + 1] = p[i + 2] = g;
  }
  ctx.putImageData(d, 0, 0);
  return c;
}

const b64 = blob => new Promise(res => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1]); r.readAsDataURL(blob); });

// ---------- даты ----------
const MONTHS = ['янв', 'фев', 'мар', 'апр', 'ма', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
const pad = n => String(n).padStart(2, '0');
function mkDate(d, m, y) {
  d = +d; m = +m; y = +y;
  if (y < 100) y += 2000;
  if (m < 1 || m > 12 || d < 1 || d > 31 || y < 1995 || y > 2045) return null;
  return `${y}-${pad(m)}-${pad(d)}`;
}
export function findDates(line) {
  const out = [];
  const s = line;
  let m;
  const re1 = /(\d{1,2})\s?[.\/\-,]\s?(\d{1,2})\s?[.\/\-,]\s?(\d{4}|\d{2})(?!\d)/g;
  while ((m = re1.exec(s))) { const d = mkDate(m[1], m[2], m[3]); if (d) out.push({ d, i: m.index }); }
  const re2 = /(\d{4})-(\d{2})-(\d{2})/g;
  while ((m = re2.exec(s))) { const d = mkDate(m[3], m[2], m[1]); if (d) out.push({ d, i: m.index }); }
  const re3 = /(\d{1,2})\s+([а-яё]{3,9})\.?\s+(\d{4})/gi;
  while ((m = re3.exec(s))) {
    const w = m[2].toLowerCase();
    const mi = MONTHS.findIndex(x => w.startsWith(x));
    if (mi >= 0) { const d = mkDate(m[1], mi + 1, m[3]); if (d) out.push({ d, i: m.index }); }
  }
  return out.sort((a, b) => a.i - b.i).map(x => x.d);
}
const addDays = (iso, n) => { const t = new Date(iso + 'T12:00:00'); t.setDate(t.getDate() + n); return t.toISOString().slice(0, 10); };

// ---------- разбор текста правилами ----------
const norm = s => s.toLowerCase().replace(/ё/g, 'е');

const GENERIC = ['бешенств', 'rabies', 'lepto', 'лепто', 'kc', 'клещ', 'блох', 'глист', 'дегельминт'];
function keywordHit(line, names) {
  const l = norm(line);
  let best = null, generic = null;
  for (const n of names) {
    const nn = norm(n);
    const i = aliasIndex(l, nn);
    if (i < 0) continue;
    if (GENERIC.includes(nn)) { if (!generic || i < generic.i) generic = { i, n, generic: true }; }
    else if (!best || i < best.i) best = { i, n };
  }
  return best || generic;
}

function cleanName(s) {
  return s.replace(/\d{1,2}[.\/\-]\d{1,2}[.\/\-]\d{2,4}.*/, '')
    .replace(/\d{1,2}\s+[а-яё]{3,9}\.?\s+\d{4}.*/i, '')
    .replace(/\s(?:сер(?:ия)?|lot|batch|№|до|от)(?=[\s.:№]|$).*$/i, '').replace(/[|_~«»"“”]+/g, ' ').replace(/\s+/g, ' ').replace(/[\s,.;:\-]+$/, '').trim().slice(0, 48);
}

function parseVaccines(lines) {
  const out = [];
  lines.forEach((line, idx) => {
    let kind = 'vaccine';
    let hit = keywordHit(line, VACCINE_NAMES);
    if (!hit) { hit = keywordHit(line, DEWORM_NAMES); if (hit) kind = 'deworm'; }
    if (!hit) { hit = keywordHit(line, FLEA_NAMES); if (hit) kind = 'flea'; }
    if (!hit) return;
    let dates = findDates(line);
    if (hit.generic && !dates.length) return;
    if (!dates.length && lines[idx + 1]) dates = findDates(lines[idx + 1]);
    if (!dates.length && lines[idx - 1]) dates = findDates(lines[idx - 1]);
    const name = cleanName(line.slice(hit.i)) || hit.n;
    const date = dates[0] || '';
    let next = dates.find(d => d > date) || '';
    if (!next && date) next = addDays(date, REC_KINDS[kind].defaultNextDays);
    const batch = (line.match(/(?:сер(?:ия)?|lot|batch|№)\.?\s*([A-Za-zА-Яа-я0-9\-]{3,})/i) || [])[1] || '';
    out.push({ kind, name, date, next, clinic: '', batch });
  });
  const seen = new Set();
  return out.filter(v => { const k = norm(v.name) + v.date; if (seen.has(k)) return false; seen.add(k); return true; });
}

const NUM = /-?\d+(?:[.,]\d+)?/g;
const toNum = s => (s == null || s === '' ? null : parseFloat(String(s).replace(',', '.')));

function parseLabLine(line) {
  const l = norm(line);
  let best = null;
  for (const p of LAB_PARAMS) {
    for (const a of p.aliases) {
      const i = aliasIndex(l, a);
      if (i >= 0 && (!best || i < best.i)) best = { p, i, len: a.trim().length };
    }
  }
  if (!best) return null;
  let rest = line.slice(best.i + best.len)
    .replace(/[x×х*]\s*10\s*[\^]?\s*[0-9¹²⁹]+\s*(\/\s*[лl])?/gi, ' ')
    .replace(/10\s*\^\s*\d+/g, ' ')
    .replace(/(ммоль|мкмоль|ед|г|мм)\s*\/\s*(л|ч)/gi, ' ');
  let min = null, max = null;
  const r = /(\d+(?:[.,]\d+)?)\s*[-–—]\s*(\d+(?:[.,]\d+)?)/.exec(rest);
  if (r) { min = toNum(r[1]); max = toNum(r[2]); rest = rest.slice(0, r.index) + ' ' + rest.slice(r.index + r[0].length); }
  const nums = rest.match(NUM);
  if (!nums) return null;
  let value = toNum(nums[0]);
  if (value == null || isNaN(value)) return null;
  // OCR часто теряет запятую: «5,1» → «51». Значение НЕ меняем молча (высокие цифры бывают и настоящими),
  // а помечаем как подозрительное — пользователь проверит его в окне подтверждения.
  const lo = min ?? Math.min(best.p.ref.dog[0], best.p.ref.cat[0]);
  const hi = max ?? Math.max(best.p.ref.dog[1], best.p.ref.cat[1]);
  let suggest = '';
  if (!/[.,]/.test(nums[0]) && hi > 0 && value > hi * 4) {
    for (const k of [10, 100]) {
      const v = value / k;
      if (v >= lo * 0.5 && v <= hi * 1.5) { suggest = String(+v.toFixed(3)); break; }
    }
  }
  return { name: best.p.name, value: String(value), unit: best.p.unit, min: min ?? '', max: max ?? '', ...(suggest ? { suggest } : {}) };
}

function parseTests(lines, text) {
  const items = [];
  const seen = new Set();
  for (const line of lines) {
    const it = parseLabLine(line);
    if (it && !seen.has(it.name)) { seen.add(it.name); items.push(it); }
  }
  if (!items.length) return [];
  const t = norm(text);
  let type = 'Другое';
  const bio = items.some(i => ['АЛТ', 'АСТ', 'Креатинин', 'Мочевина', 'Глюкоза', 'Общий белок'].includes(i.name));
  const cbc = items.some(i => ['Эритроциты', 'Лейкоциты', 'Гемоглобин', 'Тромбоциты'].includes(i.name));
  if (bio && !cbc) type = 'Биохимия крови';
  else if (cbc && !bio) type = 'Общий анализ крови';
  else if (t.includes('биохим')) type = 'Биохимия крови';
  else if (t.includes('общий анализ') || t.includes('клинический')) type = 'Общий анализ крови';
  const date = findDates(text)[0] || '';
  const lab = (text.match(/(?:лаборатори[яи]|клиника|vet|вет)[^\n]{0,40}/i) || [''])[0].trim();
  return [{ type, date, lab, items, conclusion: '' }];
}

function parseFeed(lines, text) {
  const hit = lines.map(l => ({ l, h: keywordHit(l, FEED_BRANDS) })).find(x => x.h);
  const t = norm(text);
  let ingredients = '';
  const m = /состав[:\s]+([\s\S]{10,600}?)(?:пищевая|питательн|анализ|гарантир|витамин[ыа]?\s*\(|энергетич|калорийн|$)/i.exec(text);
  if (m) ingredients = m[1].replace(/\s+/g, ' ').trim();
  if (!hit && !ingredients) return [];
  let type = 'Сухой';
  if (/влажн|консерв|пауч|паштет|wet|желе|соус/.test(t)) type = 'Влажный';
  if (/лакомств|treat|снек/.test(t)) type = 'Лакомство';
  if (/лечебн|диет|veterinary|renal|gastro|hypoallergenic|гипоаллерген/.test(t)) type = 'Лечебный';
  const name = hit ? cleanName(hit.l) : cleanName(lines.find(l => l.length > 4) || 'Корм');
  return [{ name, brand: hit ? hit.h.n : '', type, ingredients }];
}

function parseMed(lines, text) {
  const title = lines.find(l => /[A-Za-zА-Яа-я]{4,}/.test(l) && l.length < 50) || '';
  if (!title) return [];
  const dose = (text.match(/\d+[.,]?\d*\s*(?:мг|мл|г|mg|ml|мкг|ме)\b[^\n]{0,24}/i) || [''])[0].trim();
  const schedule = (text.match(/(\d+\s*(?:раз[а]?|р\.)\s*(?:в|\/)\s*(?:день|сут[кои]*|недел[юи]))/i) || [''])[0];
  return [{ name: cleanName(title), dose, schedule, start: '', end: '', reason: '' }];
}

function parseAllergies(lines) {
  const out = [];
  for (const line of lines) {
    const l = norm(line);
    if (!/(положит|выявлен|высок|класс\s*[2-6]|class\s*[2-6]|\+\+|реакци)/.test(l)) continue;
    for (const [allergen, stems] of Object.entries(ALLERGEN_STEMS)) {
      if (stems.some(s => l.includes(s)) && !out.find(o => o.allergen === allergen)) {
        out.push({ allergen: allergen[0].toUpperCase() + allergen.slice(1), category: 'Пищевая', reaction: '', severity: 'medium' });
      }
    }
  }
  return out;
}

function detectType(text, lines) {
  const t = norm(text);
  const score = { vaccines: 0, tests: 0, feeds: 0, meds: 0, allergies: 0 };
  lines.forEach(l => {
    if (keywordHit(l, VACCINE_NAMES) || keywordHit(l, DEWORM_NAMES) || keywordHit(l, FLEA_NAMES)) score.vaccines += 2;
    if (parseLabLine(l)) score.tests += 1.5;
    if (keywordHit(l, FEED_BRANDS)) score.feeds += 2;
  });
  if (/вакцин|прививк|ветеринарный паспорт|vaccination|дегельминт/.test(t)) score.vaccines += 3;
  if (/референс|норма|результат|анализ/.test(t)) score.tests += 2;
  if (/состав|ккал|протеин|сырой жир|корм/.test(t)) score.feeds += 3;
  if (/таблет|инструкц|дозиров|способ применения|противопоказ/.test(t)) score.meds += 3;
  if (/аллерг|ige/.test(t)) score.allergies += 4;
  const [best, val] = Object.entries(score).sort((a, b) => b[1] - a[1])[0];
  return val > 0 ? best : 'other';
}

export function parseText(text, kind = 'auto') {
  const lines = text.split(/\n+/).map(l => l.trim()).filter(Boolean);
  const docType = kind === 'auto' ? detectType(text, lines) : kind;
  const r = { docType, title: '', date: findDates(text)[0] || '', vaccines: [], tests: [], meds: [], feeds: [], allergies: [], text, source: 'ocr' };
  if (docType === 'vaccines' || kind === 'auto') r.vaccines = parseVaccines(lines);
  if (docType === 'tests' || docType === 'allergies' || kind === 'auto') r.tests = parseTests(lines, text);
  if (docType === 'allergies') { r.allergies = parseAllergies(lines); r.tests.forEach(t => (t.type = 'Аллергопанель')); }
  if (docType === 'feeds') r.feeds = parseFeed(lines, text);
  if (docType === 'meds') r.meds = parseMed(lines, text);
  if (kind === 'auto' && docType !== 'tests' && r.tests.length && r.tests[0].items.length < 3) r.tests = [];
  if (kind === 'auto' && docType !== 'vaccines' && r.vaccines.length < 1) r.vaccines = [];
  r.title = { vaccines: 'Ветпаспорт', tests: r.tests[0]?.type || 'Анализы', feeds: r.feeds[0]?.name || 'Корм', meds: r.meds[0]?.name || 'Лекарство', allergies: 'Аллергопанель', other: 'Документ' }[docType];
  return r;
}

// ---------- OCR ----------
let tessWorker = null;
function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (window.Tesseract) return resolve();
    document.querySelector(`script[src="${src}"]`)?.remove(); // прошлая попытка могла не удаться
    const s = document.createElement('script');
    s.src = src; s.onload = resolve;
    s.onerror = () => { s.remove(); reject(new Error('Нет интернета для загрузки модуля распознавания (нужен один раз)')); };
    document.head.appendChild(s);
  });
}
export async function ocr(img, onProgress) {
  await loadScript(TESSERACT_URL);
  if (!tessWorker) {
    onProgress?.('Загружаю словари (один раз)…', 0.05);
    tessWorker = await window.Tesseract.createWorker('rus+eng', 1, {
      logger: m => {
        if (m.status === 'recognizing text') onProgress?.('Читаю текст…', 0.3 + m.progress * 0.7);
        else if (m.status && m.progress != null) onProgress?.('Подготовка распознавания…', 0.05 + m.progress * 0.25);
      },
    });
  }
  onProgress?.('Читаю текст…', 0.3);
  const { data } = await tessWorker.recognize(ocrCanvas(img));
  return data.text || '';
}

// ---------- Claude ----------
const S = { type: 'string' };
const obj = props => ({ type: 'object', additionalProperties: false, required: Object.keys(props), properties: props });
const SCHEMA = obj({
  docType: { type: 'string', enum: ['vaccines', 'tests', 'meds', 'feeds', 'allergies', 'other'] },
  title: S,
  date: S,
  summary: S,
  vaccines: { type: 'array', items: obj({ kind: { type: 'string', enum: ['vaccine', 'deworm', 'flea', 'other'] }, name: S, date: S, next: S, clinic: S, batch: S }) },
  tests: { type: 'array', items: obj({ type: S, date: S, lab: S, conclusion: S, items: { type: 'array', items: obj({ name: S, value: S, unit: S, min: S, max: S }) } }) },
  meds: { type: 'array', items: obj({ name: S, dose: S, schedule: S, start: S, end: S, reason: S }) },
  feeds: { type: 'array', items: obj({ name: S, brand: S, type: S, ingredients: S }) },
  allergies: { type: 'array', items: obj({ allergen: S, category: S, reaction: S, severity: { type: 'string', enum: ['mild', 'medium', 'severe'] } }) },
  text: S,
});

const SYSTEM = `Ты — помощник ветеринарной картотеки. На фото — документ о питомце: страница ветпаспорта с прививками и обработками (наклейки вакцин, печати, рукописные даты), бланк анализов, упаковка или инструкция лекарства, этикетка корма или результаты аллергопанели.
Извлеки данные строго по схеме. Правила:
- Все даты в формате YYYY-MM-DD; если дату не видно — пустая строка. Не выдумывай данные, которых нет на фото.
- vaccines: каждая прививка/обработка отдельным элементом. kind: vaccine — вакцина, deworm — от глистов, flea — от блох/клещей. name — название препарата (например «Нобивак DHPPi+L»). next — дата следующей, если указана; иначе пусто.
- tests: каждый показатель анализа — элемент items: name (по-русски, например «АЛТ», «Гемоглобин»), value (число как строка, точка как разделитель), unit, min и max — референс с бланка, если есть.
- tests.type — один из: Общий анализ крови, Биохимия крови, Анализ мочи, Аллергопанель, Анализ кала, Гормоны, Цитология, ПЦР / инфекции, Другое. conclusion — заключение врача, если есть.
- feeds: name, brand, type (Сухой, Влажный, Натуральный, Лакомство, Добавка, Лечебный), ingredients — состав.
- meds: dose — дозировка, schedule — схема приёма.
- allergies: только подтверждённые/положительные аллергены (например из аллергопанели).
- summary — 1–2 предложения по-русски, что это за документ и что важно (например отклонения в анализах).
- text — основной распознанный текст документа (до 1500 символов).
Пустые массивы для разделов, которых нет на фото.`;

export async function aiExtract(blob, kind, pet, settings, onProgress) {
  onProgress?.('Отправляю фото умному помощнику…', 0.2);
  const mod = await import(SDK_URL);
  const Anthropic = mod.default || mod.Anthropic;
  const E = {
    Auth: mod.AuthenticationError || Anthropic.AuthenticationError,
    Perm: mod.PermissionDeniedError || Anthropic.PermissionDeniedError,
    Rate: mod.RateLimitError || Anthropic.RateLimitError,
    Bad: mod.BadRequestError || Anthropic.BadRequestError,
    Conn: mod.APIConnectionError || Anthropic.APIConnectionError,
  };
  const client = new Anthropic({ apiKey: settings.apiKey, dangerouslyAllowBrowser: true, maxRetries: 2 });
  const model = settings.model || 'claude-opus-5-5';
  const hint = kind && kind !== 'auto' ? `Пользователь указал тип документа: ${kind}.` : 'Тип документа определи сам.';
  const petInfo = pet ? `Питомец: ${pet.species === 'cat' ? 'кошка' : pet.species === 'dog' ? 'собака' : 'животное'}, кличка ${pet.name}${pet.breed ? ', порода ' + pet.breed : ''}.` : '';
  const data = await b64(blob);
  const base = {
    model,
    max_tokens: 16000,
    system: SYSTEM,
    messages: [{
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data } },
        { type: 'text', text: `${hint} ${petInfo} Сегодня ${new Date().toISOString().slice(0, 10)}. Извлеки данные с фото.` },
      ],
    }],
  };
  // Резервная модель на стороне сервера, если основная откажет (не поддерживается у Haiku)
  const withFallback = !model.startsWith('claude-haiku');
  const req = (fmt) => client.beta.messages.create({
    ...base,
    ...(withFallback ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' } : {}),
    output_config: { effort: 'medium', ...(fmt ? { format: { type: 'json_schema', schema: SCHEMA } } : {}) },
  });

  onProgress?.('Анализирую документ…', 0.45);
  let resp;
  try {
    try {
      resp = await req(true);
    } catch (e) {
      if (E.Bad && e instanceof E.Bad && /format|schema|output_config/i.test(e.message)) resp = await req(false);
      else throw e;
    }
  } catch (e) {
    if (E.Auth && e instanceof E.Auth) throw new Error('Неверный API-ключ Claude — проверьте его в настройках');
    if (E.Perm && e instanceof E.Perm) throw new Error('У ключа нет доступа к выбранной модели');
    if (E.Rate && e instanceof E.Rate) throw new Error('Слишком много запросов — попробуйте через минуту');
    if (E.Bad && e instanceof E.Bad) throw new Error('Запрос отклонён: ' + (e.message || '').slice(0, 160));
    if (E.Conn && e instanceof E.Conn) throw new Error('Нет связи с сервером Claude');
    throw e;
  }
  if (resp.stop_reason === 'refusal') throw new Error('Помощник не смог обработать это изображение');
  const txt = resp.content.filter(b => b.type === 'text').map(b => b.text).join('');
  const json = txt.slice(txt.indexOf('{'), txt.lastIndexOf('}') + 1);
  const r = JSON.parse(json);
  onProgress?.('Готово', 1);
  r.source = 'ai';
  ['vaccines', 'tests', 'meds', 'feeds', 'allergies'].forEach(k => (r[k] = Array.isArray(r[k]) ? r[k] : []));
  r.tests.forEach(t => (t.items || []).forEach(i => {
    const p = findLabParam(i.name);
    if (p && !i.unit) i.unit = p.unit;
  }));
  return r;
}

export async function processPhoto(prepared, kind, pet, settings, onProgress) {
  if (settings.apiKey) {
    try {
      return await aiExtract(prepared.blob, kind, pet, settings, onProgress);
    } catch (e) {
      console.warn(e);
      onProgress?.('Умный режим недоступен: ' + e.message + '. Распознаю офлайн…', 0.1);
      let text;
      try { text = await ocr(prepared.img, onProgress); }
      catch (e2) { throw new Error(`${e.message}. Офлайн-распознавание тоже не удалось: ${e2.message}`); }
      const r = parseText(text, kind);
      r.warning = e.message;
      return r;
    }
  }
  const text = await ocr(prepared.img, onProgress);
  return parseText(text, kind);
}
