import type { RouteComponent, RouteRecordRaw } from 'vue-router'

/** Share one reader component while keeping each view addressable by its own URL. */
export function createReaderRoutes (page: RouteComponent): RouteRecordRaw[] {
  return [
    { path: '/', name: 'all', component: page, props: { view: 'all' } },
    {
      path: '/categories/:categoryId',
      name: 'category',
      component: page,
      props: route => ({ view: 'category', id: route.params.categoryId }),
    },
    {
      path: '/feeds/:feedId',
      name: 'feed',
      component: page,
      props: route => ({ view: 'feed', id: route.params.feedId }),
    },
    { path: '/:pathMatch(.*)*', name: 'not-found', component: page, props: { view: 'not-found' } },
  ]
}
