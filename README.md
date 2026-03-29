# Geocoding-China-Pro (空间数据工作站)

批量地理编码转换器 | 地址名一键转经纬度坐标

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## 背景介绍

作为一名城乡规划专业的大学生，日常需要处理大量地址数据的坐标转换。调研后发现，GitHub 上虽然已有一些同类项目（如 Batch.Geocoder.io 等），但这些网站目前大多已无法访问，而国内现有的在线工具在批量处理能力上也有所欠缺。

于是决定自己动手，用 Web 技术实现了这个工具，希望帮助有相同需求的人省去繁琐的手动操作。

> 本项目受 [Batch.Geocoder.io](https://web.archive.org/web/20210301000000*/batchgeocoder.com) 等同类项目启发。

## 功能特性

### 核心功能
- **多源地理编码** - 支持高德地图、百度地图、OpenStreetMap 三种数据源
- **智能双引擎** - 高德主引擎 + POI备选引擎，自动降级
- **跨区域校验** - 自动验证经纬度与地址省份/城市是否匹配
- **批量处理** - 支持大规模 CSV/Excel 数据分批处理
- **智能重试** - 失败自动重试，断点续传

### 数据输入
- 文本粘贴（每行一个地址）
- CSV 文件上传
- Excel 文件上传（.xlsx / .xls）
- 支持按分类字段分组，彩色标注

### 地图可视化
- 三种底图切换（标准/卫星/暗色）
- 分类颜色标记
- 自动聚焦所有坐标点
- 实时进度跟踪

### 导出格式
- CSV - 表格数据分析
- GeoJSON - GIS 软件（QGIS、ArcGIS）
- KML - Google Earth
- PNG - 地图截图

## 快速开始

### 安装依赖

```bash
npm install
# 或使用 bun
bun install
```

### 启动开发服务器

```bash
npm run dev
```

### 构建生产版本

```bash
npm run build
```

## 配置指南

### 高德地图 API Key（推荐）

1. 访问 [高德开放平台控制台](https://console.amap.com/dev/key/app)
2. 创建 Web Service 类型 Key
3. 无需配置域名绑定

### 百度地图 API Key

1. 访问 [百度地图开放平台](https://lbsyun.baidu.com/)
2. 创建浏览器端应用
3. 复制 AK

### OpenStreetMap（无需 Key）

免费使用，但有请求频率限制（1次/秒）

## 使用说明

### 基本流程

1. 选择数据源（推荐高德地图）
2. 输入 API Key
3. 可选：设置区域筛选（如"山东省"）
4. 输入地址（文本粘贴或文件上传）
5. 点击「开始转换」
6. 查看地图和结果表格
7. 导出所需格式

### 地址格式

支持任意中文地址格式：
- `北京市朝阳区建国路88号`
- `上海市浦东新区陆家嘴金融中心`
- `浙江省杭州市西湖区龙井路1号`

## 技术栈

- **前端框架**: React 18 + TypeScript
- **构建工具**: Vite
- **UI 组件**: shadcn/ui (Radix UI)
- **地图库**: Leaflet
- **样式**: Tailwind CSS
- **数据处理**: PapaParse, XLSX

## 项目结构

```
src/
├── pages/
│   └── Index.tsx      # 主页面
├── components/
│   ├── GeoMap.tsx     # 地图组件
│   └── ui/           # UI 组件库
├── utils/
│   ├── geocoding.ts  # 地理编码核心逻辑
│   └── exportUtils.ts # 导出功能
└── lib/
    └── utils.ts      # 工具函数
```

## 在线演示

访问 https://andyxu12341.github.io/Geocoding-China-Pro/ 查看在线演示。

## License

MIT License
