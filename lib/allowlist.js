const fs = require('fs');
const path = require('path');
const { isSlackUserId } = require('./slack');

const ALLOWLIST_FILE = path.join(__dirname, '..', 'team-allowlist.json');

function load() {
  try {
    const data = JSON.parse(fs.readFileSync(ALLOWLIST_FILE, 'utf8'));
    return Array.isArray(data) ? data : [];
  } catch (err) {
    return [];
  }
}

function save() {
  fs.writeFileSync(ALLOWLIST_FILE, JSON.stringify(ids, null, 2));
}

function isEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function normalize(value) {
  const trimmed = String(value || '').trim();
  return isEmail(trimmed) ? trimmed.toLowerCase() : trimmed.toUpperCase();
}

let ids = [...new Set(load().map(normalize))];

function list() {
  return [...ids];
}

function add(value) {
  const entry = normalize(value);
  if (!isSlackUserId(entry) && !isEmail(entry)) {
    throw new Error(`"${value}" isn't an email or a Slack user ID (e.g. U0123ABCD).`);
  }
  if (!ids.includes(entry)) {
    ids.push(entry);
    save();
  }
  return list();
}

function remove(value) {
  const entry = normalize(value);
  ids = ids.filter((id) => id !== entry);
  save();
  return list();
}

function isInvited(...candidates) {
  return candidates.some((c) => c && ids.includes(normalize(c)));
}

module.exports = { list, add, remove, isInvited };
