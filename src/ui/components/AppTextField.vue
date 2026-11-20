<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup lang="ts">
import { useId } from 'vue'

const props = defineProps<{ label: string; hint?: string; error?: string }>()
const model = defineModel<string>({ default: '' })
const id = useId()
const describedBy = [props.hint ? `${id}-hint` : '', props.error ? `${id}-error` : '']
  .filter(Boolean)
  .join(' ')
</script>

<template>
  <div class="field">
    <label :for="id">{{ label }}</label>
    <input
      :id="id"
      v-model="model"
      v-bind="$attrs"
      :aria-invalid="error ? 'true' : undefined"
      :aria-describedby="describedBy || undefined"
    />
    <small v-if="hint" :id="`${id}-hint`" class="field__hint">{{ hint }}</small>
    <small v-if="error" :id="`${id}-error`" class="field__error">{{ error }}</small>
  </div>
</template>

<style scoped>
.field {
  display: grid;
  gap: var(--space-1);
}
label {
  font-weight: 600;
}
input {
  min-height: var(--touch-target);
  padding: 0 var(--space-3);
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-sm);
  background: var(--surface);
  color: var(--text);
  font: inherit;
}
input[aria-invalid='true'] {
  border-color: var(--error);
}
.field__hint {
  color: var(--text-muted);
}
.field__error {
  color: var(--error);
}
</style>
