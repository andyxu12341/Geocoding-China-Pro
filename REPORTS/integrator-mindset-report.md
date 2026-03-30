# 经验教训报告：Geocoding-China-Pro

**日期**: 2026-03-31
**主题**: 从手艺人思维转向集成商思维——同类问题诊断与修复方案

---

## 一、核心教训

### 手艺人思维的典型特征

> "我知道这个 API 会返回什么，我用自己的逻辑去覆盖它的排序"

这次 bug 的根源：

```typescript
// 亲手写了一套质量评分
const priority = { poi: 1, street: 2, city: 3, unknown: 4 };
pois.sort((a, b) => priority[a.qualityLevel] - priority[b.qualityLevel]);
const best = pois[0]; // 取排序后的第一条
```

高德 POI API 自己对"北京故宫"的排序是：故宫博物院 → 故宫博物院-午门 → 景运门故宫餐厅……这条排序是**高德搜索引擎的核心能力**，包含用户点击行为、语义相关性、热度等多维度信号。我们用手写的正则质量判断把它覆盖了，导致"故宫博物院"被误判为 `city` 级别（因为它不在关键词列表里），排序后反而不敌"北京市"。

### 集成商思维的核心原则

1. **API 的排序就是答案**：不要对返回结果重新排序，除非你有比这个 API 更多的领域数据
2. **优先使用官方参数**：先研究 API 的 `extensions`、`sortrule`、`children` 等原生参数，再考虑后处理
3. **把人力花在 API 边界上**：真正需要手写逻辑的地方，是 API 覆盖不到的场景（多 API 并行、降级、缓存）

---

## 二、问题清单与修复方案

### 问题 1 — `qualityCheckPOI` 误判 POI 质量（已修复 ✅）

**文件**: `src/utils/geocoding.ts:468`

**症状**: "北京故宫"返回"北京市"，"上海东方明珠"返回"上海市"

**根因**: 手写正则分类逻辑，关键词列表不完整，无法覆盖所有地标类型

```typescript
// 旧代码：正则永远写不全
if (/(博物院|塔|广场|大厦|中心|酒店|...)/.test(combined) || name.length >= 3) {
  return "poi";
}
```

**修复方案**: POI 搜索直接取第一条，不做重新排序。API 原生排序已足够权威。

```typescript
// 新代码
const pois = await searchGaodePOI(address, apiKey, region);
if (pois.length > 0) {
  return pois[0]; // 直接信任 API 排序
}
```

**状态**: ✅ 已修复并推送

---

### 问题 2 — `geocodeGaodeFallback` 中 `LEVEL_RANK` 同样会干扰排序

**文件**: `src/utils/geocoding.ts:419-430, 641-656`

**症状**: 如果 POI 搜索返回空，fallback 到地理编码 API 时，同样存在 `LEVEL_RANK` 排序

**根因**: 地理编码 API 对"北京故宫"返回多条结果，其中"故宫博物院"是 `poi` 级别（rank=1），"北京市"是 `city` 级别（rank=5）。排序逻辑是 rank 小的优先，所以故宫博物院理论上会排在前面。但一旦 POI 搜索失败，fallback 的排序逻辑和 POI 路径一样脆弱——如果高德返回的 geocodes 列表里"故宫博物院"排在"北京市"后面（受 city 参数影响），我们的 LEVEL_RANK 排序就会把它拉上来。

**修复方案**:

方案 A（推荐）：在 fallback 中**不对地理编码结果重新排序**，直接取第一条。地理编码 API 的 `level` 字段本身就是排序依据，不需要我们额外处理。

```typescript
// 在 geocodeGaodeFallback 中
if (data.geocodes?.length) {
  const first = data.geocodes[0]; // 直接信任 API 排序
  const [gcjLng, gcjLat] = first.location.split(",").map(Number);
  const [wgsLng, wgsLat] = gcj02towgs84(gcjLng, gcjLat);
  return { address, lng: wgsLng.toFixed(6), lat: wgsLat.toFixed(6),
           formattedAddress: first.formatted_address, source: "gaode", status: "success" };
}
```

方案 B：如果一定要按 specificity 过滤，过滤掉 `city` 以上的结果后取第一个：

```typescript
const specific = data.geocodes.filter(g => g.level !== "city" && g.level !== "province");
if (specific.length) return specific[0]; // 只过滤，不排序
return data.geocodes[0]; // 没有具体结果时用第一条
```

---

### 问题 3 — `extractKeywords` / `PROVINCE_REGEX` 不再使用但仍存在

**文件**: `src/utils/geocoding.ts:415, 440-444`

**症状**: 代码体积冗余，误导后续维护者

**根因**: Search-First 重构后，这些函数从主流程中移除，但未清理

**修复方案**: 删除 `PROVINCE_REGEX` 和 `extractKeywords`，删除 `LEVEL_RANK`（如果 fallback 也改为不排序）

```typescript
// 删除以下内容：
const PROVINCE_REGEX = /(...)/;
const LEVEL_RANK = { poi: 1, ... };
function extractKeywords(address: string): string { ... }
function levelPriority(level: string | undefined): number { ... }
```

---

### 问题 4 — `queryGaodePOI` 矩形查询使用 `wgs84togcj02` + 字符串拼接

