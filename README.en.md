# Geocoding-China-Pro (Spatial Data Workstation)

Batch Geocoding Converter — Convert address names to longitude/latitude coordinates instantly.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Background

As an urban planning student, I frequently need to convert large amounts of address data into coordinates. After researching, I found that most similar projects on GitHub are no longer accessible, and existing domestic online tools lack sufficient batch processing capabilities.

So I built this tool to help others with the same needs avoid tedious manual work.

> This project is inspired by [mapLocation](https://github.com/sjfkai/mapLocation) and similar tools.

## Features

### Core Capabilities
- **Multi-source Geocoding** — Supports Amap, Baidu Maps, and OpenStreetMap
- **Intelligent Dual Engine** — Amap as primary engine + POI fallback engine, automatic fallback
- **Cross-region Validation** — Automatically verifies coordinates match the address province/city
- **Batch Processing** — Supports large-scale CSV/Excel data with batching
- **Smart Retry** — Failed requests auto-retry with resume capability
- **Request Caching** — Identical requests within 1 hour return cached results instantly
- **Multi-candidate Selection** — When Amap returns multiple results, choose the best match

### Data Input
- Text paste (one address per line)
- CSV file upload
- Excel file upload (.xlsx / .xls)
- Category grouping with color-coded markers

### Map Visualization
- Nine domestic/international tile layers (Amap, OpenStreetMap, Esri Satellite, Amap Satellite, Geoq, Tianditu, Tianditu Satellite, CARTO Dark)
- Category color markers
- Auto-fit all coordinate points
- Real-time progress tracking

### Area Query (OSM)
- Query building/residential/park/commercial/administrative polygons from OpenStreetMap
- Render polygon overlays on the map

### Export Formats
- CSV — for spreadsheet analysis
- GeoJSON — for GIS software (QGIS, ArcGIS)
- KML — for Google Earth
- PNG — map screenshot

### Statistics & History
- Statistics panel with pie chart (success/failure rate) and bar chart (category distribution)
- LocalStorage-persisted history (last 20 sessions, survives page refresh)

## Quick Start

### Install Dependencies

```bash
npm install
# or with bun
bun install
```

### Start Development Server

```bash
npm run dev
```

### Build for Production

```bash
npm run build
```

## Configuration Guide

### Amap API Key (Recommended)

1. Visit [Amap Open Platform Console](https://console.amap.com/dev/key/app)
2. Create a Web Service type Key
3. No domain binding required

### Baidu Maps API Key

1. Visit [Baidu Maps Open Platform](https://lbsyun.baidu.com/)
2. Create a Browser application
3. Copy the AK

### OpenStreetMap (No Key Required)

Free to use, but rate-limited (1 request/second)

## Usage

### Basic Flow

1. Select data source (Amap recommended)
2. Enter API Key
3. Optional: Set region filter (e.g., "Shandong Province")
4. Enter addresses (paste text or upload file)
5. Click "Start Conversion"
6. View map and results table
7. Export in desired format

### Address Formats

Supports any Chinese address format:
- `北京市朝阳区建国路88号`
- `上海市浦东新区陆家嘴金融中心`
- `浙江省杭州市西湖区龙井路1号`

## Tech Stack

- **Frontend**: React 18 + TypeScript
- **Build Tool**: Vite
- **UI Components**: shadcn/ui (Radix UI)
- **Map Library**: Leaflet
- **Styling**: Tailwind CSS
- **Data Processing**: PapaParse, XLSX
- **Charts**: Recharts
- **i18n**: i18next + react-i18next

## Project Structure

```
src/
├── pages/
│   └── Index.tsx      # Main page
├── components/
│   ├── GeoMap.tsx     # Map component
│   └── ui/            # UI component library
├── utils/
│   ├── geocoding.ts   # Core geocoding logic
│   └── exportUtils.ts # Export utilities
├── i18n/
│   ├── index.ts       # i18next configuration
│   └── locales/       # Translation files (zh.json, en.json)
└── lib/
    └── utils.ts       # Utilities
```

## Live Demo

Visit https://andyxu12341.github.io/Geocoding-China-Pro/

## License

MIT License
