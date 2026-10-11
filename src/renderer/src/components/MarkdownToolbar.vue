<script setup lang="ts">
import { ref } from 'vue'
import {
  Finished,
  Grid,
  Link,
  List,
  Picture,
  RefreshLeft,
  RefreshRight
} from '@element-plus/icons-vue'
import { useSettingsStore } from '../stores/settings'

const emit = defineEmits<{ (e: 'cmd', name: string, value?: string): void }>()
const settings = useSettingsStore()

function run(name: string, value?: string) {
  emit('cmd', name, value)
}

const inlines: { cmd: string; label: string; title: string }[] = [
  { cmd: 'bold', label: 'B', title: '加粗 ⌘B' },
  { cmd: 'italic', label: 'I', title: '斜体 ⌘I' },
  { cmd: 'strike', label: 'S', title: '删除线' },
  { cmd: 'code', label: '</>', title: '行内代码 ⌘`' }
]

const headings = [
  { cmd: 'h1', label: 'H1' },
  { cmd: 'h2', label: 'H2' },
  { cmd: 'h3', label: 'H3' }
]

/* ---------------- 颜色 ---------------- */

/** 字体颜色预设 */
const TEXT_COLORS = [
  '#e53935',
  '#fb8c00',
  '#f9a825',
  '#43a047',
  '#00acc1',
  '#1e88e5',
  '#3949ab',
  '#8e24aa',
  '#ec407a',
  '#6d4c41',
  '#757575',
  '#1f2328'
]

/** 背景色预设（浅色底，保证正文可读） */
const BG_COLORS = [
  '#ffebee',
  '#fff3e0',
  '#fffde7',
  '#e8f5e9',
  '#e0f7fa',
  '#e3f2fd',
  '#e8eaf6',
  '#f3e5f5',
  '#fce4ec',
  '#efebe9',
  '#eceff1',
  '#ffd54f'
]

const colorOpen = ref(false)
const bgOpen = ref(false)
/** 记录最近使用的颜色，用于按钮上的色条/色块 */
const lastColor = ref('#e53935')
const lastBg = ref('#fff3a3')
/** 取色器当前值（自定义颜色入口） */
const customText = ref('#e53935')
const customBg = ref('#fff3a3')

function pickText(c: string | null) {
  colorOpen.value = false
  if (c === null || c === undefined) return
  if (c) lastColor.value = c
  run('color', c)
}

function pickBg(c: string | null) {
  bgOpen.value = false
  if (c === null || c === undefined) return
  if (c) lastBg.value = c
  run('bgcolor', c)
}
</script>

