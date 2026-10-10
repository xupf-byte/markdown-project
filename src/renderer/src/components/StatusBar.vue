<script setup lang="ts">
import { computed } from 'vue'
import { useVaultStore } from '../stores/vault'

const vault = useVaultStore()

const saveLabel = computed(() => {
  switch (vault.saveState) {
    case 'saving':
      return '保存中…'
    case 'dirty':
      return '有未保存改动'
    case 'saved':
      return vault.lastSavedAt
        ? `已保存 ${new Date(vault.lastSavedAt).toLocaleTimeString('zh-CN', { hour12: false })}`
        : '已保存'
    default:
      return '就绪'
  }
})

/** 当前文件所在位置：外部文件显示其目录，否则显示工作区根 */
const path = computed(() => {
  const raw = vault.currentId ? vault.currentLocation : vault.root
  if (!raw) return ''
  return raw.length > 48 ? `…${raw.slice(-47)}` : raw
})

const sourceLabel = computed(() => (vault.currentIsExternal ? '工作区外文件' : vault.backend))
</script>

<template>
  <div class="statusbar">
    <span v-if="vault.currentId">{{ vault.currentTitle }}</span>
    <span v-else class="muted">未打开文档</span>
    <span class="muted">{{ saveLabel }}</span>
    <span class="grow" />
    <span v-if="vault.currentId">
      {{ vault.stats.lines }} 行 · {{ vault.stats.words }} 字 · 约 {{ vault.stats.readMinutes }} 分钟
    </span>
    <span class="muted" :title="vault.currentLocation || vault.root">{{ sourceLabel }}</span>
    <span class="muted" :title="vault.currentLocation || vault.root">{{ path }}</span>
  </div>
</template>
