// ============================================================
// Geocoding Utility — Pure Frontend, Zero Backend
// Supports: Gaode (Amap) · Baidu · OpenStreetMap (Nominatim)
// ============================================================

export type MapSource = "gaode" | "baidu" | "osm";

export type AreaQueryType =
  | "all"         // 所有面域
  | "building"    // 建筑轮廓
  | "landuse"     // 城市功能区
  | "admin"       // 行政边界
  // POI 点位
  | "poi_restaurant"
  | "poi_medical"
  | "poi_transport"
  | "poi_shopping"
  | "poi_education"
  | "poi_sport"
  | "poi_all";

export type QueryGroup = "polygon" | "poi";

export function getQueryGroup(type: AreaQueryType): QueryGroup {
  if (type.startsWith("poi_")) return "poi";
  return "polygon";
}

export type AreaQueryMode = "semantic" | "rectangle" | "polygon";

export const AREA_TYPE_LABELS: Record<AreaQueryType, string> = {
  all: "🌐 所有面域",
  building: "🏢 建筑轮廓",
  landuse: "🗺️ 城市功能区",
  admin: "🏛️ 行政边界",
  poi_restaurant: "🍜 餐饮美食",
  poi_medical: "🏥 医疗设施",
  poi_transport: "🚌 交通设施",
  poi_shopping: "🛒 商业购物",
  poi_education: "🎓 教育设施",
  poi_sport: "⚽ 体育健身",
  poi_all: "📍 所有 POI",
};

export const AREA_TYPE_DESCRIPTIONS: Record<AreaQueryType, string> = {
  all: "同时提取建筑、城市功能区、行政边界等多种面域",
  building: "查询建筑物轮廓（如单体建筑、大型场馆）",
  landuse: "查询住宅区、商业区、公园绿地、工业用地等城市功能区",
  admin: "查询行政区划边界（省/市/区/街道）",
  poi_restaurant: "查询餐厅、咖啡馆、小吃店等餐饮场所",
  poi_medical: "查询医院、诊所、药店等医疗设施",
  poi_transport: "查询停车场、公交站、码头等交通设施",
  poi_shopping: "查询商场、超市、便利店等商业购物场所",
  poi_education: "查询学校、大学、幼儿园等教育设施",
  poi_sport: "查询体育场、运动中心、篮球场等体育设施",
  poi_all: "查询所有类型的 POI 点位",
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
  categoryName: string;
  color: string;
  polygon: number[][][];
  center?: { lat: number; lng: number };
}

export interface POIResult {
  name: string;
  type: AreaQueryType;
  osmId?: number;
  osmType?: string;
  lat: number;
  lng: number;
  categoryName: string;
  color: string;
  tags: Record<string, string>;
  address?: string;
  source: "osm" | "gaode" | "baidu";
}

