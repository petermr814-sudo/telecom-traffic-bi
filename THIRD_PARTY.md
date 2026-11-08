# 第三方依赖与数据来源

## 运行时依赖

| 依赖 | 版本 | 许可 | 用途 |
| --- | --- | --- | --- |
| Vue | 3.5.x | MIT | 前端框架 |
| Vue Router | 4.5.x | MIT | 路由 |
| ECharts | 5.5.1 | Apache-2.0 | 图表 |
| Three.js | 0.187.x | MIT | 立体地图、城市标记与镜头动画 |
| dayjs | 1.11.x | MIT | 日期处理 |

## 开发依赖

| 依赖 | 许可 | 用途 |
| --- | --- | --- |
| Vite | MIT | 构建 |
| @vitejs/plugin-vue | MIT | Vue SFC 编译 |
| TypeScript | Apache-2.0 | 类型 |
| puppeteer-core | Apache-2.0 | 截图/回归脚本（不参与打包） |
| pnpm | MIT | 包管理 |

## 地图数据

`web/public/geo/china.json` 来自阿里云 DataV.GeoAtlas 的中国省级 GeoJSON（`https://geo.datav.aliyun.com/areas_v3/bound/100000_full.json`）。3D 地图保留省域几何，纬度 18° 以南的独立岛礁多边形绘制在「南海诸岛」插图中。

`web/public/geo/cities.json` 为同源省级下辖城市边界中与演示数据匹配的 60 个城市，保留原始几何及 `center` 坐标；直辖市使用省级几何。由 `web/tools/prepare-city-geo.mjs` 生成，运行时无需访问外网。城市中心用于聚合指标定位，不代表实际基站位置。

`web/public/geo/provinces-detail.json` 从同源各省独立边界接口汇总，保留更细的海岸线与岛屿轮廓，供 3D 模型使用；原全国文件中的南海要素同时保留。更新工具为 `web/tools/prepare-province-geo.mjs`。

课程演示用途；商用请自行确认 DataV 数据许可与地图审图要求。

## 视觉参考

信息卡片与图表参考用户提供的 Lieflat Charts：Glance 的快速阅读布局、Porcelain 蓝阶与横向排名表现。二维图表继续使用 ECharts；区域地图使用 Three.js。

本轮采用其 F2/F5/F10/F11/F14、G4/G7/G9/G12/G15/G17 图形编码进行适配。模板采用 PolyForm Noncommercial 1.0.0；许可副本位于 `web/public/third-party/lieflat-charts-LICENSE.txt`，随构建产物分发。选型与数据约定见 `docs/图表模板选型.md`。

## 业务数据

`web/public/data/dataset.json` 由 `data/gen_data.py` 生成，随机种子固定（`20261108`）。全部为模拟构造数据，不含任何真实手机号、用户或基站信息。

## 高程地形数据

`web/public/geo/terrain/` 由 Mapzen Terrain Tiles（AWS Open Data）的真实 Terrarium DEM 生成。源：<https://registry.opendata.aws/terrain-tiles/>；格式：<https://github.com/tilezen/joerd/blob/master/docs/formats.md>；上游归属与许可：<https://github.com/tilezen/joerd/blob/master/docs/attribution.md>。

SRTM and GMTED2010 terrain data courtesy of the U.S. Geological Survey. Global ETOPO1 terrain data: DOC/NOAA/NESDIS/NCEI, National Centers for Environmental Information, NOAA, U.S. Department of Commerce. 原始美国政府地形数据与本项目代码版权分别归属。

本项目对源高程做米单位解码、采样、边界裁切和投影，白模中使用全国 24 倍、城市近景 6 倍垂直夸张；这些处理不由源机构背书。页面保留 Mapzen / USGS / NOAA 来源链接。全国模型使用 zoom 6 源瓦片，城市周边使用 zoom 9 源瓦片；不使用贴图或生成噪声伪造山体。
