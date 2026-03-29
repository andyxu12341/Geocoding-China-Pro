// ============================================================
// Geocoding Utility — Pure Frontend, Zero Backend
// Supports: Gaode (Amap) · Baidu · OpenStreetMap (Nominatim)
// ============================================================

export type MapSource = "gaode" | "baidu" | "osm";

export type AreaQueryType =
  | "building"    // 建筑
  | "residential" // 住宅区
  | "park"        // 景区/公园
  | "commercial"  // 功能区/商业
  | "administrative"; // 行政区

export const AREA_TYPE_LABELS: Record<AreaQueryType, string> = {
  building: "🏢 建筑",
  residential: "🏘️ 住宅区",
  park: "🏞️ 景区/公园",
  commercial: "🏬 功能区/商业",
  administrative: "🏛️ 行政区",
};

export const AREA_TYPE_DESCRIPTIONS: Record<AreaQueryType, string> = {
  building: "查询建筑物轮廓（如单体建筑、大型场馆）",
  residential: "查询居住用地边界（如住宅小区、居住组团）",
  park: "查询公园绿地、景区、旅游景点边界",
  commercial: "查询商业服务业设施用地边界",
  administrative: "查询行政区划边界（省/市/区/街道）",
};

export interface GeocodingConfig {
  source: MapSource;
  gaodeKey?: string;
  baiduKey?: string;
  regionFilter?: string;
  areaQueryType?: AreaQueryType;
}

export interface GeocodeItem {
  address: string;
  lng?: string;
  lat?: string;
  formattedAddress?: string;
  source?: MapSource;
  status: "success" | "failed";
  error?: string;
  category?: string;
  polygon?: number[][][]; // For area query results: [[[lng, lat], [lng, lat], ...]]
}

export interface AreaResult {
  name: string;
  type: AreaQueryType;
  osmId: number;
  osmType: string;
  tags: Record<string, string>;
  polygon: number[][][];
  center?: { lat: number; lng: number };
}

export interface BatchProgress {
  completed: number;
  total: number;
  latestResult?: GeocodeItem;
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const DELAY_MS: Record<MapSource, number> = {
  gaode: 340,
  baidu: 340,
  osm: 1100,
};

// JSONP helper (for Baidu which blocks CORS)
let _jsonpCounter = 0;
function jsonp<T>(url: string, timeout = 8000): Promise<T> {
  return new Promise((resolve, reject) => {
    const cbName = `__geocode_cb_${Date.now()}_${_jsonpCounter++}`;
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error("JSONP 请求超时"));
    }, timeout);

    function cleanup() {
      clearTimeout(timer);
      delete (window as unknown as Record<string, unknown>)[cbName];
      script.remove();
    }

    (window as unknown as Record<string, unknown>)[cbName] = (data: T) => {
      cleanup();
      resolve(data);
    };

    const script = document.createElement("script");
    const sep = url.includes("?") ? "&" : "?";
    script.src = `${url}${sep}callback=${cbName}`;
    script.onerror = () => { cleanup(); reject(new Error("JSONP 脚本加载失败")); };
    document.head.appendChild(script);
  });
}

async function withRetry<T>(fn: () => Promise<T>, maxRetries = 3): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt < maxRetries - 1) {
        await sleep(800 * (attempt + 1));
      }
    }
  }
  throw lastErr;
}

// ── Regex for full-string province/city scanning ──
const PROVINCE_REGEX = /(内蒙古|黑龙江|呼和浩特|石家庄|乌鲁木齐|北京|天津|上海|重庆|河北|山西|辽宁|吉林|江苏|浙江|安徽|福建|江西|山东|河南|湖北|湖南|广东|海南|四川|贵州|云南|陕西|甘肃|青海|台湾|广西|西藏|宁夏|新疆|香港|澳门|太原|沈阳|长春|哈尔滨|南京|杭州|合肥|福州|南昌|济南|青岛|郑州|武汉|长沙|广州|深圳|南宁|海口|成都|贵阳|昆明|拉萨|西安|兰州|西宁|银川|大连|厦门|宁波|苏州|无锡|佛山|东莞|珠海|温州|常州|烟台|潍坊|绍兴|泉州|嘉兴|南通|金华|徐州|惠州)/;

/**
 * Extract location hint from the input address using full-string regex scan.
 * Searches the ENTIRE string (including inside parentheses) for province/city names.
 * Returns the first match, or null if nothing found.
 */
