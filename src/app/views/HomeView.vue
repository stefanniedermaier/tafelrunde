<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup lang="ts">
import { RouterLink } from 'vue-router'
import AppCard from '@/ui/components/AppCard.vue'
</script>

<template>
  <h1>Willkommen bei Tafelrunde</h1>
  <AppCard>
    <p>
      Rezepte, Wochenplan und geteilte Einkaufslisten – Ende-zu-Ende verschlüsselt, ohne Server.
      Deine Daten liegen nur auf deinen Geräten und in deinem eigenen Speicher.
    </p>
    <p>Die Einkaufsliste folgt in Phase 1.</p>
    <p><RouterLink to="/komponenten">Basis-Komponenten ansehen</RouterLink></p>
  </AppCard>
</template>
