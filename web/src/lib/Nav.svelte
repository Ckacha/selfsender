<script>
  let { active } = $props();

  const links = [
    { href: '/home', label: 'Home' },
    { href: '/message', label: 'Message' },
    { href: '/access', label: 'Access' },
    { href: '/settings', label: 'Settings' },
  ];
</script>

<nav class="nav">
  <span class="brand">selfsender</span>
  {#each links as link (link.href)}
    <a href={link.href} class:active={active === link.href}>{link.label}</a>
  {/each}
  <a href="/logout" class="logout">Log out</a>
</nav>

<style>
  .nav { display: flex; align-items: center; gap: 4px; padding-bottom: 12px; margin-bottom: 8px; border-bottom: 1px solid #e3e3e3; flex-wrap: wrap; }
  .brand { font-weight: 700; margin-right: 12px; }
  a { padding: 6px 12px; border-radius: 6px; color: #1a1a1a; text-decoration: none; }
  a:hover { background: #f0f0f0; }
  a.active { background: #1a1a1a; color: #fff; }
  .logout { margin-left: auto; color: #666; font-size: 0.9rem; }
</style>
