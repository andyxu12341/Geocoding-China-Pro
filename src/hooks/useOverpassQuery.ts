import { useState, useCallback } from "react";
import {
  queryOSMArea,
  queryOSMPOI,
  queryGaodePOI,
  queryBaiduPOI,
  getQueryGroup,
  type AreaQueryType,
  type AreaQueryMode,
  type AreaResult,
  type POIResult,
} from "@/utils/geocoding";

export type SpatialResult = {
  polygon?: AreaResult;
  poi?: POIResult;
};

export interface UseOverpassQueryReturn {
  results: SpatialResult[];
  isLoading: boolean;
  error: string | null;
  fetchSpatial: (params: {
    mode: AreaQueryMode;
    areaType: AreaQueryType;
    dataSource: "osm" | "gaode" | "baidu";
    keyword?: string;
    bbox?: [number, number, number, number];
    polygonLatLngs?: [number, number][];
    apiKey?: string;
    region?: string;
  }) => Promise<SpatialResult[]>;
  reset: () => void;
}

function normalizeError(err: unknown): string {
  if (!(err instanceof Error)) return "查询失败";
  const m = err.message;
  if (/504|Gateway|timeout|Timeout/i.test(m)) return "服务器响应超时，请缩小查询范围或稍后再试";
  if (/429/i.test(m)) return "请求过于频繁，请稍后再试";
  return m;
}

function wrapPolygon(results: AreaResult[]): SpatialResult[] {
  return results.map(r => ({ polygon: r }));
}

function wrapPOI(results: POIResult[]): SpatialResult[] {
  return results.map(r => ({ poi: r }));
}

export function useOverpassQuery(): UseOverpassQueryReturn {
  const [results, setResults] = useState<SpatialResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchSpatial = useCallback(async (params: {
    mode: AreaQueryMode;
    areaType: AreaQueryType;
    dataSource: "osm" | "gaode" | "baidu";
    keyword?: string;
    bbox?: [number, number, number, number];
    polygonLatLngs?: [number, number][];
    apiKey?: string;
    region?: string;
  }) => {
    const { mode, areaType, dataSource, keyword, bbox, polygonLatLngs, apiKey, region } = params;
    console.log(">>> [useOverpassQuery] 入参:", { mode, areaType, dataSource, keyword, bbox, apiKey: apiKey ? "已配置" : "未配置", region });

    setIsLoading(true);
    setError(null);
    try {
      const group = getQueryGroup(areaType);
      console.log(">>> [useOverpassQuery] getQueryGroup(", areaType, ") =", group);

      if (group === "polygon") {
        console.log(">>> [useOverpassQuery] 路由 → queryOSMArea");
        const areaResults = await queryOSMArea(mode, areaType, { keyword, bbox, polygonLatLngs });
        console.log(">>> [useOverpassQuery] queryOSMArea 返回:", areaResults.length, "条");
        setResults(wrapPolygon(areaResults));
        return wrapPolygon(areaResults);
      }

      if (dataSource === "osm") {
        console.log(">>> [useOverpassQuery] 路由 → queryOSMPOI");
        const poiResults = await queryOSMPOI(mode, areaType, { keyword, bbox, polygonLatLngs });
        console.log(">>> [useOverpassQuery] queryOSMPOI 返回:", poiResults.length, "条");
        setResults(wrapPOI(poiResults));
        return wrapPOI(poiResults);
      }

      if (!apiKey) {
        const msg = dataSource === "gaode" ? "高德 POI 查询需要 API Key" : "百度 POI 查询需要 API Key";
        console.error("!!! [useOverpassQuery] 缺少 API Key:", dataSource);
        throw new Error(msg);
      }

      if (dataSource === "gaode") {
        console.log(">>> [useOverpassQuery] 路由 → queryGaodePOI");
        const poiResults = await queryGaodePOI(keyword || "", areaType, apiKey, region, bbox);
        console.log(">>> [useOverpassQuery] queryGaodePOI 返回:", poiResults.length, "条");
        setResults(wrapPOI(poiResults));
        return wrapPOI(poiResults);
      } else {
        console.log(">>> [useOverpassQuery] 路由 → queryBaiduPOI");
        const poiResults = await queryBaiduPOI(keyword || "", areaType, apiKey, region);
        console.log(">>> [useOverpassQuery] queryBaiduPOI 返回:", poiResults.length, "条");
        setResults(wrapPOI(poiResults));
        return wrapPOI(poiResults);
      }
    } catch (err) {
      const msg = normalizeError(err);
      console.error("!!! [useOverpassQuery] 查询失败:", err instanceof Error ? err.message : err);
      setError(msg);
      return [];
    } finally {
      setIsLoading(false);
    }
  }, []);

  const reset = useCallback(() => {
    setResults([]);
    setIsLoading(false);
    setError(null);
  }, []);

  return { results, isLoading, error, fetchSpatial, reset };
}
