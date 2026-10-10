<script setup lang="ts">
import { computed } from 'vue'
import { Close } from '@element-plus/icons-vue'
import { useVaultStore } from '../stores/vault'
import { externalPath, isExternalId } from '../storage'
import type { DocNode } from '../types'

const vault = useVaultStore()

const tabs = computed(() =>
  vault.openTabs.map((id) => ({
    id,
    node: vault.files.find((f: DocNode) => f.id === id),
    name: vault.files.find((f: DocNode) => f.id === id)?.name ?? id.split('/').pop() ?? id,
    dirty: vault.dirtyIds.includes(id),
    external: isExternalId(id),
    /** 悬停提示：外部文件直接给出磁盘上的绝对路径 */
    hint: isExternalId(id) ? externalPath(id) : id
  }))
)

function onClose(e: MouseEvent, id: string) {
  e.stopPropagation()
  vault.closeTab(id)
}

function onMiddle(e: MouseEvent, id: string) {
  if (e.button === 1) {
    e.preventDefault()
    vault.closeTab(id)
  }
}
</script>

<template>
  <div v-if="tabs.length" class="tabbar">
    <div
      v-for="t in tabs"
      :key="t.id"
      class="tab"
      :class="{ 'is-active': t.id === vault.currentId }"
      :title="t.hint"
      @click="vault.open(t.id)"
      @mousedown="onMiddle($event, t.id)"
    >
      <span v-if="t.dirty" class="dirty-dot" />
      <span v-if="t.external" class="ext-flag">外部</span>
      <span class="tab-name">{{ t.name }}</span>
      <el-icon class="tab-close" :size="12" @click="onClose($event, t.id)"><Close /></el-icon>
    </div>
  </div>
</template>

<style scoped>
.ext-flag {
  flex: 0 0 auto;
  font-size: 10px;
  line-height: 15px;
  padding: 0 4px;
  margin-right: 2px;
  border-radius: 4px;
  color: #409eff;
  background: rgba(64, 158, 255, 0.14);
}
</style>
