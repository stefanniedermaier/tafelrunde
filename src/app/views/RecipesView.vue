<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup lang="ts">
import { computed, onMounted, ref, shallowRef } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import { createRecipe, spaceKind, spaceName } from '@/core'
import AppButton from '@/ui/components/AppButton.vue'
import AppCard from '@/ui/components/AppCard.vue'
import { useRecipes } from '../recipes/recipe-store'
import { workspace } from '../workspace/use-workspace'
import type { Workspace } from '../workspace/workspace'

const router = useRouter()
const { recipes, handles } = useRecipes()
const ws = shallowRef<Workspace>()
onMounted(async () => (ws.value = await workspace()))

const sorted = computed(() =>
  [...recipes.value].sort((a, b) =>
    (a.recipe.meta.title || '').localeCompare(b.recipe.meta.title || '', 'de'),
  ),
)

/** Bereiche, in denen Rezepte liegen können (persönlich und Haushalte). */
const targets = computed(() =>
  handles.value.map((h) => ({
    id: h.record.id,
    name: spaceName(h.doc) || (spaceKind(h.doc) === 'personal' ? 'Persönlich' : 'Bereich'),
  })),
)
const target = ref<string>()

const TEMPLATE = `---
title: Neues Rezept
servings: 4
tags: []
---
Beschreibe hier die Schritte. Zutaten schreibst du so: @Mehl{500%g}.
`

async function create() {
  const id = target.value ?? targets.value[0]?.id
  const h = handles.value.find((x) => x.record.id === id)
  if (!h?.library || !ws.value?.profile) return
  const recipeId = createRecipe(h.library.doc, TEMPLATE, ws.value.profile.personId)
  await router.push({ name: 'recipe-edit', params: { spaceId: h.record.id, recipeId } })
}

const minutes = (m?: number) => (m ? `${m} min` : '')
</script>

<template>
  <h1>Rezepte</h1>
  <form class="new" @submit.prevent="create">
    <div v-if="targets.length > 1" class="field">
      <label for="recipe-target">Speichern in</label>
      <select id="recipe-target" v-model="target">
        <option v-for="t in targets" :key="t.id" :value="t.id">{{ t.name }}</option>
      </select>
    </div>
    <AppButton type="submit" variant="primary" :disabled="!targets.length">Neues Rezept</AppButton>
  </form>

  <p v-if="!sorted.length" class="muted">Noch keine Rezepte.</p>
  <ul class="cards">
    <li v-for="r in sorted" :key="r.key">
      <AppCard>
        <h2>
          <RouterLink :to="{ name: 'recipe', params: { spaceId: r.spaceId, recipeId: r.id } }">
            {{ r.recipe.meta.title || 'Ohne Titel' }}
          </RouterLink>
        </h2>
        <p class="meta">
          <span>{{ r.spaceName }}</span>
          <span v-if="r.recipe.meta.prepMinutes || r.recipe.meta.cookMinutes">
            {{ minutes((r.recipe.meta.prepMinutes ?? 0) + (r.recipe.meta.cookMinutes ?? 0)) }}
          </span>
          <span v-for="tag in r.recipe.meta.tags" :key="tag" class="tag">{{ tag }}</span>
        </p>
      </AppCard>
    </li>
  </ul>
</template>

<style scoped>
.new {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: var(--space-2);
  margin-bottom: var(--space-6);
}
.field {
  display: grid;
  gap: var(--space-1);
}
.field label {
  font-weight: 600;
}
select {
  min-height: var(--touch-target);
  padding: 0 var(--space-3);
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-sm);
  background: var(--surface);
  color: var(--text);
  font: inherit;
}
.cards {
  display: grid;
  gap: var(--space-3);
  margin: 0;
  padding: 0;
  list-style: none;
}
.cards h2 {
  margin: 0 0 var(--space-1);
  font-size: var(--font-size-lg);
}
.meta {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  margin: 0;
  color: var(--text-muted);
  font-size: var(--font-size-sm);
}
.tag {
  padding: 0 var(--space-2);
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-pill);
}
.muted {
  color: var(--text-muted);
}
</style>
