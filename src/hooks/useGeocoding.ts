import { useState, useCallback, useRef } from "react";
import { geocodeBatch, type MapSource, type GeocodeItem, type GeocodingConfig } from "@/utils/geocoding";

export interface UseGeocodingReturn {
  results: GeocodeItem[];
  isProcessing: boolean;
  isDone: boolean;
  completed: number;
  total: number;
  elapsedMs: number;
  startGeocoding: (addresses: string[], config: GeocodingConfig, addressToCategory?: Map<string, string>) => void;
  stopGeocoding: () => void;
  reset: () => void;
  setResults: React.Dispatch<React.SetStateAction<GeocodeItem[]>>;
  setIsDone: React.Dispatch<React.SetStateAction<boolean>>;
  setTotal: React.Dispatch<React.SetStateAction<number>>;
  setCompleted: React.Dispatch<React.SetStateAction<number>>;
}

export function useGeocoding(): UseGeocodingReturn {
  const [results, setResults] = useState<GeocodeItem[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isDone, setIsDone] = useState(false);
  const [completed, setCompleted] = useState(0);
  const [total, setTotal] = useState(0);
  const [elapsedMs, setElapsedMs] = useState(0);

  const abortRef = useRef<AbortController | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopGeocoding = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const reset = useCallback(() => {
    stopGeocoding();
    setResults([]);
    setIsProcessing(false);
    setIsDone(false);
    setCompleted(0);
    setTotal(0);
    setElapsedMs(0);
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
  }, [stopGeocoding]);

  const startGeocoding = useCallback((
    addresses: string[],
    config: GeocodingConfig,
    addressToCategory?: Map<string, string>,
  ) => {
    abortRef.current = new AbortController();
    setResults([]);
    setCompleted(0);
    setTotal(addresses.length);
    setIsDone(false);
    setIsProcessing(true);
    const t0 = Date.now();
    setElapsedMs(0);
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => setElapsedMs(Date.now() - t0), 500);

    geocodeBatch(
      addresses,
      config,
      (prog) => {
        setCompleted(prog.completed);
        if (prog.latestResult) {
          if (addressToCategory?.has((prog.latestResult as GeocodeItem).address)) {
            (prog.latestResult as GeocodeItem).category = addressToCategory.get((prog.latestResult as GeocodeItem).address);
          }
          setResults(prev => [...prev, prog.latestResult as GeocodeItem]);
        }
      },
      abortRef.current.signal,
      addressToCategory,
    ).then(() => {
      setIsDone(true);
    }).catch((err) => {
      console.error("[geocodeBatch]", err);
    }).finally(() => {
      if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
      setIsProcessing(false);
    });
  }, []);

  return { results, isProcessing, isDone, completed, total, elapsedMs, startGeocoding, stopGeocoding, reset, setResults, setIsDone, setTotal, setCompleted };
}