**文件**: `src/utils/geocoding.ts:1302-1306`

**现状**: 已使用 `transformBbox`，实现正确

```typescript
const [gcjSouth, gcjWest, gcjNorth, gcjEast] = transformBbox(bbox, wgs84togcj02);
const rect = `${gcjWest},${gcjSouth},${gcjEast},${gcjNorth}`;
```

**评价**: 正确使用了 `transformBbox`，无同类问题

---

### 问题 5 — `queryBaiduPOI` 百度 POI 查询参数可能不完整

**文件**: `src/utils/geocoding.ts:1357-1422`

**现状**: 使用 `place/v2/search`（旧版），百度目前推荐 `place/v3`（新版，支持 `ret_coordtype`）

**修复方案**: 升级到 `place/v3` 并指定 `ret_coordtype=gcj02ll`：

```typescript
const url = new URL("https://api.map.baidu.com/place/v3/search");
url.searchParams.set("query", typeCode ? `${typeCode}${keyword}` : keyword);
url.searchParams.set("tag", typeCode);
url.searchParams.set("ak", apiKey);
url.searchParams.set("output", "json");
url.searchParams.set("scope", "2"); // scope=2 返回详细信息
url.searchParams.set("ret_coordtype", "gcj02ll"); // 指定返回 GCJ-02 坐标
url.searchParams.set("page_size", "50");
url.searchParams.set("page_num", "0");
if (region) url.searchParams.set("region", region);
```

---

### 问题 6 — `queryBaiduPOI` 过滤逻辑缺失

**文件**: `src/utils/geocoding.ts:1406-1421`

**现状**: 所有 `location` 存在的 POI 都返回，没有坐标校验

**修复方案**: 增加边界校验（与高德一致）

```typescript
.filter(r => r.location && r.location.lat > 0 && r.location.lng > 0)
```

---

### 问题 7 — `geocodeBaidu` 依赖 JSONP，存在超时不确定性

**文件**: `src/utils/geocoding.ts:372-397, 683`

**现状**: 百度浏览器端 AK 限制 CORS，用 JSONP 绕过。JSONP 的 `callback` 参数依赖全局函数，在高频并发场景下可能冲突。

**修复方案**: 保持 JSONP 不变（百度官方推荐方式），但增加更可靠的超时处理：

```typescript
function jsonp<T>(url: string, timeout = 8000): Promise<T> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (!settled) { settled = true; reject(new Error(`JSONP 超时: ${url}`)); }
    }, timeout);

    const cbName = `__geo_${Date.now()}_${_jsonpCounter++}`;
    (window as any)[cbName] = (data: T) => {
      if (settled) return;
      settled = true; clearTimeout(timer);
      const el = document.getElementById(cbName);
      if (el) el.remove();
      resolve(data);
    };
    const script = document.createElement("script");
    script.id = cbName;
    script.src = `${url}${url.includes('?') ? '&' : '?'}callback=${cbName}`;
    script.onerror = () => { if (!settled) { settled = true; clearTimeout(timer); reject(new Error("JSONP 加载失败")); } };
    document.head.appendChild(script);
  });
}
```

---

### 问题 8 — `getStandardizedTags` 手写 OSM tag → GB 颜色映射

**文件**: `src/utils/geocoding.ts:241-305`

**现状**: 用手写 `LANDUSE_STANDARD_MAP` 将 OSM 标签映射到国土空间制图规范的分类和颜色

**评价**: 这是**合理的映射工作**，不是 AI 猜测。有明确的 GB 标准做依据。无需修改，但建议添加映射覆盖率测试。

**优化方向**: 如果 GB 标准有公开的 JSON 数据表，用数据驱动替代手写 map

---

## 三、修复优先级

| 优先级 | 问题 | 改动量 | 风险 |
|--------|------|--------|------|
| P0 | `geocodeGaodeFallback` 排序 | 小 | 低 |
| P0 | 删除 `extractKeywords`/`LEVEL_RANK`/`PROVINCE_REGEX` | 小 | 低 |
| P1 | `queryBaiduPOI` 升级到 v3 API | 小 | 低 |
| P2 | `geocodeBaidu` JSONP 健壮性 | 小 | 低 |
| P3 | `getStandardizedTags` 数据驱动化 | 中 | 低 |

---

## 四、预防机制

### 代码 review checklist：看到以下模式立即质疑

1. **对 API 返回结果做排序/过滤** → 问：API 本身有没有排序参数？原生排序够用吗？
2. **手写正则做分类/质量判断** → 问：有没有官方字段或官方分类体系可以替代？
3. **多个 API 并行调用后合并** → 问：各 API 的排序逻辑不同，合并后谁来定优先级？
4. **关键词提取/地址解析逻辑** → 问：这个逻辑高德/百度有没有现成的 API 参数？
5. **硬编码坐标或地区列表** → 问：有没有 npm 包或 JSON 数据可以替代？

### 技术债务登记

本次发现的技术债务：
- `test_amap_api.js` 测试脚本混入仓库 → 需移入 `scripts/` 或删除
- `console.log` 调试日志未清理 → 需统一管理日志级别
- `LANDUSE_STANDARD_MAP` 无测试覆盖 → 建议补充 unit test
