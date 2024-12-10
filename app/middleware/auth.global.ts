export default defineNuxtRouteMiddleware((to, from) => {
  const user = useSupabaseUser();
  const protectedAppRoutes = ['/inventory', 'buy', '/settings', '/recipe', 'recipe/ai'];
  if (protectedAppRoutes.includes(to.path) && !user.value) {
    return navigateTo('/');
  }
  const navigateToAppRoutes = ['/', '/login', '/confirm'];
  if (navigateToAppRoutes.includes(to.path) && user.value) {
    return navigateTo('/inventory');
  }
});
