const CACHET_EMOJIS_URL = 'https://cachet.dunkirk.sh/emojis';
const STANDARD_EMOJIS_URL = 'https://cdn.jsdelivr.net/npm/emoji-datasource@15.1.2/emoji.json';
const STANDARD_IMG_BASE = 'https://cdn.jsdelivr.net/npm/emoji-datasource-apple@15.1.2/img/apple/64/';
const REFRESH_MS = 12 * 60 * 60 * 1000;

let emojis = [];
let byName = new Map();
let loadedAt = 0;
let loading = null;

async function fetchJson(url) {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`${url} returned ${resp.status}`);
  return resp.json();
}

async function refresh() {
  const [custom, standard] = await Promise.all([
    fetchJson(CACHET_EMOJIS_URL),
    fetchJson(STANDARD_EMOJIS_URL),
  ]);

  const next = new Map();
  for (const e of standard) {
    for (const name of e.short_names) {
      next.set(name, { name, imageUrl: STANDARD_IMG_BASE + e.image, standard: true });
    }
  }
  for (const e of custom) {
    if (!next.has(e.name)) next.set(e.name, { name: e.name, imageUrl: e.imageUrl, standard: false });
  }

  byName = next;
  emojis = [...next.values()].sort((a, b) => a.name.localeCompare(b.name));
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
  const exact = byName.get(q);
  const standardPrefix = [];
  const customPrefix = [];
  const contains = [];
  for (const e of emojis) {
    if (e === exact) continue;
    if (e.name.startsWith(q)) (e.standard ? standardPrefix : customPrefix).push(e);
    else if (contains.length < limit && e.name.includes(q)) contains.push(e);
  }
  return [exact, ...standardPrefix, ...customPrefix, ...contains]
    .filter(Boolean)
    .slice(0, limit)
    .map(({ name, imageUrl }) => ({ name, imageUrl }));
}

async function lookup(names) {
  await ensureLoaded();
  const found = {};
  for (const name of names) {
    const e = byName.get(name.toLowerCase());
    if (e) found[name] = e.imageUrl;
  }
  return found;
}

module.exports = { search, lookup, ensureLoaded };
