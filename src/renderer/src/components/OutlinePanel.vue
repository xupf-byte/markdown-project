<script setup lang="ts">
import { computed } from 'vue'
import { useVaultStore } from '../stores/vault'

const vault = useVaultStore()
const emit = defineEmits<{ (e: 'jump', id: string, line: number): void }>()

const items = computed(() => vault.outline)
</script>

<template>
  <div class="outline-panel">
    <div class="side-section-title" style="padding-top: 0">大纲</div>
    <div v-if="!items.length" class="muted" style="font-size: 12px; padding: 4px 10px; line-height: 1.8">
      当前文档没有标题
    </div>
    <button
      v-for="(item, i) in items"
      :key="`${item.id}-${i}`"
      class="outline-item"
      :style="{ paddingLeft: `${8 + (item.level - 1) * 12}px` }"
      :title="item.text"
      @click="emit('jump', item.id, item.line)"
    >
      {{ item.text || '（无标题）' }}
    </button>
  </div>
</template>
