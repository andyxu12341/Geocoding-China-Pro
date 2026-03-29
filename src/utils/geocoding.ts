// ============================================================
// Geocoding Utility — Pure Frontend, Zero Backend
// Supports: Gaode (Amap) · Baidu · OpenStreetMap (Nominatim)
// ============================================================

export type MapSource = "gaode" | "baidu" | "osm";

export interface GeocodingConfig {
  source: MapSource;
  gaodeKey?: string;
  baiduKey?: string;
  regionFilter?: string;
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
  batchSize = 20,
  addressToCategory?: Map<string, string>,
): Promise<GeocodeItem[]> {
  const results: GeocodeItem[] = [];
  const total = addresses.length;
  const delay = DELAY_MS[config.source];

  const chunks: string[][] = [];
  for (let i = 0; i < addresses.length; i += batchSize) {
    chunks.push(addresses.slice(i, i + batchSize));
  }

  // Nominatim requires at least 1s between requests; add initial delay to avoid burst
  if (config.source === "osm" && !signal?.aborted) {
    await sleep(delay);
  }

  for (const chunk of chunks) {
    for (const address of chunk) {
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
  }

  return results;
}
