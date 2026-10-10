<script setup lang="ts">
import { ElMessage } from 'element-plus'
import { FolderOpened } from '@element-plus/icons-vue'
import { useSettingsStore } from '../stores/settings'
import { useVaultStore } from '../stores/vault'
import type { ThemeMode } from '../types'

const open = defineModel<boolean>({ required: true })
const settings = useSettingsStore()
const vault = useVaultStore()

async function pickVault() {
  const ok = await vault.switchWorkspace()
  if (ok) ElMessage.success('工作区已切换')
}

function copyRoot() {
  navigator.clipboard?.writeText(vault.root)
  ElMessage.success('路径已复制')
}

/** 切换「配置片段自动补围栏」后立刻重渲染预览 */
function toggleAutoFence(v: boolean) {
  settings.autoFence = v
  settings.persist()
  vault.renderNow()
}
</script>

<template>
  <el-dialog v-model="open" title="偏好设置" width="560" append-to-body>
    <el-form label-width="96px" label-position="left">
      <el-form-item label="主题">
        <el-radio-group
          :model-value="settings.theme"
          @update:model-value="settings.setTheme($event as ThemeMode)"
        >
          <el-radio-button value="system">跟随系统</el-radio-button>
          <el-radio-button value="light">亮色</el-radio-button>
          <el-radio-button value="dark">暗色</el-radio-button>
        </el-radio-group>
      </el-form-item>

      <el-form-item label="编辑字号">
        <el-slider
          :model-value="settings.fontSize"
          :min="12"
          :max="22"
          :step="1"
          style="max-width: 240px"
          @update:model-value="settings.setFontSize($event as number)"
        />
        <span class="muted" style="margin-left: 12px">{{ settings.fontSize }}px</span>
      </el-form-item>

      <el-form-item label="默认视图">
        <el-radio-group
          :model-value="settings.previewMode"
          @update:model-value="settings.setPreviewMode($event as never)"
        >
          <el-radio-button value="edit">仅编辑</el-radio-button>
          <el-radio-button value="split">分栏</el-radio-button>
          <el-radio-button value="preview">仅预览</el-radio-button>
        </el-radio-group>
      </el-form-item>

      <el-form-item label="自动保存">
        <el-switch v-model="settings.autoSave" @change="settings.persist()" />
        <span class="muted" style="margin-left: 12px; font-size: 12px">
          关闭后需按 ⌘S 手动保存
        </span>
      </el-form-item>

      <el-form-item label="预览增强">
        <el-switch
          :model-value="settings.autoFence"
          @update:model-value="toggleAutoFence($event as boolean)"
        />
        <span class="muted" style="margin-left: 12px; font-size: 12px">
          自动补全代码块：未写围栏的配置片段、用单个 ` 包裹的多行代码
        </span>
      </el-form-item>

      <el-form-item label="存储位置">
        <div style="display: flex; align-items: center; gap: 8px; width: 100%">
          <el-tag size="small" type="info">{{ vault.backend }}</el-tag>
          <span class="muted" style="font-size: 12px; flex: 1; word-break: break-all">
            {{ vault.root }}
          </span>
        </div>
        <div style="margin-top: 8px; display: flex; gap: 8px">
          <el-button size="small" @click="copyRoot">复制路径</el-button>
          <el-button size="small" :icon="FolderOpened" :disabled="!vault.isElectron" @click="pickVault">
            更换工作区
          </el-button>
        </div>
      </el-form-item>

      <el-form-item label="快捷键">
        <div class="muted" style="font-size: 12px; line-height: 2">
          ⌘N 新建文档 · ⇧⌘N 新建文件夹 · ⌘S 保存 · ⌘F 全局搜索<br />
          ⌘B 加粗 · ⌘I 斜体 · ⌘K 链接 · ⌘P 切换预览 · ⌘J 切换主题
        </div>
      </el-form-item>
    </el-form>

    <div class="muted" style="font-size: 12px; text-align: center; margin-top: 4px">
      飞儿MD v0.1.0 · Electron + Vue 3 + Marked + KaTeX + Mermaid
    </div>
  </el-dialog>
</template>
