<script>
  import Landing from './pages/Landing.svelte';
  import Home from './pages/Home.svelte';
  import MemberHome from './pages/MemberHome.svelte';
  import Message from './pages/Message.svelte';
  import Access from './pages/Access.svelte';
  import Settings from './pages/Settings.svelte';
  import { loadProfile } from './lib/session.js';

  const routes = {
    '/': Landing,
    '/message': Message,
    '/access': Access,
    '/settings': Settings,
  };

  const path = location.pathname.replace(/\/+$/, '') || '/';
  const Page = routes[path] || Landing;
</script>

{#if path === '/home'}
  {#await loadProfile() then profile}
    {#if profile?.role === 'owner'}
      <Home />
    {:else}
      <MemberHome />
    {/if}
  {/await}
{:else}
  <Page />
{/if}
