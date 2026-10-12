<script>
  import Landing from './pages/Landing.svelte';
  import Home from './pages/Home.svelte';
  import Message from './pages/Message.svelte';
  import Access from './pages/Access.svelte';
  import Settings from './pages/Settings.svelte';
  import Team from './pages/Team.svelte';

  const routes = {
    '/': Landing,
    '/home': Home,
    '/message': Message,
    '/access': Access,
    '/settings': Settings,
    '/team': Team,
  };

  const path = location.pathname.replace(/\/+$/, '') || '/';
  const Page = routes[path] || Landing;
</script>

<Page />
