#!/usr/bin/env python3
"""
把一张方形源图转成 macOS 原生观感的 .icns 应用图标。

做了什么：
  1. 读取源图，居中裁成正方形并缩放到 1024×1024 母版；
  2. 套用 macOS Big Sur 图标网格：内容区 824×824（四周留 100px 透明边距），
     圆角半径 185.4，圆角外为透明 —— 也就是 Dock / 启动台里的"圆角方形"；
  3. 按 iconset 规范导出 10 个尺寸（16…512 各含 @2x）；
  4. 调用系统 iconutil 生成 .icns，同时留一份 1024 PNG 备用。

用法：
  python3 scripts/make-icon.py <源图> [输出目录，默认 build]

依赖：Pillow（系统自带 sips / iconutil 做最后一步封装）
"""

import subprocess
import sys
import tempfile
from pathlib import Path

from PIL import Image, ImageDraw

# macOS 图标网格参数（以 1024 画布为基准）
CANVAS = 1024
MARGIN = 100                      # 内容区四周留白
CONTENT = CANVAS - MARGIN * 2     # 824
RADIUS = 185                      # 圆角半径

# 需要导出的 iconset 条目：(文件名, 像素尺寸)
ICONSET_ENTRIES = [
    ("icon_16x16.png", 16),
    ("icon_16x16@2x.png", 32),
    ("icon_32x32.png", 32),
    ("icon_32x32@2x.png", 64),
    ("icon_128x128.png", 128),
    ("icon_128x128@2x.png", 256),
    ("icon_256x256.png", 256),
    ("icon_256x256@2x.png", 512),
    ("icon_512x512.png", 512),
    ("icon_512x512@2x.png", 1024),
]


def square_crop(img: Image.Image) -> Image.Image:
    """居中裁成正方形，兼容非正方形源图。"""
    w, h = img.size
    side = min(w, h)
    left = (w - side) // 2
    top = (h - side) // 2
    return img.crop((left, top, left + side, top + side))


def rounded(img: Image.Image, size: int, radius: int) -> Image.Image:
    """圆角遮罩，圆角外完全透明。用 4 倍超采样画遮罩以获得平滑边缘。"""
    ss = 4
    mask = Image.new("L", (size * ss, size * ss), 0)
    ImageDraw.Draw(mask).rounded_rectangle(
        (0, 0, size * ss - 1, size * ss - 1), radius=radius * ss, fill=255
    )
    mask = mask.resize((size, size), Image.LANCZOS)

    out = img.convert("RGBA")
    out.putalpha(mask)
    return out


def build_master(src: Path) -> Image.Image:
    """源图 → 1024×1024 母版：内容区套圆角，四周（含四角）留透明边距。"""
    img = square_crop(Image.open(src).convert("RGBA"))
    img = img.resize((CONTENT, CONTENT), Image.LANCZOS)

    # 圆角只作用在内容区上；不能对整张画布套遮罩，
    # 否则内容区外围那一圈留白会变成不透明的黑色，出现可见方形接缝。
    img = rounded(img, CONTENT, RADIUS)

    canvas = Image.new("RGBA", (CANVAS, CANVAS), (0, 0, 0, 0))
    canvas.paste(img, (MARGIN, MARGIN))
    return canvas


def main() -> int:
    if len(sys.argv) < 2:
        print(__doc__)
        return 1

    src = Path(sys.argv[1]).expanduser().resolve()
    if not src.exists():
        print(f"源图不存在：{src}")
        return 1

    out_dir = Path(sys.argv[2]).expanduser().resolve() if len(sys.argv) > 2 else Path("build").resolve()
    out_dir.mkdir(parents=True, exist_ok=True)

    master = build_master(src)
    print(f"母版：{CANVAS}×{CANVAS}（内容区 {CONTENT}，圆角 {RADIUS}）")

    with tempfile.TemporaryDirectory() as tmp:
        iconset = Path(tmp) / "AppIcon.iconset"
        iconset.mkdir()

        for name, px in ICONSET_ENTRIES:
            master.resize((px, px), Image.LANCZOS).save(iconset / name, format="PNG")
        print(f"已导出 {len(ICONSET_ENTRIES)} 个尺寸")

        icns = out_dir / "icon.icns"
        subprocess.run(
            ["iconutil", "-c", "icns", str(iconset), "-o", str(icns)],
            check=True,
        )

    master.save(out_dir / "icon.png", format="PNG")

    print(f"图标已生成：{out_dir / 'icon.icns'}")
    print(f"预览图已生成：{out_dir / 'icon.png'}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
