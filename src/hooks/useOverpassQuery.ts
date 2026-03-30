import { useState, useCallback } from "react";
import { queryOSMArea, type AreaQueryType, type AreaQueryMode, type AreaResult } from "@/utils/geocoding";

export interface UseOverpassQueryReturn {
  results: AreaResult[];
  isLoading: boolean;
  error: string | null;
  fetchPolygons: (
    mode: AreaQueryMode,
    areaType: AreaQueryType,
    params: {
      keyword?: string;
      bbox?: [number, number, number, number];
      polygonLatLngs?: [number, number][];
    }
  ) => Promise<AreaResult[]>;
  reset: () => void;
}

export function useOverpassQuery(): UseOverpassQueryReturn {
  const [results, setResults] = useState<AreaResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchPolygons = useCallback(async (
    mode: AreaQueryMode,
    areaType: AreaQueryType,
    params: {
      keyword?: string;
      bbox?: [number, number, number, number];
      polygonLatLngs?: [number, number][];
    }
  ) => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await queryOSMArea(mode, areaType, params);
      setResults(data);
      return data;
    } catch (err) {
      let msg = "查询失败";
      if (err instanceof Error) {
        if (err.message.includes("504") || err.message.includes("Gateway") || err.message.includes("timeout") || err.message.includes("Timeout")) {
          msg = "Overpass 服务器响应超时，请缩小查询范围或稍后再试";
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

  return { results, isLoading, error, fetchPolygons, reset };
}
