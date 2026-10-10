<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Search } from '@element-plus/icons-vue'
import { useVaultStore } from '../stores/vault'

const open = defineModel<boolean>({ required: true })
const emit = defineEmits<{ (e: 'jump', id: string, line: number): void }>()

const vault = useVaultStore()
const keyword = ref('')
let timer: ReturnType<typeof setTimeout> | null = null

watch(keyword, (v) => {
  if (timer) clearTimeout(timer)
  timer = setTimeout(() => vault.search(v), 220)
})

watch(open, (v) => {
  if (!v) {
    keyword.value = ''
    vault.clearSearch()
  }
})

const results = computed(() => vault.searchResults)

function highlight(text: string): string {
  const kw = vault.searchKeyword.trim()
  const safe = text.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c] as string)
  if (!kw) return safe
  const re = new RegExp(`(${kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi')
  return safe.replace(re, '<mark>$1</mark>')
}

async function pick(hit: { id: string; line: number; field: string }) {
  open.value = false
  await vault.open(hit.id)
  if (hit.field === 'content') emit('jump', hit.id, hit.line)
}
</script>

<template>
  <el-dialog v-model="open" title="全局搜索" width="640" top="10vh" append-to-body>
    <el-input
      v-model="keyword"
      size="large"
      placeholder="搜索文件名与正文内容…"
      :prefix-icon="Search"
      clearable
      autofocus
    />

    <div style="margin-top: 14px; max-height: 56vh; overflow: auto">
      <div v-if="vault.searching" class="muted" style="padding: 12px">搜索中…</div>
      <template v-else-if="keyword.trim()">
        <div class="muted" style="font-size: 12px; padding: 0 4px 8px">
          共 {{ results.length }} 条结果
        </div>
        <div
          v-for="(hit, i) in results"
          :key="`${hit.id}-${i}`"
          class="search-hit"
          @click="pick(hit)"
        >
          <div class="hit-title">{{ hit.name }}</div>
          <div class="hit-path">{{ hit.id }} · 第 {{ hit.line }} 行</div>
          <div class="hit-snippet" v-html="highlight(hit.snippet)" />
        </div>
        <div v-if="!results.length" class="muted" style="padding: 16px; text-align: center">
          没有找到匹配内容
        </div>
      </template>
      <div v-else class="muted" style="padding: 16px; text-align: center; font-size: 13px">
        输入关键词开始搜索（支持文件名与正文全文）
      </div>
    </div>
  </el-dialog>
</template>
