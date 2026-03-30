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
    const queryGroup = getQueryGroup(areaType);

    setIsLoading(true);
    setError(null);
    try {
      let spatialResults: SpatialResult[] = [];

      if (queryGroup === "polygon") {
        const areaResults = await queryOSMArea(mode, areaType, { keyword, bbox, polygonLatLngs });
        spatialResults = areaResults.map(r => ({ polygon: r }));
      } else {
        if (dataSource === "osm") {
          const poiResults = await queryOSMPOI(mode, areaType, { keyword, bbox, polygonLatLngs });
          spatialResults = poiResults.map(r => ({ poi: r }));
        } else if (dataSource === "gaode") {
          if (!apiKey) throw new Error("高德 POI 查询需要 API Key");
          const poiResults = await queryGaodePOI(keyword || "", areaType, apiKey, region, bbox);
          spatialResults = poiResults.map(r => ({ poi: r }));
        } else if (dataSource === "baidu") {
          if (!apiKey) throw new Error("百度 POI 查询需要 API Key");
          const poiResults = await queryBaiduPOI(keyword || "", areaType, apiKey, region);
          spatialResults = poiResults.map(r => ({ poi: r }));
        }
      }

      setResults(spatialResults);
      return spatialResults;
    } catch (err) {
      let msg = "查询失败";
      if (err instanceof Error) {
        if (err.message.includes("504") || err.message.includes("Gateway") || err.message.includes("timeout") || err.message.includes("Timeout")) {
          msg = "服务器响应超时，请缩小查询范围或稍后再试";
        } else if (err.message.includes("429")) {
          msg = "请求过于频繁，请稍后再试";
        } else {
          msg = err.message;
        }
      }
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
