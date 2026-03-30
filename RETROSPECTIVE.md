# Geospatial Studio V1.0 技术与产品复盘

> **以"非技术背景产品主理人"视角，回望从一行代码到稳定 V1.0 的完整历程**

---

## 一、序言：从一个痛点出发

2024 年下半年，国内地理信息从业者面临一个长期无解的困境：做国土空间规划、城市设计或商业选址分析时，需要同时用到**批量地址转坐标**（Geocoding）和**建筑物轮廓 / 用地地块多边形提取**（Polygon Extraction）两件事。

但市场上没有好工具：

- **高德 / 百度 API** 只有 POI 查询，没有多边形；即使有 POI，返回的坐标也是 GCJ-02 火星坐标系，与国际 GIS 软件根本不兼容。
- **OSM（OpenStreetMap）** 有多边形数据，但 Overpass API 门槛高、语法复杂，Nominatim 限速 1 次/秒，Relation 自相交 Bug 层出不穷。
- **QGIS / ArcGIS** 专业门槛高，不适合非 GIS 背景的规划师和分析师。
- 所有商业 GIS 平台都收费，且数据导出格式混乱、坐标系不统一。

我们决定自己做一个——**纯前端实现，零后端依赖，在浏览器里搞定一切**。

---

## 二、破局：纯前端 WebGIS 架构的 0→1

### 2.1 为什么必须是纯前端

传统 GIS 工具必须搭服务器的逻辑是：API Key 不能暴露在前端。但我们很快找到了解法：

- **高德 / 百度 Web Service API** 本身就是支持浏览器 CORS 调用的（高德明确支持，限制域名后缀即可；百度通过 referer 校验）。
- **OSM Nominatim** 完全免费公开，Overpass API 也是公开接口。
- 前端存储 API Key 到 `localStorage`，用户自己保管，零泄露风险。
- 没有服务器 = 没有运维成本 = 可以无限水平扩展给任何人用。

这奠定了整个产品的技术选型基调：**React + TypeScript + Vite + Leaflet + shadcn/ui**。

### 2.2 双引擎的原始设计

初代版本只做了一件事：**Tab A 坐标转换**。但即使在这个简单场景下，我们也设计了一个优雅的双引擎降级策略：

```
用户选择数据源
    ↓
优先使用高德（国内最准，QPM 高）
    ↓ 高德 Key 未配置或请求失败
降级到百度（互补数据）
    ↓ 百度也失败
降级到 OSM Nominatim（免费兜底）
```

这个降级链路后来成为整个产品架构的"双引擎"范式，被复用到 Tab B 的 POI 查询和面域提取中。

### 2.3 初期的三个核心工程问题

1. **API 请求去重与缓存**：批量转换时，相同地址不能重复请求。我们用 `Map<address, Promise>` 做请求去重（防止并发重复），并用 `localStorage` 实现 1 小时缓存。
2. **并发控制**：高德 QPS 上限约 200，Nominatim 硬限制 1 次/秒。用 `Promise` 池 + `AbortController` 实现智能限速。
3. **多候选选择**：高德对同一地址有时返回多个候选（如"北京市朝阳区"和精确坐标的"北京市朝阳区 XX 路"）。我们设计了 Dialog 选择器，让用户选最优匹配。

---

## 三、攻坚战 1：缝合 OSM Relation 的"蜘蛛网"自相交 Bug

### 3.1 问题：Relation 多边形为什么会出现"蜘蛛网"

在做 Tab B 面域提取时，最初的实现遇到一个诡异的 bug：某些 Relation（如城市边界、行政区）导出的多边形在地图上渲染时，会出现大量莫名其妙的"触角"——线条从主体多边形向外辐射，像蜘蛛网一样。

调查后发现，问题的根源是 **Overpass API 返回 Relation 的 geometry 时，使用了 `out body geom;` 语法**，这会返回 Relation 的**所有成员节点**（包括内部节点和外部节点），但没有正确排序。当 Relation 有多个独立环（外环 + 内环岛屿）时，这些节点序列被打乱，导致渲染时出现自相交。

