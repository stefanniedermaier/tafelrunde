// SPDX-License-Identifier: AGPL-3.0-or-later
import { createApp } from 'vue'
import App from './App.vue'
import { router } from './router'
import { isFramed } from './frame-guard'
import { applyStoredTheme } from '@/ui/theme'
import '@/ui/tokens.css'
import '@/ui/base.css'

if (isFramed(window)) {
  document.documentElement.dataset.framed = 'true'
  document.body.textContent = 'Tafelrunde kann nicht in einem fremden Rahmen angezeigt werden.'
} else {
  applyStoredTheme()
  createApp(App).use(router).mount('#app')
}
