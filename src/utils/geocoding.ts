// ============================================================
// Geocoding Utility — Pure Frontend, Zero Backend
// Supports: Gaode (Amap) · Baidu · OpenStreetMap (Nominatim)
// ============================================================

export type MapSource = "gaode" | "baidu" | "osm";

export type AreaQueryType =
  | "all"         // 所有面域
  | "building"    // 建筑轮廓
  | "landuse"     // 城市功能区
  | "admin";      // 行政边界

export type AreaQueryMode = "semantic" | "viewport" | "rectangle" | "polygon";

export const AREA_TYPE_LABELS: Record<AreaQueryType, string> = {
  all: "🌐 所有面域",
  building: "🏢 建筑轮廓",
  landuse: "🗺️ 城市功能区",
  admin: "🏛️ 行政边界",
};

export const AREA_TYPE_DESCRIPTIONS: Record<AreaQueryType, string> = {
  all: "同时提取建筑、城市功能区、行政边界等多种面域",
  building: "查询建筑物轮廓（如单体建筑、大型场馆）",
  landuse: "查询住宅区、商业区、公园绿地、工业用地等城市功能区",
  admin: "查询行政区划边界（省/市/区/街道）",
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
  candidates?: GeocodeCandidate[]; // Multiple candidates for user to choose
}

export interface GeocodeCandidate {
  lng: string;
  lat: string;
  formattedAddress: string;
  province?: string;
  city?: string;
  district?: string;
  level?: string;
}

export interface AreaResult {
  name: string;
  type: AreaQueryType;
  osmId: number;
  osmType: string;
  tags: Record<string, string>;
  category?: string;
  polygon: number[][][];
  center?: { lat: number; lng: number };
}

export const AREA_CATEGORY_COLORS: Record<string, string> = {
  residential: "#60A5FA",
  commercial: "#F87171",
  office: "#FB923C",
  education: "#A78BFA",
  medical: "#F472B6",
  public: "#34D399",
  religious: "#FBBF24",
  park: "#4ADE80",
  other: "#9CA3AF",
};

export const AREA_CATEGORY_LABELS: Record<string, string> = {
  residential: "住宅与一般建筑",
  commercial: "商业服务",
  office: "办公与工业",
  education: "教育科研",
  medical: "医疗卫生",
  public: "公共设施",
  religious: "宗教设施",
  park: "公园绿地",
  other: "其他设施",
};

export function getOSMCategory(tags: Record<string, string>): string {
  const raw =
    tags.landuse ||
    tags.leisure ||
    tags.amenity ||
    tags.building ||
    tags.boundary ||
    "other";

  if (raw === "no" || raw === "yes" || !raw) return "other";

  if (["residential", "apartments", "house", "detached", "terrace"].includes(raw)) return "residential";
  if (["commercial", "retail", "bank", "restaurant", "cafe", "bar", "fast_food", "food_court", "cinema", "theatre", "nightclub", "casino", "shop", "supermarket"].includes(raw)) return "commercial";
  if (["office", "industrial", "warehouse", "manufacture"].includes(raw)) return "office";
  if (["university", "school", "college", "kindergarten", "library", "bookshop", "driving_school"].includes(raw)) return "education";
  if (["hospital", "clinic", "doctors", "pharmacy", "dentist", "veterinary", "social_facility", "nursing_home"].includes(raw)) return "medical";
  if (["police", "government", "public_building", "courthouse", "prison", "fire_station", "post_office"].includes(raw)) return "public";
  if (["place_of_worship"].includes(raw)) return "religious";
  if (["park", "pitch", "playground", "track", "sports_centre", "swimming_pool", "leisure"].includes(raw)) return "park";
  if (["cemetery", "grave_yard"].includes(raw)) return "other";
  if (["construction"].includes(raw)) return "other";
  if (["water", "river", "lake", "pond", "reservoir", "stream", "wetland"].includes(raw)) return "other";
  if (["forest", "farmland", "grass", "meadow", "orchard", "vineyard"].includes(raw)) return "park";
  if (["military"].includes(raw)) return "other";
  if (["building"].includes(raw) || raw.length > 0) return "residential";

  return "other";
}