function extractLocationHint(address: string): string | null {
  // Normalize parentheses for uniform scanning
  const normalized = address.replace(/[（）]/g, m => m === "（" ? "(" : ")");
  const match = normalized.match(PROVINCE_REGEX);
  return match ? match[1] : null;
}

/**
 * Sanity Check: verify that the geocode result's province/city matches the address hint.
 * Returns true if the result looks plausible, false if it's a cross-province mismatch.
 */
function sanityCheck(
  hint: string | null,
  province: string | undefined,
  city: string | undefined,
  formattedAddress: string | undefined,
): boolean {
  if (!hint) return true; // no hint to check against, trust the result
  const fields = [province, city, formattedAddress].filter(Boolean).join("");
  return fields.includes(hint);
}

// Gaode (Amap) — Primary engine: geocode API
async function geocodeGaodePrimary(address: string, apiKey: string, region?: string): Promise<{
  item: GeocodeItem;
  province?: string;
  city?: string;
}> {
  let url = `https://restapi.amap.com/v3/geocode/geo?key=${encodeURIComponent(apiKey)}&address=${encodeURIComponent(address)}&output=json`;
  if (region) url += `&city=${encodeURIComponent(region)}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json() as {
    status: string; info: string;
    geocodes?: Array<{
      location: string;
      formatted_address: string;
      province: string;
      city: string;
    }>;
  };
  if (data.status !== "1" || !data.geocodes?.length) {
    return {
      item: { address, status: "failed", source: "gaode", error: data.info || "匹配失败: 未找到有效坐标" },
    };
  }
  const g = data.geocodes[0];
  if (!g.location) {
    return {
      item: { address, status: "failed", source: "gaode", error: "匹配失败: 返回坐标为空" },
    };
  }
  const [lng, lat] = g.location.split(",");
  return {
    item: { address, lng, lat, formattedAddress: g.formatted_address, source: "gaode", status: "success" },
    province: g.province,
    city: typeof g.city === "string" ? g.city : undefined,
  };
}

// Gaode (Amap) — Fallback engine: POI text search API
async function geocodeGaodePOI(address: string, apiKey: string, region?: string): Promise<GeocodeItem> {
  let url = `https://restapi.amap.com/v3/place/text?keywords=${encodeURIComponent(address)}&key=${encodeURIComponent(apiKey)}&offset=1&output=json`;
  if (region) url += `&city=${encodeURIComponent(region)}&citylimit=true`;
  const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json() as {
    status: string; info: string;
    pois?: Array<{ location: string; name: string; address: string }>;
  };
  if (data.status !== "1" || !data.pois?.length) {
    return { address, status: "failed", source: "gaode", error: "匹配失败: POI搜索未找到结果" };
  }
  const poi = data.pois[0];
  if (!poi.location) {
    return { address, status: "failed", source: "gaode", error: "匹配失败: POI返回坐标为空" };
  }
  const [lng, lat] = poi.location.split(",");
  const formattedAddress = poi.address && poi.address !== "[]" ? `${poi.name} (${poi.address})` : poi.name;
  return { address, lng, lat, formattedAddress, source: "gaode", status: "success" };
}

/**
 * Gaode Smart Dual-Engine: geocode API → sanity check → POI fallback
 */
async function geocodeGaode(address: string, apiKey: string, region?: string): Promise<GeocodeItem> {
  const hint = extractLocationHint(address);

  // ── Engine 1: Geocode API ──
  try {
    const primary = await geocodeGaodePrimary(address, apiKey, region);
    if (primary.item.status === "success") {
      const plausible = sanityCheck(hint, primary.province, primary.city, primary.item.formattedAddress);
      if (plausible) {
        return primary.item;
      }
    }
  } catch {
    // Primary threw — fall through
  }

  // ── Engine 2: POI Text Search (fallback) ──
  try {
    const fallback = await geocodeGaodePOI(address, apiKey, region);
    return fallback;
  } catch {
    return { address, status: "failed", source: "gaode", error: "匹配失败: 引擎无响应" };
  }
}

// Baidu
async function geocodeBaidu(address: string, apiKey: string, region?: string): Promise<GeocodeItem> {
  type BaiduResp = { status: number; result?: { location: { lng: number; lat: number }; level: string } };
  let url = `https://api.map.baidu.com/geocoding/v3/?address=${encodeURIComponent(address)}&output=json&ak=${encodeURIComponent(apiKey)}&ret_coordtype=gcj02ll`;
  if (region) url += `&city=${encodeURIComponent(region)}`;
  const data = await jsonp<BaiduResp>(url);
  if (data.status !== 0 || !data.result?.location) {
    return { address, status: "failed", source: "baidu", error: `百度API返回错误码 ${data.status}` };
  }
  const { lng, lat } = data.result.location;
  return {
    address,
    lng: lng.toFixed(6),
    lat: lat.toFixed(6),
    formattedAddress: address,
    source: "baidu",
    status: "success",
  };
}

