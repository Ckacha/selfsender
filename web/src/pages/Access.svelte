<script>
  import { onMount } from 'svelte';
  import Nav from '../lib/Nav.svelte';

  let people = $state([]);
  let newId = $state('');
  let error = $state('');
  let notice = $state('');

  onMount(async () => {
    const res = await fetch('/api/allowlist');
    people = (await res.json()).people || [];
  });

  async function invite() {
    const id = newId.trim();
    error = '';
    notice = '';
    if (!id) return;

    const res = await fetch('/api/allowlist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    const data = await res.json();

    if (!res.ok) {
      error = data.error;
      return;
    }

    newId = '';
    notice = data.notice || '';
    people = data.people || [];
  }

  async function resend(id) {
    error = '';
    notice = '';
    const res = await fetch(`/api/allowlist/${encodeURIComponent(id)}/resend`, { method: 'POST' });
    const data = await res.json();
    if (!res.ok) {
      error = data.error;
      return;
    }
    notice = data.notice || '';
    people = data.people || [];
  }

  async function remove(id) {
    const res = await fetch(`/api/allowlist/${encodeURIComponent(id)}`, { method: 'DELETE' });
    people = (await res.json()).people || [];
  }

  const INVITE_LABELS = { pending: 'Invite sent, no reply yet', accepted: 'Accepted the invite', declined: 'Declined the invite' };

  function loginLabel(person) {
    if (!person.loggedIn) return 'Not logged in yet';
    if (!person.lastLogin) return 'Logged in';
    const when = new Date(person.lastLogin).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
    return `Logged in, last on ${when}`;
  }
</script>

<svelte:head><title>selfsender: access</title></svelte:head>

<div class="page">
  <Nav active="/access" />
  <h1>Access</h1>
  <p class="hint">
    Invite people by email or Slack ID. They log in with Hack Club at
    <code>{location.origin}</code>, and their Hack Club email or linked
    Slack ID has to match an invite. Then they connect their Slack once and
    send as themselves, never the shared bot token, never your pages.
    The bot DMs each new invite on Slack with Accept and Decline buttons, then tells you what they picked.
  </p>

  <div class="row">
    <input
      type="text"
      placeholder="Slack ID or Email, e.g. U01ABCDEF2, whatthehelly@gmail.com"
      bind:value={newId}
      onkeydown={(e) => { if (e.key === 'Enter') invite(); }}
    >
    <button type="button" onclick={invite}>Invite</button>
  </div>
  {#if error}
    <p class="hint error">{error}</p>
  {:else if notice}
    <p class="hint">{notice}</p>
  {/if}

  <h2>People with access</h2>
  <ul class="people">
    {#each people as person (person.id)}
      <li>
        <span class="dot" class:ok={person.loggedIn} class:declined={person.invite === 'declined' && !person.loggedIn}></span>
        <span class="who">
          <strong>{person.id}</strong>
          <span class="hint">{person.invite ? `${INVITE_LABELS[person.invite]} · ` : ''}{loginLabel(person)}</span>
        </span>
        {#if person.invite === 'declined'}
          <button type="button" onclick={() => resend(person.id)}>Send again</button>
        {/if}
        <button type="button" onclick={() => remove(person.id)}>Remove</button>
      </li>
    {:else}
      <li class="empty">Nobody yet.</li>
    {/each}
  </ul>
</div>

<style>
  h2 { margin-top: 28px; }
  .error { color: #c00; }
  .empty { color: #666; }
  .people { list-style: none; padding: 0; }
  .people li { display: flex; align-items: center; gap: 10px; padding: 8px 0; border-bottom: 1px solid #f0f0f0; }
  .dot { width: 10px; height: 10px; border-radius: 50%; background: #ccc; flex: none; }
  .dot.ok { background: #1e8e3e; }
  .dot.declined { background: #d93025; }
  .who { flex: 1; min-width: 0; overflow-wrap: anywhere; }
  .who strong, .who .hint { display: block; margin: 0; }
  li button { margin-top: 0; }
</style>
