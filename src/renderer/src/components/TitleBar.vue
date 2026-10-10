<script setup lang="ts">
import { computed } from 'vue'
import { Moon, Setting, Sunny, UserFilled } from '@element-plus/icons-vue'
import { useVaultStore } from '../stores/vault'
import { useSettingsStore } from '../stores/settings'

const emit = defineEmits<{ (e: 'open-settings'): void }>()
const vault = useVaultStore()
const settings = useSettingsStore()

const themeLabel = computed(
  () => ({ light: '亮色', dark: '暗色', system: '跟随系统' })[settings.theme]
)
</script>

<template>
  <header class="titlebar">
    <span class="titlebar-mac-pad" />
    <span class="titlebar-title">飞儿MD</span>
    <span v-if="vault.currentId" class="titlebar-title" style="opacity: 0.7">
      · {{ vault.currentTitle }}
      <template v-if="vault.isDirty"> •</template>
    </span>

    <span style="flex: 1" />

    <el-tooltip :content="`主题：${themeLabel}`" placement="bottom">
      <button class="tb-btn no-drag" @click="settings.cycleTheme()">
        <el-icon :size="15"><Moon v-if="settings.isDark" /><Sunny v-else /></el-icon>
      </button>
    </el-tooltip>
    <el-tooltip content="偏好设置 ⌘," placement="bottom">
      <button class="tb-btn no-drag" @click="emit('open-settings')">
        <el-icon :size="15"><Setting /></el-icon>
      </button>
    </el-tooltip>
    <el-tooltip v-if="!vault.isElectron" content="当前为浏览器预览模式" placement="bottom">
      <el-icon class="no-drag" :size="14" style="color: var(--text-3); margin-left: 4px">
        <UserFilled />
      </el-icon>
    </el-tooltip>
  </header>
</template>