export const LANDUSE_STANDARD_MAP: Record<string, { name: string; color: string }> = {
  farmland: { name: "01 耕地", color: "#F5F8DC" },
  orchard: { name: "02 园地", color: "#BFE9AA" },
  vineyard: { name: "02 园地", color: "#BFE9AA" },
  wood: { name: "0301 乔木林地", color: "#68B167" },
  forest: { name: "03 林地", color: "#68B167" },
  grassland: { name: "0401 天然牧草地", color: "#83C238" },
  meadow: { name: "04 草地", color: "#83C238" },
  residential: { name: "0701 城镇住宅用地", color: "#FFFF2D" },
  apartments: { name: "0702 城镇住宅用地（公寓）", color: "#FFE600" },
  detached: { name: "0703 城镇住宅用地（独立住宅）", color: "#FFD700" },
  administrative: { name: "0801 机关团体用地", color: "#EB46DA" },
  public_building: { name: "0801 机关团体用地", color: "#EB46DA" },
  research_institute: { name: "0802 科研用地", color: "#F0005C" },
  library: { name: "0803 文化用地", color: "#FF7F00" },
  theatre: { name: "0803 文化用地", color: "#FF7F00" },
  museum: { name: "0803 文化用地", color: "#FF7F00" },
  school: { name: "0804 教育用地", color: "#FF85C9" },
  university: { name: "0804 教育用地", color: "#FF85C9" },
  college: { name: "0804 教育用地", color: "#FF85C9" },
  kindergarten: { name: "0804 教育用地", color: "#FF85C9" },
  pitch: { name: "0805 体育用地", color: "#00A57C" },
  sports_centre: { name: "0805 体育用地", color: "#00A57C" },
  stadium: { name: "0805 体育用地", color: "#00A57C" },
  hospital: { name: "0806 医疗卫生用地", color: "#FF7F7E" },
  clinic: { name: "0806 医疗卫生用地", color: "#FF7F7E" },
  doctors: { name: "0806 医疗卫生用地", color: "#FF7F7E" },
  pharmacy: { name: "0806 医疗卫生用地", color: "#FF7F7E" },
  social_facility: { name: "0807 社会福利用地", color: "#FF9F7F" },
  nursing_home: { name: "0807 社会福利用地", color: "#FF9F7F" },
  place_of_worship: { name: "1503 宗教用地", color: "#CC0066" },
  institutional: { name: "08 公共管理与公共服务用地", color: "#EB46DA" },
  retail: { name: "0901 商业用地", color: "#FF0000" },
  mall: { name: "0901 商业用地", color: "#FF0000" },
  commercial: { name: "0901 商业用地", color: "#FF0000" },
  restaurant: { name: "0901 商业用地（餐饮）", color: "#E53935" },
  cafe: { name: "0901 商业用地（餐饮）", color: "#E53935" },
  bank: { name: "0902 商务金融用地", color: "#C00000" },
  office: { name: "0902 商务金融用地", color: "#C00000" },
  hotel: { name: "0904 其他商业服务业用地", color: "#91372A" },
  industrial: { name: "1001 工业用地", color: "#BB9674" },
  quarry: { name: "1002 采矿用地", color: "#9E6C54" },
  depot: { name: "1101 物流仓储用地", color: "#8761D3" },
  warehouse: { name: "1101 物流仓储用地", color: "#8761D3" },
  railway: { name: "1201 铁路用地", color: "#595959" },
  train_station: { name: "1201 铁路用地", color: "#595959" },
  highway: { name: "1202 公路用地", color: "#ADADAD" },
  airport: { name: "1203 机场用地", color: "#B7B7B7" },
  parking: { name: "1208 交通场站用地", color: "#D9D9D9" },
  bus_station: { name: "1208 交通场站用地", color: "#D9D9D9" },
  park: { name: "1401 公园绿地", color: "#00FF00" },
  garden: { name: "1401 公园绿地", color: "#00FF00" },
  square: { name: "1403 广场用地", color: "#ACFFCF" },
  grass: { name: "14 绿地与开敞空间用地", color: "#00FF00" },
  military: { name: "1501 军事设施用地", color: "#859156" },
  cemetery: { name: "1506 殡葬用地", color: "#4F7E3E" },
  grave_yard: { name: "1506 殡葬用地", color: "#4F7E3E" },
  water: { name: "1701 河流水面", color: "#338EC0" },
  river: { name: "1701 河流水面", color: "#338EC0" },
  stream: { name: "1701 河流水面", color: "#338EC0" },
  canal: { name: "1705 沟渠", color: "#9ABCE2" },
  construction: { name: "其他用地（在建）", color: "#E0E0E0" },
  default: { name: "其他用地（未匹配分类）", color: "#E0E0E0" },
};

export const POI_COLORS: Record<AreaQueryType, string> = {
  all: "#9B59B6",
  building: "#A9A9A9",
  landuse: "#00BFFF",
  admin: "#595959",
  poi_restaurant: "#E74C3C",
  poi_medical: "#FF6B6B",
  poi_transport: "#F39C12",
  poi_shopping: "#27AE60",
  poi_education: "#3498DB",
  poi_sport: "#1ABC9C",
  poi_all: "#9B59B6",
};

