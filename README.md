# Geocoding-China-Pro | 地理编码与面域数据工作站

**空间数据工作站** — 批量地理编码转换 & OSM 面域/POI 点位查询工具

**Spatial Data Workstation** — Batch Geocoding & OSM Polygon/POI Query Tool

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![GitHub Stars](https://img.shields.io/github/stars/andyxu12341/Geocoding-China-Pro)](https://github.com/andyxu12341/Geocoding-China-Pro/stargazers)

---

## 核心功能 | Core Features

### Tab A: 坐标转换 | Point Geocoding
- **多源地理编码 / Multi-source Geocoding** — 高德地图、百度地图、OpenStreetMap（均已内置）
- **Search-First 智能引擎 / Search-First Engine** — POI 文本搜索优先，关键词提取重试，城市中心兜底
- **跨区域校验 / Cross-region Validation** — 自动验证经纬度与地址省份/城市是否匹配
- **批量处理 / Batch Processing** — 支持 CSV/Excel 大规模数据分批并发
- **智能重试 / Smart Retry** — 失败自动重试，支持断点续传
- **一小时缓存 / Request Cache** — 相同请求 1 小时内直接返回缓存结果
- **多候选选择 / Multi-candidate Selection** — 高德返回多个结果时可选最佳匹配
- **自定义分类着色 / Custom Category Coloring** — 按分类字段彩色标注坐标点
- **导出 GeoJSON / KML / PNG** — 支持 QGIS / ArcGIS / Google Earth

### Tab B: 面域 & POI 提取 | Polygon & POI Extraction
- **OpenStreetMap 面域查询 / OSM Polygon Query** — 基于 Overpass API 查询建筑轮廓、城市功能区、行政边界
- **POI 点位查询 / POI Point Query** — 支持 OSM、高德、百度三套数据源
  - **OSM (Overpass API)** — 查询 OSM node 数据，免费无 Key
  - **高德 POI** — 精细 POI 分类（官方分类代码），需高德 Web 服务 Key
  - **百度 POI** — 精细 POI 分类，需百度浏览器端 AK
- **坐标自动转换 / Coordinate Auto-transform** — 高德 GCJ-02 / 百度 BD-09 坐标自动转换为 WGS-84，确保与 GIS 软件无缝对接
- **语义搜索 / Semantic Search** — 输入地名/POI/行政区名称，通过 Nominatim 定位后提取周边面域或 POI
- **矩形框选 / Two-Click Rectangle** — 地图上点击两个对角顶点，自动成框并提取框内数据
- **多边形绘制 / Polygon Drawing** — 自由绘制任意多边形，提取多边形内数据
- **国土分类着色 / LANDUSE_STANDARD_MAP** — 60+ 分类条目，严格遵循国土空间制图规范（GB 标准）
- **行政边界 / Administrative Boundaries** — 支持省/市/区县/街道四级行政区边界提取（admin_level 2/4/6/8）
- **统一导出 / Unified Export** — CSV / GeoJSON / KML（POI 点位与面域数据可分别导出或合并导出）

### 地图可视化 | Map Visualization
- **7 种底图 / 7 Tile Layers** — 高德、OpenStreetMap、Esri 卫星、高德卫星、天地图（街景/卫星）、CARTO 暗色
- **分类图例 / Category Legend** — 按实际渲染颜色聚合显示，无冗余
- **自动聚焦 / Auto-fit** — 查询结果自动缩放至所有坐标范围
- **实时进度条 / Real-time Progress** — 显示处理进度、成功/失败计数

### 数据输入 & 导出 | Data Input & Export
- **输入 / Input** — 文本粘贴、CSV 上传、Excel 上传（.xlsx / .xls）
- **导出格式 / Export Formats** — CSV / GeoJSON / KML / PNG 地图截图

---

## 快速开始 | Quick Start

```bash
npm install
npm run dev    # 开发服务器 / Dev server → http://localhost:8083
npm run build  # 构建生产版本 / Build for production
```

---

## 配置指南 | Configuration Guide

### 高德地图 API Key（推荐 | Recommended）
1. 访问 [高德开放平台控制台](https://console.amap.com/dev/key/app)
2. 创建 Web Service 类型 Key
3. 无需配置域名绑定

### 百度地图 API Key
1. 访问 [百度地图开放平台](https://lbsyun.baidu.com/)
2. 创建浏览器端应用，复制 AK

### OpenStreetMap（无需 Key | No Key Required）
免费使用，默认速率限制 1 次/秒

---

## 技术栈 | Tech Stack

- **前端框架 / Frontend**: React 18 + TypeScript
- **构建工具 / Build**: Vite
- **UI 组件 / UI**: shadcn/ui (Radix UI)
- **地图库 / Map**: Leaflet + leaflet-draw + leaflet.chinatmsproviders
- **样式 / Styling**: Tailwind CSS
- **数据处理 / Data**: PapaParse, XLSX
- **国际化 / i18n**: i18next + react-i18next
- **动画 / Animation**: Framer Motion

---

## 项目结构 | Project Structure

```
src/
├── pages/
│   └── Index.tsx              # 主页面 | Main page
├── components/
│   ├── GeoMap.tsx             # 地图组件（Leaflet 原生）| Map component (raw Leaflet)
│   ├── GeocodingPanel.tsx    # Tab A 坐标转换面板 | Tab A geocoding panel
│   ├── AreaQueryPanel.tsx     # Tab B 面域/POI 提取面板 | Tab B extraction panel
│   ├── ResultsSection.tsx      # 统一结果表格 | Unified results table
│   ├── HelpDialog.tsx           # 新手引导对话框 | Onboarding help dialog
│   └── ui/                   # shadcn/ui 组件库
├── hooks/
│   ├── useGeocoding.ts        # 坐标转换 Hook | Geocoding hook
│   └── useOverpassQuery.ts    # 面域/POI 查询 Hook | Overpass query hook
├── utils/
│   ├── geocoding.ts           # 地理编码 + Overpass QL 查询 | Geocoding + Overpass QL
│   ├── coordTransform.ts      # GCJ-02/BD-09 ⇄ WGS-84 坐标转换 | Coordinate transform
│   └── exportUtils.ts         # 导出 CSV / GeoJSON / KML | Export utilities
├── i18n/
│   └── locales/              # 翻译文件 zh.json / en.json
└── lib/
    └── utils.ts              # 工具函数
```

---

## 在线演示 | Live Demo

🔗 https://andyxu12341.github.io/Geocoding-China-Pro/

---

## License

MIT License
