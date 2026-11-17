import { peekPendingJoin } from '~~/utils/pending-join';

export default defineNuxtRouteMiddleware((to) => {
  // /join carries a share token and must resolve on its own page, signed in
  // or not — the redirects below would swallow the token.
  if (to.path === '/join') return;

  const user = useSupabaseUser();
  const protectedAppRoutes = ['/inventory', 'buy', '/settings', '/recipe'];
  if (protectedAppRoutes?.includes(to.path) && !user.value) {
    return navigateTo('/');
  }
  const navigateToAppRoutes = ['/', '/login', '/confirm'];
  if (navigateToAppRoutes?.includes(to.path) && user.value) {
    // Signed in from a scanned share link: finish joining before anything else.
    const token = peekPendingJoin();
    return navigateTo(token ? { path: '/join', query: { t: token } } : '/inventory');
  }
});