const BUILDING_NAME_MAP: Record<string, string> = {
  yes: "未分类/未标注",
  apartments: "公寓建筑",
  detached: "独立住宅",
  house: "独户住宅",
  residential: "住宅建筑",
  commercial: "商业建筑",
  retail: "商业建筑（零售）",
  office: "办公建筑",
  industrial: "工业建筑",
  warehouse: "仓储建筑",
  school: "学校建筑",
  university: "大学建筑",
  hospital: "医院建筑",
  clinic: "诊所建筑",
  hotel: "酒店建筑",
  mosque: "清真寺",
  church: "教堂",
  temple: "寺庙",
  synagogue: "犹太教堂",
  public: "公共建筑",
  government: "政府建筑",
  train_station: "火车站建筑",
  airport: "机场建筑",
  stadium: "体育场建筑",
  supermarket: "超市建筑",
  cinema: "电影院",
};

export function getStandardizedTags(tags: Record<string, string>, queryType: AreaQueryType): { categoryName: string; color: string } {
  if (queryType === "building") {
    const bType = tags.building;
    if (!bType || bType === "yes" || bType === "no") {
      return { categoryName: "未分类/未标注", color: "#A9A9A9" };
    }
    const displayName = BUILDING_NAME_MAP[bType] || bType;
    const mapped = LANDUSE_STANDARD_MAP[bType];
    return {
      categoryName: displayName,
      color: mapped?.color || "#A9A9A9",
    };
  }

  if (queryType === "landuse") {
    const specificTag =
      tags.amenity || tags.leisure || tags.shop || tags.military ||
      tags.building || tags.railway || tags.highway || tags.natural ||
      tags.waterway || tags.aeroway;
    const baseLanduse = tags.landuse || tags.natural || tags.waterway || "";

    const mapped = LANDUSE_STANDARD_MAP[specificTag] ||
                   LANDUSE_STANDARD_MAP[baseLanduse] ||
                   LANDUSE_STANDARD_MAP.default;

    return { categoryName: mapped.name, color: mapped.color };
  }

  if (queryType === "all") {
    const specificTag =
      tags.amenity || tags.leisure || tags.shop || tags.military ||
      tags.landuse || tags.natural || tags.waterway || tags.building ||
      tags.railway || tags.aeroway;

    const mapped = LANDUSE_STANDARD_MAP[specificTag] || LANDUSE_STANDARD_MAP.default;
    return { categoryName: mapped.name, color: mapped.color };
  }

  if (queryType === "admin") {
    return { categoryName: "行政边界", color: "#595959" };
  }

  if (queryType.startsWith("poi_")) {
    const POI_LABELS: Record<AreaQueryType, string> = {
      all: "所有 POI",
      building: "建筑",
      landuse: "城市功能区",
      admin: "行政边界",
      poi_restaurant: "餐饮美食",
      poi_medical: "医疗设施",
      poi_transport: "交通设施",
      poi_shopping: "商业购物",
      poi_education: "教育设施",
      poi_sport: "体育健身",
      poi_all: "所有 POI",
    };
    return {
      categoryName: POI_LABELS[queryType],
      color: POI_COLORS[queryType],
    };
  }

  return { categoryName: "其他用地（未匹配分类）", color: "#E0E0E0" };
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
  "https://overpass.openstreetmap.ru/api/interpreter",
  "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
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
  osm_id?: string;
  osm_type?: string;
  boundingbox?: [string, string, string, string];
  display_name: string;
}

export interface NominatimResult {
  lat: string;
  lon: string;
  osm_id?: string;
  osm_type?: string;
  osm_id_num?: number;
  boundingbox?: [string, string, string, string];
  display_name: string;
}

