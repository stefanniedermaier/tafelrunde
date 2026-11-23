// SPDX-License-Identifier: AGPL-3.0-or-later
import { createRouter, createWebHashHistory } from 'vue-router'
import HomeView from './views/HomeView.vue'

/**
 * Hash-Modus: GitHub Pages kennt keinen SPA-Fallback, und Einladungsdaten im Fragment
 * erreichen nie einen Server.
 */
export const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', name: 'home', component: HomeView },
    {
      path: '/komponenten',
      name: 'components',
      component: () => import('./views/ComponentsView.vue'),
    },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
})