// OpenStreetMap Nominatim
async function geocodeOSM(address: string, region?: string): Promise<GeocodeItem> {
  let q = address;
  if (region) q = `${address}, ${region}`;
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=1&addressdetails=0`;
  const res = await fetch(url, {
    headers: {
      "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
      "User-Agent": "Geocoding-China-Pro/1.0 (https://github.com/andyxu12341/Geocoding-China-Pro)",
    },
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json() as Array<{ lat: string; lon: string; display_name: string }>;
  if (!data.length) {
    return { address, status: "failed", source: "osm", error: "Nominatim 未找到结果" };
  }
  return {
    address,
    lng: parseFloat(data[0].lon).toFixed(6),
    lat: parseFloat(data[0].lat).toFixed(6),
    formattedAddress: data[0].display_name,
    source: "osm",
    status: "success",
  };
}

/** Normalize raw error messages into user-friendly Chinese text */
function friendlyError(raw: string): string {
  if (/timeout|超时/i.test(raw)) return "匹配失败: 请求超时";
  if (/network|fetch|ERR_/i.test(raw)) return "匹配失败: 网络异常";
  if (/HTTP\s*[45]\d{2}/i.test(raw)) return "匹配失败: 服务端错误";
  if (/key|密钥|invalid/i.test(raw)) return "匹配失败: API Key无效";
  if (/JSONP/i.test(raw)) return "匹配失败: 跨域请求失败";
  if (raw.startsWith("匹配失败")) return raw;
  if (raw === "已取消") return raw;
  return "匹配失败: 未找到有效坐标";
}

async function geocodeOne(address: string, config: GeocodingConfig): Promise<GeocodeItem> {
  const region = config.regionFilter?.trim() || undefined;
  return withRetry(async () => {
    switch (config.source) {
      case "gaode":
        if (!config.gaodeKey) throw new Error("缺少高德 API Key");
        return geocodeGaode(address, config.gaodeKey, region);
      case "baidu":
        if (!config.baiduKey) throw new Error("缺少百度 API Key");
        return geocodeBaidu(address, config.baiduKey, region);
      case "osm":
        return geocodeOSM(address, region);
    }
  });
}

export async function geocodeBatch(
  addresses: string[],
  config: GeocodingConfig,
  onProgress: (progress: BatchProgress) => void,
  signal?: AbortSignal,
  addressToCategory?: Map<string, string>,
): Promise<GeocodeItem[]> {
  const results: GeocodeItem[] = [];
  const total = addresses.length;
  const delay = DELAY_MS[config.source];

  // Nominatim requires at least 1s between requests; add initial delay to avoid burst
  if (config.source === "osm" && !signal?.aborted) {
    await sleep(delay);
  }

  for (const address of addresses) {
      if (signal?.aborted) {
        results.push({ address, status: "failed", error: "已取消" });
        continue;
      }

      let item: GeocodeItem;
      try {
        item = await geocodeOne(address, config);
        // Attach category if provided
        if (addressToCategory?.has(address)) {
          item.category = addressToCategory.get(address);
        }
        // Ensure even successful-path errors are friendly
        if (item.status === "failed" && item.error) {
          item.error = friendlyError(item.error);
        }
      } catch (err) {
        const raw = err instanceof Error ? err.message : "未知错误";
        item = {
          address,
          status: "failed",
          source: config.source,
          error: friendlyError(raw),
        };
      }

      results.push(item);
      onProgress({ completed: results.length, total, latestResult: item });

      if (results.length < total && !signal?.aborted) {
        await sleep(delay);
      }
    }

  return results;
}

// ── Overpass API for area/polygon queries ──

const OVERPASS_URL = "https://overpass-api.de/api/interpreter";

const AREA_QUERIES: Record<AreaQueryType, string> = {
  building: `[out:json][timeout:30];area[name~"${''}"]["admin_level"!~""]->.searchArea;(way["building"]["name"](area.searchArea)(if: t["name"] != ""););out body geom;`,
  residential: `[out:json][timeout:30];area[name~"${''}"]["admin_level"!~""]->.searchArea;(way["landuse"="residential"](area.searchArea);relation["landuse"="residential"](area.searchArea););out body geom;`,
  park: `[out:json][timeout:30];area[name~"${''}"]["admin_level"!~""]->.searchArea;(way["leisure"="park"](area.searchArea);way["landuse"="grass"]["name"](area.searchArea);way["natural"="park"](area.searchArea);relation["leisure"="park"](area.searchArea););out body geom;`,
  commercial: `[out:json][timeout:30];area[name~"${''}"]["admin_level"!~""]->.searchArea;(way["landuse"="commercial"](area.searchArea);way["landuse"="retail"](area.searchArea);way["office"](area.searchArea););out body geom;`,
  administrative: `[out:json][timeout:30];area[name~"${''}"]["admin_level"!~""]->.searchArea;(relation["boundary"="administrative"]["name"](area.searchArea);way["boundary"="administrative"](area.searchArea););out body geom;`,
};

interface OverpassElement {
  type: "node" | "way" | "relation";
  id: number;
  tags?: Record<string, string>;
  geometry?: Array<{ lat: number; lon: number }>;
  nodes?: number[];
  members?: Array<{ type: "node" | "way"; ref: number; role: string }>;
}

interface OverpassResponse {
  elements: OverpassElement[];
}

function buildOverpassQuery(keyword: string, areaType: AreaQueryType): string {
  // Overpass QL query: search within a named area
  const escaped = keyword.replace(/"/g, '\\"');
  const base = AREA_QUERIES[areaType];
  // Inject keyword as area name constraint
  const areaConstraint = `[area["name"~"${escaped}"]]->.targetArea;`;
  const areaTypeFilter = getAreaTypeFilter(areaType);

  return `[out:json][timeout:60];${areaConstraint}${areaTypeFilter}(area.targetArea);out body geom;`;
}

function getAreaTypeFilter(type: AreaQueryType): string {
  switch (type) {
    case "building":
      return `(way["building"]["name"](area.targetArea););`;
    case "residential":
      return `(way["landuse"="residential"](area.targetArea);relation["landuse"="residential"](area.targetArea););`;
    case "park":
      return `(way["leisure"="park"](area.targetArea);way["landuse"="grass"]["name"](area.targetArea);way["natural"="park"](area.targetArea);relation["leisure"="park"](area.targetArea);way["tourism"="attraction"](area.targetArea););`;
    case "commercial":
      return `(way["landuse"="commercial"](area.targetArea);way["landuse"="retail"](area.targetArea););`;
    case "administrative":
      return `(relation["boundary"="administrative"](area.targetArea);way["boundary"="administrative"](area.targetArea););`;
  }
}

function parseOverpassGeometry(element: OverpassElement): number[][] {
  if (!element.geometry) return [];
  return element.geometry.map(g => [g.lon, g.lat]);
}

export async function queryOSMArea(
  keyword: string,
  areaType: AreaQueryType,
  signal?: AbortSignal,
): Promise<AreaResult[]> {
  const query = buildOverpassQuery(keyword, areaType);

  const res = await fetch(OVERPASS_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": "Geocoding-China-Pro/1.0 (https://github.com/andyxu12341/Geocoding-China-Pro)",
    },
    body: `data=${encodeURIComponent(query)}`,
    signal: signal || AbortSignal.timeout(60000),
  });

  if (!res.ok) throw new Error(`Overpass API 错误: HTTP ${res.status}`);
  const data = await res.json() as OverpassResponse;

  const results: AreaResult[] = [];
  for (const el of data.elements) {
    if (!el.tags?.name) continue;
    const polygon = parseOverpassGeometry(el);
    if (polygon.length < 3) continue; // skip degenerate polygons

    const center = elementCenter(polygon);
    results.push({
      name: el.tags.name || `${el.tags.landuse || el.tags.leisure || el.tags.building || "未知"}-${el.id}`,
      type: areaType,
      osmId: el.id,
      osmType: el.type,
      tags: el.tags || {},
      polygon: [polygon],
      center,
    });
  }

  return results;
}

function elementCenter(coords: number[][]): { lat: number; lng: number } {
  if (coords.length === 0) return { lat: 0, lng: 0 };
  const sum = coords.reduce((acc, c) => [acc[0] + c[0], acc[1] + c[1]], [0, 0]);
  return {
    lng: sum[0] / coords.length,
    lat: sum[1] / coords.length,
  };
}