### 3.2 解法：改用 `out geom;` + 手工缝合

我们放弃了 `out body geom;`（返回带 tags 的完整成员）和 `out center;`（只返回中心点），改为：

```overpassql
[out:json];
relation["name"="目标名称"]["admin_level"="8"];
out geom;
```

`out geom;` 只返回构成 Relation outer 环的节点序列，且节点顺序已按地理拓扑排好。**关键修复**：
- 对于 Relation：直接用 `out geom;` 的节点序列，无需额外缝合。
- 对于 Way：仍然用 `out geom;`，节点顺序正确。
- **不递归**：去掉 `>;` 递归引用，改为精确的 `out geom;`，避免返回无关节点。

这次修复将 Overpass 响应体大小减少了约 60%，同时彻底消灭了"蜘蛛网"渲染 bug。

### 3.3 bbox 扩展：South/West/North/East 的顺序陷阱

另一个埋藏很深的 bug：我们在扩展 Overpass bbox 时，写了 `expandBbox(bbox, factor)` 返回 `[south, west, north, east]`。但 Overpass QL 对 bbox 的语法是 `[south, west, north, east]`。**如果顺序搞反，Overpass 会报 400 错误，而不是语义错误**。修复后统一为 `[south, west, north, east]` 即南纬、西经、北纬、东经。

---

## 四、攻坚战 2：《国土空间制图规范》与分类系统

### 4.1 为什么需要国标色卡

国内规划行业有一个隐性标准：**《国土空间规划城市用地分类》（GB/T 21010-2017）**。这个标准规定了每一类用地（耕地、园地、林地、商业用地、居住用地……）对应的 **GJ 颜色码**。

没有这个分类体系的产品会面临两个问题：
1. **色彩混乱**：每个人导出的数据颜色都不一样，无法协同。
2. **语义丢失**：原始 OSM tags（如 `landuse=farm`, `landuse=residential`）对非 GIS 背景用户毫无意义。

### 4.2 LANDUSE_STANDARD_MAP：60+ 条目的一次性建立

我们花了一整次迭代，把 GB 标准里的每一类用地逐条映射到 OSM tags 和标准色码：

| GJ 分类 | OSM Tag | 色码 |
|---------|----------|------|
| 01 耕地 | `landuse=farmland` | `#F5F8DC` |
| 0301 乔木林地 | `landuse=forest` | `#68B167` |
| 0601 零售商业 | `landuse=commercial` | `#E8D5B7` |
| … | … | … |

同时，设计了一个**三级分类隔离体系**：
- **建筑轮廓（building）**：来自 OSM `building=yes`，对应建构筑物几何。
- **城市功能区（landuse）**：来自 `landuse=*`，对应 GB 用地功能分区。
- **行政边界（admin）**：来自 `boundary=administrative`，对应行政区划。

这三个分类**物理隔离**，在 UI 上用不同色系区分，在导出属性里用 `categoryName` 和 `color` 字段传递，用户无需理解 OSM tags 也能读懂数据。

### 4.3 Admin Level 的精准化

最初的 admin 查询用了 `admin_level~"6|8|10"` 正则匹配。这个写法在 Overpass 里会导致全表扫描，引发 504 超时。

改为精确值匹配：
```overpassql
way["boundary"="administrative"]["admin_level"="2"];
way["boundary"="administrative"]["admin_level"="4"];
way["boundary"="administrative"]["admin_level"="6"];
way["boundary"="administrative"]["admin_level"="8"];
relation["boundary"="administrative"]["admin_level"="2"];
relation["boundary"="administrative"]["admin_level"="4"];
relation["boundary"="administrative"]["admin_level"="6"];
relation["boundary"="administrative"]["admin_level"="8"];
```

