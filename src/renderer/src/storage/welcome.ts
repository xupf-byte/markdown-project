export const WELCOME_MD = `# 欢迎使用 飞儿MD

这是一款跨平台的 Markdown 笔记应用。左侧是文件树，中间是编辑区，右侧是实时预览。

## 常用操作

- **新建文档**：Cmd/Ctrl + N
- **新建文件夹**：Shift + Cmd/Ctrl + N
- **重命名**：文件树右键，或按 F2
- **删除**：Cmd/Ctrl + Backspace（进入回收站，可恢复）
- **全局搜索**：Cmd/Ctrl + F
- **导出**：Cmd/Ctrl + E

## 语法速览

| 语法 | 效果 |
| --- | --- |
| # 标题 | 一级标题 |
| **粗体** | 粗体 |
| - 列表 | 无序列表 |
| > 引用 | 引用块 |

- [x] 已支持任务列表
- [ ] 待办事项

\`\`\`js
// 代码高亮
function hello(name) {
  console.log(\`Hello, \${name}!\`)
}
\`\`\`

## 数学公式

行内公式 $E = mc^2$，块级公式：

$$
\\int_{0}^{\\infty} e^{-x^2} \\, dx = \\frac{\\sqrt{\\pi}}{2}
$$

## 流程图

\`\`\`mermaid
graph LR
  A[新建文档] --> B[编辑内容]
  B --> C[实时预览]
  C --> D[导出分享]
\`\`\`

> 提示：所有改动都会自动保存，无需手动操作。
`