export interface BatchProgress {
  completed: number;
  total: number;
  latestResult?: GeocodeItem;
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// ── Request cache (localStorage + TTL) ──
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

function cacheGet(address: string, source: MapSource): GeocodeItem | null {
  try {
    const raw = localStorage.getItem(`gc:${source}:${address}`);
    if (!raw) return null;
    const { item, ts } = JSON.parse(raw);
    if (Date.now() - ts > CACHE_TTL_MS) {
      localStorage.removeItem(`gc:${source}:${address}`);
      return null;
    }
    return item;
  } catch {
    return null;
  }
}

function cacheSet(address: string, source: MapSource, item: GeocodeItem) {
  if (item.status === "success") {
    try {
      localStorage.setItem(`gc:${source}:${address}`, JSON.stringify({ item, ts: Date.now() }));
    } catch { /* storage full — ignore */ }
  }
}

export function clearGeocodingCache() {
  try {
    const prefix = "gc:";
    const keys = Object.keys(localStorage).filter(k => k.startsWith(prefix));
    keys.forEach(k => localStorage.removeItem(k));
  } catch { /* ignore */ }
}

// ── In-flight deduplication ──
const inflight = new Map<string, Promise<GeocodeItem>>();

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
  candidates: GeocodeCandidate[];
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
      district?: string;
      level?: string;
    }>;
  };
  if (data.status !== "1" || !data.geocodes?.length) {
    return { item: { address, status: "failed", source: "gaode", error: data.info || "匹配失败: 未找到有效坐标" }, candidates: [] };
  }

  const candidates: GeocodeCandidate[] = data.geocodes
    .filter(g => g.location)
    .map(g => {
      const [lng, lat] = g.location.split(",");
      return {
        lng,
        lat,
        formattedAddress: g.formatted_address,
        province: g.province,
        city: typeof g.city === "string" ? g.city : undefined,
        district: g.district,
        level: g.level,
      };
    });

  if (candidates.length === 0) {
    return { item: { address, status: "failed", source: "gaode", error: "匹配失败: 返回坐标为空" }, candidates: [] };
  }

  const top = candidates[0];
  return {
    item: { address, lng: top.lng, lat: top.lat, formattedAddress: top.formattedAddress, source: "gaode", status: "success", candidates },
    candidates,
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
      const plausible = sanityCheck(hint, primary.candidates[0]?.province, primary.candidates[0]?.city, primary.item.formattedAddress);
      if (plausible) {
        return primary.item;
      }
    }
    // Return with candidates even if failed sanity check
    if (primary.candidates.length > 0) {
      return primary.item;
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
  const cacheKey = `${config.source}:${address}:${config.gaodeKey ?? config.baiduKey ?? ""}`;
  if (inflight.has(cacheKey)) {
    return inflight.get(cacheKey)!;
  }
  const cached = cacheGet(address, config.source);
  if (cached) return cached;
  const region = config.regionFilter?.trim() || undefined;
  const promise = withRetry(async () => {
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
  inflight.set(cacheKey, promise);
  try {
    const result = await promise;
    cacheSet(address, config.source, result);
    return result;
  } finally {
    inflight.delete(cacheKey);
  }
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

const OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://lz4.overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
];

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

interface NominatimPlace {
  lat: string;
  lon: string;
  boundingbox?: [string, string, string, string]; // [south, north, west, east]
  display_name: string;
}

async function searchNominatim(keyword: string, signal?: AbortSignal): Promise<NominatimPlace | null> {
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(keyword)}&format=json&limit=1&addressdetails=0`;
  const res = await fetch(url, {
    headers: {
      "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
      "User-Agent": "Geocoding-China-Pro/1.0 (https://github.com/andyxu12341/Geocoding-China-Pro)",
    },
    signal: signal || AbortSignal.timeout(10000),
  });
  if (!res.ok) return null;
  const data = await res.json() as NominatimPlace[];
  return data.length > 0 ? data[0] : null;
}

function expandBbox(bbox: [string, string, string, string], factor = 0.05): [number, number, number, number] {
  const [s, n, w, e] = bbox.map(Number);
  const latRange = n - s;
  const lonRange = e - w;
  return [
    s - latRange * factor,
    n + latRange * factor,
    w - lonRange * factor,
    e + lonRange * factor,
  ];
}

function buildOverpassBboxQuery(bbox: [number, number, number, number], areaType: AreaQueryType): string {
  const [s, n, w, e] = bbox;
  const filter = getAreaTypeFilter(areaType);
  return `[out:json][timeout:60];(${filter.replace(/\(area\.targetArea\)/g, `(${s},${w},${n},${e})`)});out body geom;`;
}

function getAreaTypeFilter(type: AreaQueryType, areaRef = "area.targetArea"): string {
  switch (type) {
    case "all":
      return [
        `way["building"](${areaRef});relation["building"](${areaRef});`,
        `way["landuse"~"residential|commercial|retail|industrial|grass|natural"](${areaRef});relation["landuse"~"residential|commercial|retail|industrial|grass|natural"](${areaRef});`,
        `way["leisure"~"park|pitch|playground"](${areaRef});relation["leisure"~"park|pitch|playground"](${areaRef});`,
        `way["amenity"~"university|hospital|school"](${areaRef});relation["amenity"~"university|hospital|school"](${areaRef});`,
        `relation["boundary"="administrative"](${areaRef});`,
      ].join("");
    case "building":
      return `way["building"](${areaRef});relation["building"](${areaRef});`;
    case "landuse":
      return [
        `way["landuse"~"residential|commercial|retail|industrial"](${areaRef});relation["landuse"~"residential|commercial|retail|industrial"](${areaRef});`,
        `way["leisure"~"park|nature_reserve|pitch|playground"](${areaRef});relation["leisure"~"park|nature_reserve|pitch|playground"](${areaRef});`,
        `way["amenity"~"university|hospital|school|college"](${areaRef});relation["amenity"~"university|hospital|school|college"](${areaRef});`,
        `way["landuse"="grass"];way["natural"="park"];way["landuse"="farmland"];way["landuse"="forest"];`,
      ].join("");
    case "admin":
      return `relation["boundary"="administrative"](${areaRef});`;
  }
}

function buildBboxOverpassQuery(bbox: [number, number, number, number], type: AreaQueryType): string {
  const [south, west, north, east] = bbox;
  const filter = getAreaTypeFilter(type);
  return `[out:json][timeout:60];(${filter});out body geom;`;
}

function buildPolygonOverpassQuery(latlngs: [number, number][], type: AreaQueryType): string {
  const polyStr = latlngs.map(([lat, lng]) => `${lat} ${lng}`).join(" ");
  const filter = getAreaPolyFilter(type, polyStr);
  return `[out:json][timeout:60];(poly:"${polyStr}";${filter});out body geom;`;
}

function getAreaPolyFilter(type: AreaQueryType, polyStr: string): string {
  switch (type) {
    case "all":
      return [
        `way["building"];relation["building"];`,
        `way["landuse"~"residential|commercial|retail|industrial|grass|natural"];relation["landuse"~"residential|commercial|retail|industrial|grass|natural"];`,
        `way["leisure"~"park|pitch|playground"];relation["leisure"~"park|pitch|playground"];`,
        `way["amenity"~"university|hospital|school"];relation["amenity"~"university|hospital|school"];`,
        `relation["boundary"="administrative"];`,
      ].join("");
    case "building":
      return `way["building"];relation["building"];`;
    case "landuse":
      return [
        `way["landuse"~"residential|commercial|retail|industrial"];relation["landuse"~"residential|commercial|retail|industrial"];`,
        `way["leisure"~"park|nature_reserve|pitch|playground"];relation["leisure"~"park|nature_reserve|pitch|playground"];`,
        `way["amenity"~"university|hospital|school|college"];relation["amenity"~"university|hospital|school|college"];`,
        `way["landuse"="grass"];way["natural"="park"];way["landuse"="farmland"];way["landuse"="forest"];`,
      ].join("");
    case "admin":
      return `relation["boundary"="administrative"];`;
  }
}

function parseOverpassGeometry(element: OverpassElement): number[][] {
  if (!element.geometry) return [];
  return element.geometry.map(g => [g.lon, g.lat]);
}

export async function queryOSMArea(
  mode: AreaQueryMode,
  areaType: AreaQueryType,
  params: {
    keyword?: string;
    bbox?: [number, number, number, number];
    polygonLatLngs?: [number, number][];
  },
  signal?: AbortSignal,
): Promise<AreaResult[]> {
  let query: string;

  if (mode === "semantic") {
    if (!params.keyword) throw new Error("请输入关键词");
    const place = await searchNominatim(params.keyword, signal);
    if (!place || !place.boundingbox) {
      throw new Error(`未找到「${params.keyword}」的位置信息，请尝试更具体的名称`);
    }
    const bbox = expandBbox(place.boundingbox);
    query = buildOverpassBboxQuery(bbox, areaType);
  } else if (mode === "viewport" || mode === "rectangle") {
    if (!params.bbox) throw new Error("缺少边界框参数");
    query = buildBboxOverpassQuery(params.bbox, areaType);
  } else {
    if (!params.polygonLatLngs || params.polygonLatLngs.length < 3) throw new Error("缺少多边形顶点数据");
    query = buildPolygonOverpassQuery(params.polygonLatLngs, areaType);
  }

  let lastErr: Error | null = null;
  let data: OverpassResponse | null = null;
  for (let i = 0; i < OVERPASS_ENDPOINTS.length; i++) {
    const endpoint = OVERPASS_ENDPOINTS[i];
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "User-Agent": "Geocoding-China-Pro/1.0 (https://github.com/andyxu12341/Geocoding-China-Pro)",
        },
        body: `data=${encodeURIComponent(query)}`,
        signal: signal || AbortSignal.timeout(90000),
      });

      if (res.status === 400) {
        const text = await res.text().catch(() => "");
        throw new Error(`Overpass 查询语法错误（HTTP 400）: ${text.slice(0, 200)}`);
      }
      if (res.status === 429) {
        lastErr = new Error("Overpass API 请求过于频繁，请稍后再试（HTTP 429）");
        if (i < OVERPASS_ENDPOINTS.length - 1) continue;
        throw lastErr;
      }
      if (!res.ok) {
        throw new Error(`Overpass API 错误: HTTP ${res.status}`);
      }

      data = await res.json() as OverpassResponse;
      break;
    } catch (err) {
      lastErr = err instanceof Error ? err : new Error(String(err));
      if (i < OVERPASS_ENDPOINTS.length - 1) continue;
    }
  }

  if (!data) throw lastErr || new Error("Overpass 查询失败");

  const results: AreaResult[] = [];
  for (const el of data.elements) {
    if (!el.tags?.name) continue;
    const polygon = parseOverpassGeometry(el);
    if (polygon.length < 3) continue;

    const tags = el.tags || {};
    const raw =
      tags.landuse ||
      tags.leisure ||
      tags.amenity ||
      tags.building ||
      tags.boundary ||
      "";
    if (raw === "no") continue;

    const center = elementCenter(polygon);
    results.push({
      name: el.tags.name,
      type: areaType,
      osmId: el.id,
      osmType: el.type,
      tags,
      category: getOSMCategory(tags),
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
