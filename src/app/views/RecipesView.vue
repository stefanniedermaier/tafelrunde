<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup lang="ts">
import { computed, onMounted, ref, shallowRef } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import {
  type Diet,
  type RecipeSort,
  type SearchableRecipe,
  DIET_LABELS,
  SORT_LABELS,
  allTags,
  averageStars,
  createRecipe,
  createRecipeSearch,
  getReviews,
  lastCooked,
  listCollections,
  recipeDiet,
  spaceKind,
  spaceName,
} from '@/core'
import { catalogDiet } from '../catalog'
import AppButton from '@/ui/components/AppButton.vue'
import AppCard from '@/ui/components/AppCard.vue'
import { useRecipes } from '../recipes/recipe-store'
import { workspace } from '../workspace/use-workspace'
import type { Workspace } from '../workspace/workspace'

const router = useRouter()
const { recipes, handles, index } = useRecipes()
const ws = shallowRef<Workspace>()
onMounted(async () => (ws.value = await workspace()))

// --- Suche, Filter, Sortierung (2.6) -----------------------------------------------

const query = ref('')
const selectedTags = ref<string[]>([])
const diet = ref<Diet | ''>('')
const maxMinutes = ref<number | ''>('')
const collection = ref('')
const sort = ref<RecipeSort>('name')

const collections = computed(() =>
  handles.value.flatMap((h) =>
    h.library
      ? listCollections(h.library.doc).map((c) => ({
          key: `${h.record.id}:${c.id}`,
          name: c.name,
          recipeKeys: c.recipeIds.map((id) => `space:${h.record.id}/${id}`),
        }))
      : [],
  ),
)

const searchable = computed<SearchableRecipe[]>(() =>
  recipes.value.map((r) => {
    const lib = handles.value.find((h) => h.record.id === r.spaceId)?.library
    return {
      key: r.key,
      recipe: r.recipe,
      diet: recipeDiet(index.value, r.recipe, r.scope, catalogDiet).diet,
      stars: lib ? averageStars(getReviews(lib.doc, r.id)) : undefined,
      lastCooked: lib ? lastCooked(lib.doc, r.id) : undefined,
      createdAt: r.stored.createdAt,
      collections: collections.value.filter((c) => c.recipeKeys.includes(r.key)).map((c) => c.key),
    }
  }),
)
const search = computed(() => createRecipeSearch(searchable.value))
const tags = computed(() => allTags(searchable.value))
const byKey = computed(() => new Map(recipes.value.map((r) => [r.key, r])))
const meta = computed(() => new Map(searchable.value.map((s) => [s.key, s])))

const sorted = computed(() =>
  search
    .value(
      {
        query: query.value,
        tags: selectedTags.value,
        ...(diet.value ? { diet: diet.value } : {}),
        ...(maxMinutes.value ? { maxMinutes: maxMinutes.value } : {}),
        ...(collection.value ? { collection: collection.value } : {}),
      },
      sort.value,
    )
    .flatMap((s) => byKey.value.get(s.key) ?? []),
)
const filtered = computed(
  () =>
    !!query.value.trim() ||
    selectedTags.value.length > 0 ||
    !!diet.value ||
    !!maxMinutes.value ||
    !!collection.value,
)
function resetFilters() {
  query.value = ''
  selectedTags.value = []
  diet.value = ''
  maxMinutes.value = ''
  collection.value = ''
}
function toggleTag(tag: string) {
  selectedTags.value = selectedTags.value.includes(tag)
    ? selectedTags.value.filter((t) => t !== tag)
    : [...selectedTags.value, tag]
}

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

  <form class="filters" role="search" aria-label="Rezepte suchen" @submit.prevent>
    <div class="field field--grow">
      <label for="recipe-query">Suchen</label>
      <input
        id="recipe-query"
        v-model="query"
        type="search"
        autocomplete="off"
        placeholder="Titel, Zutat, Text …"
      />
    </div>
    <div class="field">
      <label for="recipe-diet">Ernährung</label>
      <select id="recipe-diet" v-model="diet">
        <option value="">alle</option>
        <option v-for="(label, key) in DIET_LABELS" :key="key" :value="key">{{ label }}</option>
      </select>
    </div>
    <div class="field">
      <label for="recipe-time">Zeit</label>
      <select id="recipe-time" v-model="maxMinutes">
        <option value="">beliebig</option>
        <option :value="20">bis 20 min</option>
        <option :value="30">bis 30 min</option>
        <option :value="60">bis 1 h</option>
      </select>
    </div>
    <div v-if="collections.length" class="field">
      <label for="recipe-collection">Sammlung</label>
      <select id="recipe-collection" v-model="collection">
        <option value="">alle</option>
        <option v-for="c in collections" :key="c.key" :value="c.key">{{ c.name }}</option>
      </select>
    </div>
    <div class="field">
      <label for="recipe-sort">Sortieren nach</label>
      <select id="recipe-sort" v-model="sort">
        <option v-for="(label, key) in SORT_LABELS" :key="key" :value="key">{{ label }}</option>
      </select>
    </div>
  </form>
  <div v-if="tags.length" class="tags" role="group" aria-label="Nach Tags filtern">
    <button
      v-for="t in tags"
      :key="t.tag"
      type="button"
      class="tag-filter"
      :aria-pressed="selectedTags.includes(t.tag)"
      @click="toggleTag(t.tag)"
    >
      {{ t.tag }} <span class="muted">{{ t.count }}</span>
    </button>
  </div>
  <p class="count" role="status">
    {{ sorted.length }} {{ sorted.length === 1 ? 'Rezept' : 'Rezepte' }}
    <AppButton v-if="filtered" variant="ghost" @click="resetFilters">Filter zurücksetzen</AppButton>
  </p>

  <p v-if="!recipes.length" class="muted">Noch keine Rezepte.</p>
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
          <span v-if="meta.get(r.key)?.diet">{{ DIET_LABELS[meta.get(r.key)!.diet!] }}</span>
          <span v-if="meta.get(r.key)?.stars">
            <span aria-hidden="true">★</span>
            {{ meta.get(r.key)!.stars!.toLocaleString('de-DE', { maximumFractionDigits: 1 }) }}
            <span class="visually-hidden">von 5 Sternen</span>
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
.filters {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: var(--space-2) var(--space-3);
}
.field--grow {
  flex: 1 1 14rem;
}
input[type='search'] {
  width: 100%;
  min-height: var(--touch-target);
  padding: 0 var(--space-3);
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-sm);
  background: var(--surface);
  color: var(--text);
  font: inherit;
}
.tags {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  margin-top: var(--space-3);
}
.tag-filter {
  min-height: 2.25rem;
  padding: 0 var(--space-3);
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-pill);
  background: var(--surface);
  color: var(--text);
  font: inherit;
  cursor: pointer;
}
.tag-filter[aria-pressed='true'] {
  border-color: var(--primary);
  background: var(--primary);
  color: var(--on-primary);
}
.tag-filter[aria-pressed='true'] .muted {
  color: inherit;
}
.count {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  color: var(--text-muted);
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