export async function searchNominatim(keyword: string, signal?: AbortSignal): Promise<NominatimResult | null> {
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(keyword)}&format=json&limit=1&addressdetails=1`;
  const res = await fetch(url, {
    headers: {
      "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
      "User-Agent": "Geocoding-China-Pro/1.0 (https://github.com/andyxu12341/Geocoding-China-Pro)",
    },
    signal: signal || AbortSignal.timeout(10000),
  });
  if (!res.ok) return null;
  const data = await res.json() as NominatimPlace[];
  if (data.length === 0) return null;
  const first = data[0];
  return {
    lat: first.lat,
    lon: first.lon,
    osm_id: first.osm_id,
    osm_type: first.osm_type,
    osm_id_num: first.osm_id ? parseInt(first.osm_id, 10) : undefined,
    boundingbox: first.boundingbox,
    display_name: first.display_name,
  };
}

export function osmToAreaId(osmType: string, osmId: string): string {
  const id = parseInt(osmId, 10);
  if (osmType === "R") return String(3600000000 + id);
  if (osmType === "W") return String(2400000000 + id);
  if (osmType === "N") return String(1200000000 + id);
  return String(id);
}

function expandBbox(bbox: [string, string, string, string], factor = 0.05): [number, number, number, number] {
  const [s, n, w, e] = bbox.map(Number);
  const latRange = n - s;
  const lonRange = e - w;
  return [
    s - latRange * factor,
    w - lonRange * factor,
    n + latRange * factor,
    e + lonRange * factor,
  ];
}

function buildOverpassBboxQuery(bbox: [number, number, number, number], areaType: AreaQueryType): string {
  const [south, west, north, east] = bbox;
  const filter = getAreaTypeFilter(areaType);
  return `[out:json][timeout:900];(${filter.replace(/AREA_PLACEHOLDER/g, `${south},${west},${north},${east}`)});out geom;`;
}

function buildAreaOverpassQuery(areaId: string, areaType: AreaQueryType): string {
  const filter = getAreaTypeFilter(areaType, `area(${areaId})`);
  return `[out:json][timeout:900];(${filter});out geom;`;
}

function getAreaTypeFilter(type: AreaQueryType, areaRef = "AREA_PLACEHOLDER"): string {
  switch (type) {
    case "all":
      return [
        `way["building"](${areaRef});relation["building"](${areaRef});`,
        `way["landuse"="residential"](${areaRef});relation["landuse"="residential"](${areaRef});`,
        `way["landuse"="commercial"](${areaRef});relation["landuse"="commercial"](${areaRef});`,
        `way["landuse"="retail"](${areaRef});relation["landuse"="retail"](${areaRef});`,
        `way["landuse"="industrial"](${areaRef});relation["landuse"="industrial"](${areaRef});`,
        `way["landuse"="grass"](${areaRef});`,
        `way["landuse"="farmland"](${areaRef});`,
        `way["landuse"="forest"](${areaRef});`,
        `way["natural"="wood"](${areaRef});`,
        `way["leisure"="park"](${areaRef});relation["leisure"="park"](${areaRef});`,
        `way["leisure"="nature_reserve"](${areaRef});`,
        `way["leisure"="pitch"](${areaRef});`,
        `way["leisure"="playground"](${areaRef});`,
        `way["amenity"="university"](${areaRef});relation["amenity"="university"](${areaRef});`,
        `way["amenity"="hospital"](${areaRef});relation["amenity"="hospital"](${areaRef});`,
        `way["amenity"="school"](${areaRef});relation["amenity"="school"](${areaRef});`,
        `relation["boundary"="administrative"](${areaRef});`,
      ].join("");
    case "building":
      return `way["building"](${areaRef});relation["building"](${areaRef});`;
    case "landuse":
      return [
        `way["landuse"="residential"](${areaRef});relation["landuse"="residential"](${areaRef});`,
        `way["landuse"="commercial"](${areaRef});relation["landuse"="commercial"](${areaRef});`,
        `way["landuse"="retail"](${areaRef});relation["landuse"="retail"](${areaRef});`,
        `way["landuse"="industrial"](${areaRef});relation["landuse"="industrial"](${areaRef});`,
        `way["landuse"="grass"](${areaRef});`,
        `way["landuse"="farmland"](${areaRef});`,
        `way["landuse"="forest"](${areaRef});`,
        `way["natural"="wood"](${areaRef});`,
        `way["leisure"="park"](${areaRef});relation["leisure"="park"](${areaRef});`,
        `way["leisure"="nature_reserve"](${areaRef});`,
        `way["leisure"="pitch"](${areaRef});`,
        `way["leisure"="playground"](${areaRef});`,
        `way["amenity"="university"](${areaRef});relation["amenity"="university"](${areaRef});`,
        `way["amenity"="hospital"](${areaRef});relation["amenity"="hospital"](${areaRef});`,
        `way["amenity"="school"](${areaRef});relation["amenity"="school"](${areaRef});`,
      ].join("");
    case "admin":
      return [
        `relation["boundary"="administrative"]["admin_level"="2"](${areaRef});`,
        `relation["boundary"="administrative"]["admin_level"="4"](${areaRef});`,
        `relation["boundary"="administrative"]["admin_level"="6"](${areaRef});`,
        `relation["boundary"="administrative"]["admin_level"="8"](${areaRef});`,
        `way["boundary"="administrative"]["admin_level"="2"](${areaRef});`,
        `way["boundary"="administrative"]["admin_level"="4"](${areaRef});`,
        `way["boundary"="administrative"]["admin_level"="6"](${areaRef});`,
        `way["boundary"="administrative"]["admin_level"="8"](${areaRef});`,
      ].join("");
  }
}

function getPOITypeFilter(type: AreaQueryType): string {
  switch (type) {
    case "poi_restaurant":
      return `node["amenity"~"restaurant|cafe|fast_food"](AREA_PLACEHOLDER);`;
    case "poi_medical":
      return `node["amenity"~"hospital|clinic|doctors|pharmacy"](AREA_PLACEHOLDER);`;
    case "poi_transport":
      return `node["amenity"~"parking|bus_station|ferry_terminal|taxi"](AREA_PLACEHOLDER);`;
    case "poi_shopping":
      return `node["shop"](AREA_PLACEHOLDER);`;
    case "poi_education":
      return `node["amenity"~"school|university|kindergarten|college"](AREA_PLACEHOLDER);`;
    case "poi_sport":
      return `node["leisure"~"pitch|sports_centre|stadium|fitness_centre"](AREA_PLACEHOLDER);`;
    case "poi_all":
      return [
        `node["amenity"](AREA_PLACEHOLDER);`,
        `node["shop"](AREA_PLACEHOLDER);`,
        `node["leisure"](AREA_PLACEHOLDER);`,
        `node["tourism"](AREA_PLACEHOLDER);`,
      ].join("");
    default:
      return `node["name"](AREA_PLACEHOLDER);`;
  }
}

function buildPOIBboxQuery(bbox: [number, number, number, number], poiType: AreaQueryType): string {
  const [south, west, north, east] = bbox;
  const filter = getPOITypeFilter(poiType);
  return `[out:json][timeout:300];(${filter.replace(/AREA_PLACEHOLDER/g, `${south},${west},${north},${east}`)});out body;`;
}

function buildPOIPolygonQuery(latlngs: [number, number][], poiType: AreaQueryType): string {
  const polyStr = latlngs.map(([lat, lng]) => `${lat} ${lng}`).join(" ");
  const filter = getPOITypeFilter(poiType);
  return `[out:json][timeout:300];(${filter.replace(/AREA_PLACEHOLDER/g, `poly:"${polyStr}"`)});out body;`;
}

function buildPOIAreaQuery(areaId: string, poiType: AreaQueryType): string {
  const filter = getPOITypeFilter(poiType);
  return `[out:json][timeout:300];(${filter.replace(/AREA_PLACEHOLDER/g, `area(${areaId})`)});out body;`;
}

function buildBboxOverpassQuery(bbox: [number, number, number, number], type: AreaQueryType): string {
  const [south, west, north, east] = bbox;
  // Overpass bbox format: (south,west,north,east)
  const bboxStr = `${south},${west},${north},${east}`;
  const filter = getAreaTypeFilter(type, bboxStr);
  return `[out:json][timeout:900];(${filter});out geom;`;
}

function buildPolygonOverpassQuery(latlngs: [number, number][], type: AreaQueryType): string {
  // Overpass poly format: space-separated "lat lon lat lon ..."
  const polyStr = latlngs.map(([lat, lng]) => `${lat} ${lng}`).join(" ");
  const polyRef = `poly:"${polyStr}"`;
  const filter = getAreaTypeFilter(type, polyRef);
  return `[out:json][timeout:900];(${filter});out geom;`;
}

// getAreaPolyFilter removed — unified into getAreaTypeFilter with areaRef param

function stitchWayCoords(element: OverpassElement, allElements: OverpassElement[]): number[][] {
  if (!element.nodes || element.nodes.length < 2) return [];
  const nodeMap = new Map<number, { lat: number; lon: number }>();
  for (const el of allElements) {
    if (el.type === "node" && el.lat !== undefined && el.lon !== undefined) {
      nodeMap.set(el.id, { lat: el.lat, lon: el.lon });
    }
  }
  const coords: number[][] = [];
  for (const nodeId of element.nodes) {
    const node = nodeMap.get(nodeId);
    if (node) coords.push([node.lon, node.lat]);
  }
  return coords;
}

function parseRelationGeometry(element: OverpassElement, allElements: OverpassElement[]): number[][][] {
  const outerWays: OverpassElement[] = [];
  const innerWays: OverpassElement[] = [];
  for (const member of element.members || []) {
    if (member.type !== "way") continue;
    const way = allElements.find(el => el.type === "way" && el.id === member.ref);
    if (!way) continue;
    if (member.role === "outer") outerWays.push(way);
    else innerWays.push(way);
  }
  const rings: number[][][] = [];
  for (const way of outerWays) {
    if (way.geometry && way.geometry.length > 0) {
      rings.push(way.geometry.map(g => [g.lon, g.lat]));
    } else {
      const coords = stitchWayCoords(way, allElements);
      if (coords.length >= 3) rings.push(coords);
    }
  }
  if (rings.length === 0 && element.geometry) {
    rings.push(element.geometry.map(g => [g.lon, g.lat]));
  }
  return rings;
}

function parseOverpassGeometry(element: OverpassElement, allElements?: OverpassElement[]): number[][] {
  if (element.type === "relation") {
    if (!allElements || !element.members) {
      if (element.geometry && element.geometry.length > 0) {
        return element.geometry.map(g => [g.lon, g.lat]);
      }
      return [];
    }
    const rings = parseRelationGeometry(element, allElements);
    return rings.length > 0 ? rings[0] : [];
  }
  if (element.geometry && element.geometry.length > 0) {
    return element.geometry.map(g => [g.lon, g.lat]);
  }
  if (allElements && element.nodes && element.nodes.length > 0) {
    return stitchWayCoords(element, allElements);
  }
  return [];
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
    if (!place) {
      throw new Error(`未找到「${params.keyword}」的位置信息，请尝试更具体的名称`);
    }
    if (place.osm_type && place.osm_id) {
      const areaId = osmToAreaId(place.osm_type, place.osm_id);
      query = buildAreaOverpassQuery(areaId, areaType);
    } else if (place.boundingbox) {
      const bbox = expandBbox(place.boundingbox);
      query = buildOverpassBboxQuery(bbox, areaType);
    } else {
      throw new Error(`无法获取「${params.keyword}」的查询范围，请尝试更具体的名称`);
    }
  } else if (mode === "rectangle") {
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
    console.log(`[Overpass] 节点 ${i + 1}/${OVERPASS_ENDPOINTS.length} — QL:`, query);
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
      const isLastEndpoint = i >= OVERPASS_ENDPOINTS.length - 1;
      if (!isLastEndpoint) {
        console.warn(`[Overpass] 节点 ${endpoint} 请求失败（${lastErr.message}），尝试下一个节点...`);
      }
    }
  }

  if (!data) throw lastErr || new Error("Overpass 查询失败");

  const results: AreaResult[] = [];
  const allElements = data.elements;

  for (const el of allElements) {
    if (!el.tags?.name) continue;

    let polygons: number[][][];
    if (el.type === "relation") {
      polygons = parseRelationGeometry(el, allElements);
    } else {
      const coords = parseOverpassGeometry(el, allElements);
      if (coords.length < 3) continue;
      polygons = [coords];
    }

    if (polygons.length === 0 || polygons[0].length < 3) continue;

    const tags = el.tags || {};
    const raw =
      tags.landuse ||
      tags.leisure ||
      tags.amenity ||
      tags.building ||
      tags.boundary ||
      "";
    if (raw === "no") continue;

    const { categoryName, color } = getStandardizedTags(tags, areaType);
    const center = elementCenter(polygons[0]);
    results.push({
      name: el.tags.name,
      type: areaType,
      osmId: el.id,
      osmType: el.type,
      tags,
      categoryName,
      color,
      polygon: polygons,
      center,
    });
  }

  return results;
}

async function runOverpassQuery(query: string, signal?: AbortSignal): Promise<OverpassResponse> {
  let lastErr: Error | null = null;
  for (let i = 0; i < OVERPASS_ENDPOINTS.length; i++) {
    const endpoint = OVERPASS_ENDPOINTS[i];
    console.log(`[Overpass] 节点 ${i + 1}/${OVERPASS_ENDPOINTS.length} — QL:`, query);
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "User-Agent": "Geocoding-China-Pro/1.0 (https://github.com/andyxu12341/Geocoding-China-Pro)",
        },
        body: `data=${encodeURIComponent(query)}`,
        signal: signal || AbortSignal.timeout(60000),
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
      if (!res.ok) throw new Error(`Overpass API 错误: HTTP ${res.status}`);
      return await res.json() as OverpassResponse;
    } catch (err) {
      lastErr = err instanceof Error ? err : new Error(String(err));
      if (i < OVERPASS_ENDPOINTS.length - 1) {
        console.warn(`[Overpass] 节点 ${endpoint} 请求失败（${lastErr.message}），尝试下一个节点...`);
      }
    }
  }
  throw lastErr || new Error("Overpass 查询失败");
}

export async function queryOSMPOI(
  mode: AreaQueryMode,
  poiType: AreaQueryType,
  params: {
    keyword?: string;
    bbox?: [number, number, number, number];
    polygonLatLngs?: [number, number][];
  },
  signal?: AbortSignal,
): Promise<POIResult[]> {
  let query: string;

  if (mode === "semantic") {
    if (!params.keyword) throw new Error("请输入关键词");
    const place = await searchNominatim(params.keyword, signal);
    if (!place) throw new Error(`未找到「${params.keyword}」的位置信息，请尝试更具体的名称`);
    if (place.osm_type && place.osm_id) {
      const areaId = osmToAreaId(place.osm_type, place.osm_id);
      query = buildPOIAreaQuery(areaId, poiType);
    } else if (place.boundingbox) {
      const bbox = expandBbox(place.boundingbox, 0.02);
      query = buildPOIBboxQuery(bbox, poiType);
    } else {
      throw new Error(`无法获取「${params.keyword}」的查询范围`);
    }
  } else if (mode === "rectangle") {
    if (!params.bbox) throw new Error("缺少边界框参数");
    query = buildPOIBboxQuery(params.bbox, poiType);
  } else {
    if (!params.polygonLatLngs || params.polygonLatLngs.length < 3) throw new Error("缺少多边形顶点数据");
    query = buildPOIPolygonQuery(params.polygonLatLngs, poiType);
  }

  const data = await runOverpassQuery(query, signal);
  const { categoryName, color } = getStandardizedTags({}, poiType);

  const results: POIResult[] = [];
  for (const el of data.elements) {
    if (el.type !== "node") continue;
    if (el.lat === undefined || el.lon === undefined) continue;
    const name = el.tags?.name || el.tags?.["name:zh"] || el.tags?.ref || `OSM Node ${el.id}`;
    results.push({
      name,
      type: poiType,
      osmId: el.id,
      osmType: "node",
      lat: el.lat,
      lng: el.lon,
      categoryName,
      color,
      tags: el.tags || {},
      source: "osm",
    });
  }
  return results;
}

export async function queryGaodePOI(
  keyword: string,
  poiType: AreaQueryType,
  apiKey: string,
  region?: string,
  bbox?: [number, number, number, number],
): Promise<POIResult[]> {
  const { categoryName, color } = getStandardizedTags({}, poiType);
  const POITYPE_MAP: Record<AreaQueryType, string> = {
    poi_restaurant: "餐饮服务",
    poi_medical: "医疗保健",
    poi_transport: "交通设施",
    poi_shopping: "购物",
    poi_education: "科教文化",
    poi_sport: "体育休闲",
    poi_all: "",
    all: "",
    building: "",
    landuse: "",
    admin: "",
  };
  const typeCode = POITYPE_MAP[poiType] || "";

  const url = new URL("https://restapi.amap.com/v3/place/text");
  url.searchParams.set("keywords", keyword);
  if (typeCode) url.searchParams.set("types", typeCode);
  url.searchParams.set("key", apiKey);
  url.searchParams.set("offset", "50");
  url.searchParams.set("page", "1");
  url.searchParams.set("output", "json");
  if (region) {
    url.searchParams.set("city", region);
    url.searchParams.set("citylimit", "true");
  }
  if (bbox) {
    const [south, west, north, east] = bbox;
    url.searchParams.set("rect", `${west},${south},${east},${north}`);
  }

  const res = await fetch(url.toString(), { signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw new Error(`高德 POI 查询失败: HTTP ${res.status}`);
  const data = await res.json() as {
    status: string;
    info: string;
    pois?: Array<{
      name: string;
      location: string;
      address?: string;
      type?: string;
    }>;
  };
  if (data.status !== "1" || !data.pois?.length) {
    throw new Error(data.info || "高德 POI 未找到结果");
  }

  return data.pois
    .filter(p => p.location)
    .map(p => {
      const [lng, lat] = p.location.split(",");
      return {
        name: p.name,
        type: poiType,
        lat: parseFloat(lat),
        lng: parseFloat(lng),
        categoryName,
        color,
        tags: {
          address: p.address || "",
          type: p.type || "",
        },
        address: p.address,
        source: "gaode" as const,
      };
    });
}

export async function queryBaiduPOI(
  keyword: string,
  poiType: AreaQueryType,
  apiKey: string,
  region?: string,
): Promise<POIResult[]> {
  const { categoryName, color } = getStandardizedTags({}, poiType);
  const POITYPE_MAP: Record<AreaQueryType, string> = {
    poi_restaurant: "餐饮",
    poi_medical: "医疗",
    poi_transport: "交通设施",
    poi_shopping: "购物",
    poi_education: "教育培训",
    poi_sport: "运动健身",
    poi_all: "",
    all: "",
    building: "",
    landuse: "",
    admin: "",
  };
  const typeCode = POITYPE_MAP[poiType] || "";

  const url = new URL("https://api.map.baidu.com/place/v2/search");
  url.searchParams.set("query", typeCode ? `${typeCode}${keyword}` : keyword);
  url.searchParams.set("tag", typeCode);
  url.searchParams.set("ak", apiKey);
  url.searchParams.set("output", "json");
  url.searchParams.set("scope", "1");
  url.searchParams.set("page_size", "50");
  url.searchParams.set("page_num", "0");
  if (region) url.searchParams.set("region", region);

  const res = await fetch(url.toString(), { signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw new Error(`百度 POI 查询失败: HTTP ${res.status}`);
  const data = await res.json() as {
    status: number;
    message: string;
    results?: Array<{
      name: string;
      location: { lat: number; lng: number };
      address?: string;
      street_id?: string;
    }>;
  };
  if (data.status !== 0 || !data.results?.length) {
    throw new Error(data.message || "百度 POI 未找到结果");
  }

  return data.results
    .filter(r => r.location)
    .map(r => ({
      name: r.name,
      type: poiType,
      lat: r.location.lat,
      lng: r.location.lng,
      categoryName,
      color,
      tags: { address: r.address || "" },
      address: r.address,
      source: "baidu" as const,
    }));
}

function elementCenter(coords: number[][]): { lat: number; lng: number } {
  if (coords.length === 0) return { lat: 0, lng: 0 };
  const sum = coords.reduce((acc, c) => [acc[0] + c[0], acc[1] + c[1]], [0, 0]);
  return {
    lng: sum[0] / coords.length,
    lat: sum[1] / coords.length,
  };
}
