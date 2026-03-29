// ============================================================
// Geocoding Utility — Pure Frontend, Zero Backend
// Supports: Gaode (Amap) · Baidu · OpenStreetMap (Nominatim)
// ============================================================

export type MapSource = "gaode" | "baidu" | "osm";

export interface GeocodingConfig {
  source: MapSource;
  gaodeKey?: string;
  baiduKey?: string;
}

export interface GeocodeItem {
  address: string;
  lng?: string;
  lat?: string;
  formattedAddress?: string;
  source?: MapSource;
  status: "success" | "failed";
  error?: string;
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
  osm: 1050,
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
      delete (window as Record<string, unknown>)[cbName];
      script.remove();
    }

    (window as Record<string, unknown>)[cbName] = (data: T) => {
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

// Gaode (Amap)
async function geocodeGaode(address: string, apiKey: string): Promise<GeocodeItem> {
  const url = `https://restapi.amap.com/v3/geocode/geo?key=${encodeURIComponent(apiKey)}&address=${encodeURIComponent(address)}&output=json`;
  const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json() as {
    status: string; info: string;
    geocodes?: Array<{ location: string; formatted_address: string }>;
  };
  if (data.status !== "1" || !data.geocodes?.length) {
    return { address, status: "failed", source: "gaode", error: data.info || "未找到结果" };
  }
  const g = data.geocodes[0];
  const [lng, lat] = g.location.split(",");
  return { address, lng, lat, formattedAddress: g.formatted_address, source: "gaode", status: "success" };
}

// Baidu
async function geocodeBaidu(address: string, apiKey: string): Promise<GeocodeItem> {
  type BaiduResp = { status: number; result?: { location: { lng: number; lat: number }; level: string } };
  const url = `https://api.map.baidu.com/geocoding/v3/?address=${encodeURIComponent(address)}&output=json&ak=${encodeURIComponent(apiKey)}&ret_coordtype=gcj02ll`;
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
async function geocodeOSM(address: string): Promise<GeocodeItem> {
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(address)}&format=json&limit=1&addressdetails=0`;
  const res = await fetch(url, {
    headers: { "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8" },
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

async function geocodeOne(address: string, config: GeocodingConfig): Promise<GeocodeItem> {
  return withRetry(async () => {
    switch (config.source) {
      case "gaode":
        if (!config.gaodeKey) throw new Error("缺少高德 API Key");
        return geocodeGaode(address, config.gaodeKey);
      case "baidu":
        if (!config.baiduKey) throw new Error("缺少百度 API Key");
        return geocodeBaidu(address, config.baiduKey);
      case "osm":
        return geocodeOSM(address);
    }
  });
}

export async function geocodeBatch(
  addresses: string[],
  config: GeocodingConfig,
  onProgress: (progress: BatchProgress) => void,
  signal?: AbortSignal,
  batchSize = 20,
): Promise<GeocodeItem[]> {
  const results: GeocodeItem[] = [];
  const total = addresses.length;
  const delay = DELAY_MS[config.source];

  const chunks: string[][] = [];
  for (let i = 0; i < addresses.length; i += batchSize) {
    chunks.push(addresses.slice(i, i + batchSize));
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
      } catch (err) {
        item = {
          address,
          status: "failed",
          source: config.source,
          error: err instanceof Error ? err.message : "未知错误",
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
