<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup lang="ts">
import { RouterLink, RouterView } from 'vue-router'
import SyncStatus from '@/ui/components/SyncStatus.vue'
import ThemeSwitch from '@/ui/components/ThemeSwitch.vue'
import UpdatePrompt from './UpdatePrompt.vue'
</script>

<template>
  <a class="skip-link" href="#main">Zum Inhalt springen</a>
  <header class="app-header">
    <RouterLink to="/" class="brand">Tafelrunde</RouterLink>
    <div class="app-header__tools">
      <SyncStatus state="local" />
      <ThemeSwitch />
    </div>
  </header>
  <main id="main" tabindex="-1">
    <RouterView />
  </main>
  <UpdatePrompt />
</template>

<style scoped>
.app-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  padding: var(--space-3) var(--space-4);
  background: var(--surface);
  border-bottom: 1px solid var(--border);
}
.app-header__tools {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}
.brand {
  font-weight: 700;
  font-size: var(--font-size-lg);
  color: var(--primary);
  text-decoration: none;
}
main {
  max-width: 48rem;
  margin: 0 auto;
  padding: var(--space-4);
}
main:focus {
  outline: none;
}
</style>
