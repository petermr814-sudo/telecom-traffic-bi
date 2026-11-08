# tools 使用说明

这些脚本只用于本地验收，不参与打包。

## 前置

1. 前端已启动：`cd web && pnpm dev`（默认 <http://127.0.0.1:5178>）。
2. 本机有 Chrome。默认找 Windows 路径：

```text
C:\Program Files\Google\Chrome\Application\chrome.exe
```

其他系统或安装位置用环境变量指定：

```bash
# Windows PowerShell
$env:CHROME_PATH="D:\chrome\chrome.exe"

# macOS / Linux
export CHROME_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
```

## 脚本

| 命令 | 作用 |
| --- | --- |
| `node tools/e2e.mjs` | 主流程回归：筛选、告警、命令面板、扩容、缩容、作业重跑、设置，16 项 |
| `node tools/fix-verify.mjs` | 图表/交互专项回归：柱状、日均线、对比、热力图、地图、tooltip、角标、hover、侧栏，17 项 |
| `node tools/shot.mjs` | 截六页全页图到 `docs/shot-*.png`（1600 宽） |

截图脚本默认访问 `http://127.0.0.1:5178/`，可用 `SHOT_BASE` 覆盖：

```bash
SHOT_BASE=http://127.0.0.1:5180/ node tools/shot.mjs
```

## 注意

- 两个回归脚本会真实点击页面并发起请求；跑的时候不要同时手动操作同一个页面。
- 每次改了图表组件、全局筛选、告警状态后，至少跑一遍 `fix-verify.mjs`。