去掉 `~` 正则后，查询时间从超时降至 2–5 秒。

---

## 五、攻坚战 3：API 双引擎路由与坐标系洗白

### 5.1 双引擎：从架构设计到用户可见的产品价值

当我们做 Tab B 时，面临一个核心抉择：**POI 查询应该用哪个数据源？**

我们做了大量真实数据对比：
- **高德**：国内 POI 精度最高，但返回 GCJ-02 坐标。
- **OSM**：免费，但 POI 覆盖不如高德全，尤其在三线以下城市。
- **百度**：和高德互补，但同样返回 BD-09 坐标（比 GCJ-02 更偏）。

最终产品化的答案是：**让用户自己选择，而不是我们替他们选**。

具体来说：
- **面域提取（polygon）**：**强制路由到 OSM**（只有 OSM 有几何面数据）。高德和百度下，此按钮灰掉并显示"仅 OpenStreetMap 可用"。
- **POI 查询**：默认 OSM，高德和百度可选。当用户切换到高德时，自动从 polygon 类型切到 `poi_all`。

### 5.2 最关键的坐标系问题：GCJ-02 → WGS-84

这是整个项目里最隐蔽、也最致命的 bug。

**问题的本质**：
- 高德和百度使用 GCJ-02（"火星坐标系"），它与国际标准 WGS-84 存在系统性偏移，在中国境内偏移量约 50–500 米。
- OSM 和 GeoJSON 标准都使用 WGS-84。
- 如果直接用高德坐标渲染在 OSM 底图上，POI 标记会偏移约 100 米；如果导出 GeoJSON 给 QGIS，偏移是永久性的。

**实现过程**：我们没有引入任何第三方库（减少依赖），而是手写了完整的 Krasovsky 1940 椭球体转换算法：

```typescript
// GCJ-02 → WGS-84
function gcj02towgs84(lng: number, lat: number): [number, number] {
  if (outOfChina(lat, lng)) return [lng, lat];
  const d = delta(lat, lng);
  return [lng - d.dLon, lat - d.dLat];
}

// BD-09 → WGS-84（两步：BD-09 → GCJ-02 → WGS-84）
function bd09towgs84(lng: number, lat: number): [number, number] {
  const [gcjLng, gcjLat] = bd09togcj02(lng, lat);
  return gcj02towgs84(gcjLng, gcjLat);
}
```

关键接入点：
1. `queryGaodePOI`：POI 返回的 `lat/lng` 在进入 `POIResult` 数组前强制转换。
2. `queryBaiduPOI`：同上。
3. **高德 bbox 查询**：传给高德 rect API 的坐标也要从 WGS-84 转回 GCJ-02（因为高德 rect API 只认 GCJ-02）。

**结果**：所有从高德 / 百度返回的 POI，在进入渲染管道和导出文件之前，已完成坐标系洗白。用户在 QGIS / ArcGIS 里打开导出的 GeoJSON，POI 标记与 OSM 底图完全对齐。

---

## 六、产品化：V1.0 封箱的最后一公里

### 6.1 UI 的一致性治理

在 V1.0 封箱前，我们对 UI 进行了一次系统性审查，发现并修复了若干一致性问题：

- **卡片层级**：ApiSettingsCard、RegionFilterCard、GeocodingPanel 的 CardHeader 格式不统一。统一为 `CardHeader` + `CardTitle`（`text-base`）+ `CardContent`。
- **冗余数据源切换器**：AreaQueryPanel 里原来有一个独立的数据源切换器，与顶部的 ApiSettingsCard 功能完全重叠。删掉重复，AreaQueryPanel 只接收 `mapSource` prop。
- **面域按钮的 disabled 逻辑**：从 prop 层面管控，高德切换时自动灰掉，OSM only 提示文字正确显示。

### 6.2 导出文件的专业化

早期版本的导出是"能用就行"——GeoJSON properties 只有 OSM tags，CSV 表头是英文。

