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
      const msg = err instanceof Error ? err.message : "查询失败";
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
