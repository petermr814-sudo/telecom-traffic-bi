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
| `node tools/fix-verify.mjs` | 图表/交互专项回归：日期详情、柱状/折线、日均线、对比、热力图、地图、tooltip、角标、侧栏 |
| `node tools/shot.mjs` | 截六页全页图到 `docs/shot-*.png`（1600 宽） |
| `node tools/layout-verify.mjs` | 检查六页在 1280 / 768 / 390 宽度下的溢出、图表初始化，以及技术说明键盘展开/收起；截图到 `docs/layout-check/` |
| `node tools/template-verify.mjs` | 检查日期与当天数据一致、构成合计、热力读数、连续分箱、全量小区、鼠标详情和消息份额；详情截图到 `docs/layout-check/` |
| `node tools/hourly-verify.mjs` | 时段分析专项：圆环跟随选中日期标注峰值、遮罩层选中/切换动画、展开详情无横向位移；截图到 `docs/hourly-check/` |
| `node tools/map-verify.mjs` | 3D 地图聚焦、连续切城、范围联动、数据核对、搜索、返回、移动布局及离线交互；截图到 `docs/map-check/`，默认端口 5400，可用 SHOT_BASE 覆盖 |
| `node tools/camera-motion-verify.mjs` | 实时镜头的朝向继承、切城速度连续性、帧率一致性、接管/减少动画与全部城市的视锥取景；无需启动浏览器 |
| `node tools/page-transition-verify.mjs` | 页面切换动画：离开/进入的移动轨迹、二次贝塞尔缓动、透明度同步、残留清理与减少动态效果；截图到 `docs/layout-check/page-switch/` |
| `node tools/mask-verify.mjs` | 时段页日期遮罩：滑动连续性、方向与终点、透明度同步、二次缓动轨迹拟合、减少动画偏好下仍可滑动；截图到 `docs/layout-check/mask-switch/` |
| `node tools/metrics-mask-verify.mjs` | 区域页指标切换胶囊：初始覆盖、滑动连续性、终点对齐、二次缓动轨迹拟合、减少动画偏好下仍可滑动；截图到 `docs/layout-check/metrics-mask/` |
| `node tools/prepare-city-geo.mjs` | 从 DataV 更新演示数据覆盖的 60 座城市边界，仅资源更新时需要联网 |

以上脚本默认访问 `http://127.0.0.1:5178/`，可用 `SHOT_BASE` 覆盖：

```bash
SHOT_BASE=http://127.0.0.1:5180/ node tools/shot.mjs
```

## 注意

- 两个回归脚本会真实点击页面并发起请求；跑的时候不要同时手动操作同一个页面。
- 每次改了图表组件、全局筛选、告警状态后，至少跑一遍 `fix-verify.mjs`。

真实地形资源重建：python tools/prepare-terrain.py（需要 numpy、pillow、scipy、shapely、requests；从公开高程瓦片生成）。python tools/terrain-verify.py 检查 61 份地形网格的高程、索引、朝向与地理位置。网页运行时不依赖 Python 或在线地形服务。
