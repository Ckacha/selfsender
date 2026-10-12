const fs = require('fs');
const path = require('path');

const LOGINS_FILE = path.join(__dirname, '..', 'team-logins.json');

function load() {
  try {
    const data = JSON.parse(fs.readFileSync(LOGINS_FILE, 'utf8'));
    return data && typeof data === 'object' && !Array.isArray(data) ? data : {};
  } catch (err) {
    return {};
  }
}

function save() {
  fs.writeFileSync(LOGINS_FILE, JSON.stringify(logins, null, 2));
}

let logins = load();

function record(entries) {
  if (!entries.length) return;
  const now = new Date().toISOString();
  for (const entry of entries) logins[entry] = now;
  save();
}

function get(entry) {
  return logins[entry] || null;
}

function remove(entry) {
  if (!(entry in logins)) return;
  delete logins[entry];
  save();
}

module.exports = { record, get, remove };
