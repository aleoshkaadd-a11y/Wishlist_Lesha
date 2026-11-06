// Определяет, где запущено приложение.
// - Обычный браузер / PWA: IndexedDB, OCR и (по желанию) API-ключ Claude.
// - Страница-артефакт claude.ai: личное хранилище страницы (db), файлы (assets),
//   встроенный Claude для распознавания (sample) и сохранение файлов (downloads).
export const env = {
  artifact: false,
  db: null,
  user: null,
  uid: null,
  assets: null,
  sample: null,
  sampleImages: false,
  downloads: null,
  ocrBase: (window.LAPKI && window.LAPKI.ocrBase) || '',
  ocrWorker: (window.LAPKI && window.LAPKI.ocrWorker) || 'worker.min.js',
};

export async function initEnv() {
  const c = window.claude;
  if (!c || typeof c.use !== 'function') return env;
  env.artifact = true;
  const get = name => c.use(name).catch(() => null);
  const [db, user, assets, sample, downloads] = await Promise.all(['db', 'user', 'assets', 'sample', 'downloads'].map(get));
  Object.assign(env, { db, user, assets, sample, downloads });
  if (user && db) env.uid = await user.id().catch(() => null);
  if (sample) {
    const lim = await sample.limits().catch(() => null);
    env.sampleImages = !!lim?.images;
  }
  return env;
}
