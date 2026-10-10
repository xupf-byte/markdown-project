<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Delete, RefreshLeft } from '@element-plus/icons-vue'
import { useVaultStore } from '../stores/vault'

const open = defineModel<boolean>({ required: true })
const vault = useVaultStore()
const busy = ref(false)

watch(open, (v) => {
  if (v) vault.loadTrash()
})
onMounted(() => vault.loadTrash())

function fmt(ts: number): string {
  if (!ts) return '—'
  return new Date(ts).toLocaleString('zh-CN', { hour12: false })
}

async function restore(id: string) {
  await vault.restore(id)
  ElMessage.success('已恢复到原位置')
}

async function purge(id: string, name: string) {
  try {
    await ElMessageBox.confirm(`「${name}」将被永久删除，且无法恢复。`, '彻底删除', {
      type: 'warning',
      confirmButtonText: '永久删除',
      cancelButtonText: '取消'
    })
    await vault.purge(id)
    ElMessage.success('已永久删除')
  } catch {
    /* 取消 */
  }
}

async function emptyAll() {
  if (!vault.trashItems.length) return
  try {
    await ElMessageBox.confirm('清空回收站后所有内容将被永久删除，无法恢复。', '清空回收站', {
      type: 'warning',
      confirmButtonText: '清空',
      cancelButtonText: '取消'
    })
    busy.value = true
    await vault.emptyTrash()
    ElMessage.success('回收站已清空')
  } catch {
    /* 取消 */
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <el-dialog v-model="open" title="回收站" width="620" top="10vh" append-to-body>
    <div style="display: flex; align-items: center; margin-bottom: 12px">
      <span class="muted" style="font-size: 12px">
        删除的文档会先进入这里，可随时恢复；清空后无法找回。
      </span>
      <span style="flex: 1" />
      <el-button size="small" :icon="Delete" :disabled="!vault.trashItems.length || busy" @click="emptyAll">
        清空回收站
      </el-button>
    </div>

    <div style="max-height: 54vh; overflow: auto">
      <el-table :data="vault.trashItems" size="small" empty-text="回收站是空的" style="width: 100%">
        <el-table-column prop="name" label="名称" min-width="180" show-overflow-tooltip />
        <el-table-column label="原位置" min-width="180" show-overflow-tooltip>
          <template #default="{ row }">
            <span class="muted">{{ row.originPath }}</span>
          </template>
        </el-table-column>
        <el-table-column label="删除时间" width="170">
          <template #default="{ row }">
            <span class="muted">{{ fmt(row.deletedAt) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="150" align="right">
          <template #default="{ row }">
            <el-button size="small" text :icon="RefreshLeft" @click="restore(row.id)">恢复</el-button>
            <el-button size="small" text type="danger" @click="purge(row.id, row.name)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </div>
  </el-dialog>
</template>
