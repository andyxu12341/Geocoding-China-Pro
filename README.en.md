# Geocoding-China-Pro | Spatial Data Workstation

**空间数据工作站** — Batch Geocoding Converter & OpenStreetMap Polygon Extraction Tool

**Spatial Data Workstation** — 批量地理编码转换 & OpenStreetMap 面域数据提取工具

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![GitHub Stars](https://img.shields.io/github/stars/andyxu12341/Geocoding-China-Pro)](https://github.com/andyxu12341/Geocoding-China-Pro/stargazers)

---

## Core Features | 核心功能

### Tab A: Point Geocoding | 坐标转换
- **Multi-source Geocoding / 多源地理编码** — Amap, Baidu Maps, OpenStreetMap (all built-in)
- **Dual Engine / 智能双引擎** — Amap primary + POI fallback, automatic degradation
- **Cross-region Validation / 跨区域校验** — Automatically verifies coordinates match address province/city
- **Batch Processing / 批量处理** — Large-scale CSV/Excel with concurrent batching
- **Smart Retry / 智能重试** — Failed requests auto-retry with resume capability
- **Request Cache / 一小时缓存** — Identical requests within 1 hour return cached results instantly
- **Multi-candidate Selection / 多候选选择** — Choose the best match when Amap returns multiple results
- **Custom Category Coloring / 自定义分类着色** — Color-code coordinate points by category field

### Tab B: Polygon Extraction | 面域提取
- **OSM Polygon Query / OpenStreetMap 面域查询** — Extract building outlines, urban land-use, administrative boundaries from OSM
- **Draw Rectangle or Polygon / 多边形框选** — Rectangle or freehand polygon to precisely define query area
- **Semantic Search / 语义搜索** — Enter place name / POI / administrative district, auto-locate and extract surrounding polygons
- **Urban Land-use Coloring / 城市功能区分类** — 8-color city planning palette by OSM tags (residential / commercial / park / industrial / etc.)
- **Export GeoJSON & KML & CSV** — For QGIS, ArcGIS, Google Earth

### Map Visualization | 地图可视化
- **9 Tile Layers / 9 种底图** — Amap, OpenStreetMap, Esri Satellite, Amap Satellite, Geoq, Tianditu (Street/Satellite), CARTO Dark
- **Category Legend / 分类图例** — Aggregated by Chinese category names, no clutter
- **Auto-fit / 自动聚焦** — Automatically zoom to fit all query results
- **Real-time Progress / 实时进度条** — Shows processing progress, success/failure counts

### Data Input & Export | 数据输入 & 导出
- **Input / 输入** — Text paste, CSV upload, Excel upload (.xlsx / .xls)
- **Export Formats / 导出格式** — CSV / GeoJSON / KML / PNG map screenshot

---

## Quick Start | 快速开始

```bash
npm install
npm run dev    # Dev server → http://localhost:8083
npm run build  # Build for production
```

---

## Configuration Guide | 配置指南

### Amap API Key (Recommended | 推荐)
1. Visit [Amap Open Platform Console](https://console.amap.com/dev/key/app)
2. Create a Web Service type Key
3. No domain binding required

### Baidu Maps API Key
1. Visit [Baidu Maps Open Platform](https://lbsyun.baidu.com/)
2. Create a Browser application and copy the AK

### OpenStreetMap (No Key Required | 无需 Key)
Free to use, rate-limited to 1 request/second by default

---

## Tech Stack | 技术栈

- **Frontend**: React 18 + TypeScript
- **Build**: Vite
- **UI**: shadcn/ui (Radix UI)
- **Map**: Leaflet + leaflet-draw + leaflet.chinatmsproviders
- **Styling**: Tailwind CSS
- **Data Processing**: PapaParse, XLSX
- **Charts**: Recharts
- **i18n**: i18next + react-i18next
- **Animation**: Framer Motion

---

## Project Structure | 项目结构

```
src/
├── pages/
│   └── Index.tsx              # Main page
├── components/
│   ├── GeoMap.tsx             # Map component
│   ├── AreaQueryPanel.tsx     # Area query panel
│   ├── ResultsSection.tsx     # Unified results table
│   └── ui/                   # shadcn/ui component library
├── hooks/
│   ├── useGeocoding.ts        # Geocoding hook
│   └── useOverpassQuery.ts    # Overpass query hook
├── utils/
│   ├── geocoding.ts           # Core geocoding logic
│   └── exportUtils.ts         # Export utilities
├── i18n/
│   └── locales/              # Translation files zh.json / en.json
└── lib/
    └── utils.ts               # Utilities
```

---

## Live Demo | 在线演示

🔗 https://andyxu12341.github.io/Geocoding-China-Pro/

---

## License

MIT License