<template>
  <div class="toolbar">
    <button
      v-for="h in headings"
      :key="h.cmd"
      class="tb-btn"
      style="font-weight: 600; font-size: 12px"
      :title="h.cmd.toUpperCase()"
      @click="run(h.cmd)"
    >
      {{ h.label }}
    </button>
    <span class="sep" />

    <button
      v-for="b in inlines"
      :key="b.cmd"
      class="tb-btn"
      :title="b.title"
      @click="run(b.cmd)"
    >
      <b v-if="b.cmd === 'bold'">{{ b.label }}</b>
      <i v-else-if="b.cmd === 'italic'">{{ b.label }}</i>
      <s v-else-if="b.cmd === 'strike'">{{ b.label }}</s>
      <span v-else style="font-family: var(--mono); font-size: 11px">{{ b.label }}</span>
    </button>
    <span class="sep" />

    <el-popover
      v-model:visible="colorOpen"
      :width="240"
      trigger="click"
      placement="bottom-start"
      popper-class="color-pop"
    >
      <template #reference>
        <button class="tb-btn" title="字体颜色">
          <span class="tb-color-a" :style="{ color: lastColor }">A</span>
        </button>
      </template>
      <div class="color-panel">
        <div class="color-grid">
          <button
            v-for="c in TEXT_COLORS"
            :key="c"
            class="color-swatch"
            :style="{ background: c }"
            :title="c"
            @click="pickText(c)"
          />
        </div>
        <div class="color-row">
          <el-color-picker v-model="customText" size="small" @change="pickText" />
          <span>自定义字体颜色</span>
        </div>
        <div class="color-actions">
          <span style="font-size: 12px; color: var(--text-3)">选中文字后应用</span>
          <el-button text size="small" @click="pickText('')">清除</el-button>
        </div>
      </div>
    </el-popover>

    <el-popover
      v-model:visible="bgOpen"
      :width="240"
      trigger="click"
      placement="bottom-start"
      popper-class="color-pop"
    >
      <template #reference>
        <button class="tb-btn" title="背景色">
          <span class="tb-color-bg" :style="{ background: lastBg }" />
        </button>
      </template>
      <div class="color-panel">
        <div class="color-grid">
          <button
            v-for="c in BG_COLORS"
            :key="c"
            class="color-swatch"
            :style="{ background: c }"
            :title="c"
            @click="pickBg(c)"
          />
        </div>
        <div class="color-row">
          <el-color-picker v-model="customBg" size="small" @change="pickBg" />
          <span>自定义背景色</span>
        </div>
        <div class="color-actions">
          <span style="font-size: 12px; color: var(--text-3)">选中文字后应用</span>
          <el-button text size="small" @click="pickBg('')">清除</el-button>
        </div>
      </div>
    </el-popover>
    <span class="sep" />

    <button class="tb-btn" title="引用" @click="run('quote')">“”</button>
    <button class="tb-btn" title="无序列表" @click="run('ul')">
      <el-icon :size="15"><List /></el-icon>
    </button>
    <button class="tb-btn" title="有序列表" @click="run('ol')">
      <el-icon :size="15"><Finished /></el-icon>
    </button>
    <button class="tb-btn" title="任务列表" @click="run('task')">☑</button>
    <span class="sep" />

    <button class="tb-btn" title="链接 ⌘K" @click="run('link')">
      <el-icon :size="15"><Link /></el-icon>
    </button>
    <button class="tb-btn" title="图片" @click="run('image')">
      <el-icon :size="15"><Picture /></el-icon>
    </button>
    <button class="tb-btn" title="表格" @click="run('table')">
      <el-icon :size="15"><Grid /></el-icon>
    </button>
    <button class="tb-btn" title="代码块" @click="run('codeblock')">
      <span style="font-family: var(--mono); font-size: 11px">{ }</span>
    </button>
    <button class="tb-btn" title="数学公式" @click="run('math')">∑</button>
    <button class="tb-btn" title="Mermaid 图表" @click="run('mermaid')">◈</button>
    <button class="tb-btn" title="分隔线" @click="run('hr')">—</button>
    <span class="sep" />

    <button class="tb-btn" title="撤销 ⌘Z" @click="run('undo')">
      <el-icon :size="15"><RefreshLeft /></el-icon>
    </button>
    <button class="tb-btn" title="重做 ⇧⌘Z" @click="run('redo')">
      <el-icon :size="15"><RefreshRight /></el-icon>
    </button>

    <span class="spacer" />

    <el-radio-group
      :model-value="settings.previewMode"
      size="small"
      @update:model-value="settings.setPreviewMode($event as never)"
    >
      <el-radio-button value="edit">编辑</el-radio-button>
      <el-radio-button value="split">分栏</el-radio-button>
      <el-radio-button value="preview">预览</el-radio-button>
    </el-radio-group>

    <el-tooltip :content="settings.outlineVisible ? '隐藏大纲' : '显示大纲'" placement="bottom">
      <button
        class="tb-btn"
        :class="{ 'is-on': settings.outlineVisible }"
        style="margin-left: 6px"
        @click="settings.toggleOutline()"
      >
        大纲
      </button>
    </el-tooltip>
  </div>
</template>
