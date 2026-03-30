# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Conventional Commits](https://www.conventionalcommits.org/).

---

## [1.0.0](https://github.com/andyxu12341/Geocoding-China-Pro/compare/v0.0.0...v1.0.0) (2026-03-31)

### Features

* add 9 domestic/international map tile providers for China users
* add category column to results table; extend region filter to OSM
* add OSM area query — query building/residential/park/commercial/administrative polygons from Overpass API
* add request deduplication, caching, statistics panel, history, amap multi-candidate selection, and i18n
* apply official Gaode types codes and add poi_hotel type
* search-first geocoding engine (POI search is always first)
* smart 3-step geocoding engine with level-ranked candidates
* Tab B POI query — grouped select, OSM/Gaode/Baidu POI, unified spatial results
* WebGIS Tabs architecture — TabA geocoding / TabB area extraction + four-dimensional area engine + leaflet-draw

### Bug Fixes

* GeoMap auto-transforms WGS-84 data to GCJ-02 when Gaode basemap is active
* eliminate duplicate progress UI, enforce GCJ-02/BD-09→WGS-84 in Tab A, add POI diagnostics
* eliminate stale-cache poisoning + mandatory audit logging on all transforms
* GCJ-02/BD-09 to WGS-84 coordinate transformation for Gaode/Baidu POI
* gcoord API usage + aggressive logging chain for silent-fail debugging
* INVALID_PARAMS, transformBbox swap, coordinate wash for Tab A & B
* restore Tab A progress UI and eliminate Gaode/Baidu silent failures
* simplify geocodeGaode - trust POI API ranking, remove custom quality sort
* restore correct base path for GitHub Pages

### Technical Architecture

* clean up integrator mindset fixes
* export searchNominatim and NominatimResult for reuse
* extract pure functions, remove dead code, fix async/await
* extract Tab A into GeocodingPanel.tsx
* replace hand-rolled coord transform with gcoord library
* unify export functions with combined exports
*抽离useGeocoding和useOverpassQuery两个Custom Hooks，精简Index.tsx约60行
* 提取ResultsSection组件，统一预览表格和导出菜单

### Documentation

* sync README with search-first architecture
* update README with coord transform, HelpDialog, official Amap codes
* update README with POI features, unified export, and new project structure
* 更新README为完整中英双语版
