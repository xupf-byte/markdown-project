#!/usr/bin/env bash
#
# 飞儿MD · macOS 打包流水线
#
# 为什么要自己封 DMG：
#   electron-builder 的 mac 目标只支持「真实证书签名」或「完全跳过签名」两种，
#   不支持 ad-hoc 签名。而 Apple Silicon 上未签名的 App 会被系统直接拒绝启动，
#   所以必须按「先打包 → 再 ad-hoc 签名 → 最后封 DMG」的顺序做，
#   否则 DMG 里装的会是签名失效的 .app。
#
# 为什么不把 .app 拷进一个暂存目录再 -srcfolder：
#   那样每次构建都要递归删除上百个文件的暂存目录，既慢又容易碰到删除保护。
#   这里改为「建可写映像 → 挂载 → ditto 进去 → 卸载 → 压缩」，
#   全程零暂存目录，结束后只删一个临时映像文件。
#
# 用法：
#   npm run dist:mac          # 默认 arm64
#   ARCH=x64 npm run dist:mac # 需要 x64 版 Electron 内核
#
set -euo pipefail

cd "$(dirname "$0")/.."

APP_NAME="飞儿MD"
VERSION=$(node -p "require('./package.json').version")
ARCH="${ARCH:-arm64}"
OUT="release"
APP="${OUT}/mac-${ARCH}/${APP_NAME}.app"
DMG="${OUT}/${APP_NAME}-${VERSION}-${ARCH}.dmg"
BIN="./node_modules/.bin"

step() { printf '\n\033[1;36m▶ %s\033[0m\n' "$1"; }

step "1/4 构建主进程 / preload / 渲染层"
"${BIN}/electron-vite" build

# 注意：变量一律写成 ${VAR}。中文字符是合法的 bash 变量名字符，
# 写成 $ARCH）时 bash 会把"）"并进变量名，导致 unbound variable。
step "2/4 打包 ${APP_NAME}.app（${ARCH}）"
# 关闭证书自动发现：本地没有 Developer ID 证书，让它跳过，签名单独做
CSC_IDENTITY_AUTO_DISCOVERY=false "${BIN}/electron-builder" --mac --"${ARCH}" --dir

step "3/4 ad-hoc 签名"
codesign --force --deep --sign - "${APP}"
codesign --verify --deep --strict --verbose=1 "${APP}"

step "4/4 封装 DMG"
mkdir -p "${OUT}"
WORK="$(mktemp -d)"
RW="${WORK}/rw.dmg"
MNT="${WORK}/mnt"
mkdir -p "${MNT}"

# 映像容量 = .app 体积 + 60MB 余量（APFS 卷本身也要占用一些空间）
SIZE_MB=$(( $(du -sm "${APP}" | cut -f1) + 60 ))

hdiutil create -size "${SIZE_MB}m" -fs APFS -volname "${APP_NAME} ${VERSION}" -ov "${RW}" >/dev/null
hdiutil attach "${RW}" -mountpoint "${MNT}" -nobrowse -noautoopen >/dev/null

# 用 ditto 而不是 cp：ditto 是 macOS 拷贝 .app 的正确工具，
# 会完整保留扩展属性、ACL 与代码签名（cp 有可能破坏签名）。
ditto "${APP}" "${MNT}/${APP_NAME}.app"
ln -s /Applications "${MNT}/Applications"   # 拖拽安装用的快捷入口

hdiutil detach "${MNT}" >/dev/null
hdiutil convert "${RW}" -format UDZO -ov -o "${DMG}" >/dev/null

# 清理：只删映像文件本身，内容随映像一起消失
# 收尾的 rmdir 失败不应让整个构建判为失败（卸载后目录可能被系统短暂占用），
# 临时目录位于系统 temp 下，交给系统清理即可。
rm -f "${RW}"
rmdir "${MNT}" 2>/dev/null || true
rmdir "${WORK}" 2>/dev/null || true

step "校验 DMG"
hdiutil verify "${DMG}" >/dev/null && echo "  校验通过"

printf '\n\033[1;32m✓ 完成\033[0m\n'
printf '  App: %s\n' "${APP}"
printf '  DMG: %s (%s)\n' "${DMG}" "$(du -h "${DMG}" | cut -f1)"
