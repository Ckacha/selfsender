<script>
  import { onMount } from 'svelte';
  import { loadProfile } from './session.js';

  let { active = '' } = $props();

  const OWNER_LINKS = [
    { href: '/home', label: 'Home' },
    { href: '/message', label: 'Message' },
    { href: '/access', label: 'Access' },
    { href: '/settings', label: 'Settings' },
  ];

  const GREETINGS = ['hiiii', 'hello', 'whats up', 'whats cooking', 'i know where you are'];
  const greeting = GREETINGS[Math.floor(Math.random() * GREETINGS.length)];

  let profile = $state(null);

  const links = $derived(profile?.role === 'owner' ? OWNER_LINKS : []);
  const name = $derived(profile?.me?.name || profile?.email?.split('@')[0] || '');

  onMount(async () => {
    profile = await loadProfile();
  });
</script>

<nav class="nav">
  <a class="brand" href="/home">SelfSender</a>
  {#each links as link (link.href)}
    <a href={link.href} class:active={active === link.href}>{link.label}</a>
  {/each}
  <span class="who">
    {#if name}<span class="hi">{greeting} {name}</span>{/if}
    <a href="/logout" class="logout">Log out</a>
  </span>
</nav>

<style>
  .nav { display: flex; align-items: center; gap: 4px; padding-bottom: 12px; margin-bottom: 8px; border-bottom: 1px solid #e3e3e3; flex-wrap: wrap; }
  a { padding: 6px 12px; border-radius: 6px; color: #1a1a1a; text-decoration: none; }
  a:hover { background: #f0f0f0; }
  a.active { background: #1a1a1a; color: #fff; }
  .brand { font-weight: 700; font-size: 1.15rem; padding-left: 0; margin-right: 8px; }
  .brand:hover { background: none; }
  .who { margin-left: auto; display: flex; align-items: center; gap: 4px; }
  .hi { font-weight: 600; }
  .logout { color: #666; font-size: 0.9rem; }
</style>