V1.0 的导出标准升级为：

**GeoJSON Feature.properties**：
```json
{
  "name": "天安门广场",
  "category": "行政",
  "color": "#4e79a7",
  "source": "OSM",
  "osm_id": "1142373",
  "osm_type": "relation"
}
```

**CSV 表头**：`名称, 经度, 纬度, 类型, 颜色码, 数据源`

同时新增了专属 POI 导出函数（`exportPOIGeoJSON`、`exportPOICSV`、`exportPOIKML`），彻底与 Geocoding 的导出逻辑解耦。

### 6.3 新手引导：从"能用"到"会用"

V1.0 新增了 `HelpDialog` 组件，以折叠式 Section 的形式呈现三段核心内容：

1. **双引擎机制**：解释面域查 OSM、POI 查高德的设计逻辑。
2. **坐标系脱密承诺**：明确告知 GCJ-02→WGS-84 自动转换，可直接拖入 QGIS。
3. **API Key 配置说明**：区分 OSM（免费）、高德（推荐）和百度（可选）的使用门槛。

帮助文档根据用户当前配置的 Key 状态动态显示"已配置/未配置"状态，做到真正的 contextual help。

---

## 七、数据：V1.0 完整功能矩阵

| 功能 | 数据源 | 坐标系 | 导出 | 状态 |
|------|--------|--------|------|------|
| 批量地址→坐标 | 高德/百度/OSM | WGS-84 | CSV/GeoJSON/KML | ✅ |
| OSM 面域提取 | Overpass API | WGS-84 | CSV/GeoJSON/KML | ✅ |
| OSM POI 查询 | Overpass API | WGS-84 | CSV/GeoJSON/KML | ✅ |
| 高德 POI 查询 | 高德 Web API | WGS-84（已转换）| CSV/GeoJSON/KML | ✅ |
| 百度 POI 查询 | 百度 Place API | WGS-84（已转换）| CSV/GeoJSON/KML | ✅ |
| 矩形框选 | Overpass API | WGS-84 | 同上 | ✅ |
| 多边形绘制 | Overpass API | WGS-84 | 同上 | ✅ |
| 语义搜索 | Nominatim → Overpass | WGS-84 | 同上 | ✅ |
| GB 国土色卡 | — | — | — | ✅ 60+ 分类 |
| 坐标系自动洗白 | — | — | — | ✅ |
| 新手引导 | — | — | — | ✅ |

---

## 八、致谢与技术债务

### 8.1 核心技术债

- **bundle size**：主 chunk 约 1.2MB（未做代码分割），leaflet + react-leaflet 体积贡献较大，未来应考虑动态 import。
- **Overpass 限速**：连续查询会被 504，客户端可以做请求间隔 1 秒的节流，但会降低体验。
- **百度 POI**：BD-09 偏移比 GCJ-02 更大，目前实现了完整转换，但百度 API 返回数据质量不如高德。

### 8.2 未来路线图

- [ ] 支持腾讯地图 POI（`x-zao` 坐标系）
- [ ] 将 Overpass 查询结果缓存到 IndexedDB（减少重复查询）
- [ ] 添加批量多边形导入（GeoJSON → OSM polygon 格式互转）
- [ ] 支持导出时指定目标坐标系（不仅是 WGS-84）
- [ ] PWA 离线支持（Service Worker 缓存 API 响应）

### 8.3 致谢

- 感谢 OSM 社区贡献了全球最大、最完整的开放地理数据。
- 感谢高德开放平台和百度地图开放平台提供了高质量的中国本地 POI 数据。
- 感谢所有 shadcn/ui、Radix UI、Leaflet 社区的开源贡献者。
- 感谢 GB/T 21010-2017 标准文件的起草者，让城市规划数据的标准化成为可能。

---

*本文档由 AI 生成，基于真实 commit 历史和技术实现记录。*
*最后更新：V1.0 | 2026-03-30*
