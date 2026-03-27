import { Router, type IRouter } from "express";

const router: IRouter = Router();

const GAODE_API_URL = "https://restapi.amap.com/v3/place/text";
const CONCURRENCY_LIMIT = 3;
const REQUEST_INTERVAL_MS = 350;
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;
const TIMEOUT_MS = 10000;

interface GeocodeResult {
  address: string;
  lng?: string;
  lat?: string;
  formattedAddress?: string;
  status: "success" | "failed";
  error?: string;
}

async function fetchWithTimeout(url: string, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    return res;
  } finally {
    clearTimeout(timer);
  }
}

async function geocodeSingle(address: string, apiKey: string, attempt = 1): Promise<GeocodeResult> {
  const url = `${GAODE_API_URL}?keywords=${encodeURIComponent(address)}&key=${encodeURIComponent(apiKey)}&output=json&offset=1`;

  try {
    const res = await fetchWithTimeout(url, TIMEOUT_MS);

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    }

    const data = await res.json() as {
      status: string;
      pois?: Array<{
        location?: string;
        address?: string;
        name?: string;
      }>;
      info?: string;
      infocode?: string;
    };

    if (data.status === "1" && data.pois && data.pois.length > 0) {
      const poi = data.pois[0];
      const location = poi.location;
      if (location) {
        const [lng, lat] = location.split(",");
        return {
          address,
          lng,
          lat,
          formattedAddress: poi.address ? String(poi.address) : poi.name || "",
          status: "success",
        };
      }
    }

    const info = data.info || "未找到结果";
    const infocode = data.infocode || "";

    if (attempt < MAX_RETRIES && (infocode === "10044" || infocode === "10045")) {
      await new Promise(r => setTimeout(r, RETRY_DELAY_MS * attempt));
      return geocodeSingle(address, apiKey, attempt + 1);
    }

    return {
      address,
      status: "failed",
      error: `未找到坐标 (${info})`,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "未知错误";
    const isAbort = err instanceof Error && err.name === "AbortError";

    if (attempt < MAX_RETRIES && (isAbort || message.includes("fetch"))) {
      await new Promise(r => setTimeout(r, RETRY_DELAY_MS * attempt));
      return geocodeSingle(address, apiKey, attempt + 1);
    }

    return {
      address,
      status: "failed",
      error: isAbort ? "请求超时" : `请求失败: ${message}`,
    };
  }
}

async function geocodeBatch(addresses: string[], apiKey: string): Promise<GeocodeResult[]> {
  const results: GeocodeResult[] = new Array(addresses.length);
  let index = 0;

  async function worker() {
    while (index < addresses.length) {
      const currentIndex = index++;
      const address = addresses[currentIndex];
      results[currentIndex] = await geocodeSingle(address, apiKey);
      if (index < addresses.length) {
        await new Promise(r => setTimeout(r, REQUEST_INTERVAL_MS));
      }
    }
  }

  const workers = Array.from({ length: CONCURRENCY_LIMIT }, () => worker());
  await Promise.all(workers);

  return results;
}

router.post("/geocode", async (req, res) => {
  const { apiKey, addresses } = req.body as {
    apiKey?: string;
    addresses?: unknown[];
  };

  if (!apiKey || typeof apiKey !== "string" || apiKey.trim() === "") {
    res.status(400).json({
      error: "MISSING_API_KEY",
      message: "请提供高德地图 Web 服务 API Key",
    });
    return;
  }

  if (!addresses || !Array.isArray(addresses) || addresses.length === 0) {
    res.status(400).json({
      error: "MISSING_ADDRESSES",
      message: "请提供至少一个地址",
    });
    return;
  }

  const cleanedAddresses = addresses
    .filter((a): a is string => typeof a === "string")
    .map(a => a.trim())
    .filter(a => a.length > 0);

  if (cleanedAddresses.length === 0) {
    res.status(400).json({
      error: "EMPTY_ADDRESSES",
      message: "地址列表为空，请检查输入",
    });
    return;
  }

  if (cleanedAddresses.length > 2000) {
    res.status(400).json({
      error: "TOO_MANY_ADDRESSES",
      message: "单次最多支持 2000 条地址",
    });
    return;
  }

  try {
    const results = await geocodeBatch(cleanedAddresses, apiKey.trim());
    const successCount = results.filter(r => r.status === "success").length;
    const failedCount = results.filter(r => r.status === "failed").length;

    res.json({
      results,
      total: results.length,
      success: successCount,
      failed: failedCount,
    });
  } catch (err: unknown) {
    req.log.error({ err }, "Geocode batch failed");
    res.status(500).json({
      error: "INTERNAL_ERROR",
      message: "服务器内部错误，请稍后重试",
    });
  }
});

export default router;
