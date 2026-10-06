const CACHET_EMOJIS_URL = 'https://cachet.dunkirk.sh/emojis';
const REFRESH_MS = 12 * 60 * 60 * 1000;

let emojis = [];
let loadedAt = 0;
let loading = null;

async function refresh() {
  const resp = await fetch(CACHET_EMOJIS_URL);
  if (!resp.ok) throw new Error(`Cachet returned ${resp.status}`);
  const data = await resp.json();
  emojis = data
    .map((e) => ({ name: e.name, imageUrl: e.imageUrl }))
    .sort((a, b) => a.name.localeCompare(b.name));
  loadedAt = Date.now();
}

async function ensureLoaded() {
  if (emojis.length && Date.now() - loadedAt < REFRESH_MS) return;
  if (!loading) {
    loading = refresh().finally(() => { loading = null; });
  }
  if (!emojis.length) await loading;
}

async function search(query, limit = 20) {
  await ensureLoaded();
  const q = query.toLowerCase();
  if (!q) return [];
  const prefix = [];
  const contains = [];
  for (const e of emojis) {
    if (e.name.startsWith(q)) prefix.push(e);
    else if (e.name.includes(q)) contains.push(e);
    if (prefix.length >= limit) break;
  }
  return prefix.concat(contains).slice(0, limit);
}

module.exports = { search, ensureLoaded };
