# 第三方依赖与数据来源

## 运行时依赖

| 依赖 | 版本 | 许可 | 用途 |
| --- | --- | --- | --- |
| Vue | 3.5.x | MIT | 前端框架 |
| Vue Router | 4.5.x | MIT | 路由 |
| ECharts | 5.5.1 | Apache-2.0 | 图表 |
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

`web/public/geo/china.json` 来自阿里云 DataV.GeoAtlas 的中国省级 GeoJSON（`https://geo.datav.aliyun.com/areas_v3/bound/100000_full.json`），已做两处处理：

1. 去掉 `name` 为空的南海诸岛要素；
2. 裁掉纬度 15° 以南的岛礁，让中国地图在面板里铺满。

课程演示用途；商用请自行确认 DataV 数据许可与地图审图要求。

## 业务数据

`web/public/data/dataset.json` 由 `data/gen_data.py` 生成，随机种子固定（`20261108`）。全部为模拟构造数据，不含任何真实手机号、用户或基站信息。
