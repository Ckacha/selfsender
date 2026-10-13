let profile;

export function loadProfile() {
  if (!profile) {
    profile = fetch('/api/profile')
      .then((res) => (res.ok ? res.json() : null))
      .catch(() => null);
  }
  return profile;
}
