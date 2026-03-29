import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { motion, AnimatePresence } from "framer-motion";
import Papa from "papaparse";
import * as XLSX from "xlsx";
import {
  MapPin, Key, Eye, EyeOff, UploadCloud, FileText,
  Play, Download, CheckCircle2, XCircle, Loader2,
  Map, Settings, StopCircle, ChevronDown, Copy, Sun, Moon, History, Trash2, RotateCcw, Clock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";

import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { geocodeBatch, type MapSource, type GeocodeItem, type GeocodingConfig, queryOSMArea, type AreaResult, type AreaQueryType, type GeocodeCandidate, AREA_TYPE_LABELS } from "@/utils/geocoding";
import { exportCSV, exportGeoJSON, exportKML, exportMapPNG } from "@/utils/exportUtils";
import { GeoMap, type MapMarker, type GeoMapHandle, type CategoryColor, type MapPolygon } from "@/components/GeoMap";

const DEMO_ADDRESSES = "北京故宫\n上海东方明珠\n广州塔\n深圳平安金融中心\n成都大熊猫繁育研究基地";

const SOURCE_LABELS: Record<MapSource, string> = {
  gaode: "高德地图",
  baidu: "百度地图",
  osm: "OpenStreetMap",
};

// D3-inspired distinct color palette
const CATEGORY_PALETTE = [
  "#4e79a7", "#f28e2b", "#e15759", "#76b7b2", "#59a14f",
  "#edc948", "#b07aa1", "#ff9da7", "#9c755f", "#bab0ac",
  "#af7aa1", "#17becf", "#bcbd22", "#7f7f7f", "#e377c2",
];

function formatSeconds(s: number) {
  return s < 60 ? `${Math.round(s)} 秒` : `${Math.floor(s / 60)} 分 ${Math.round(s % 60)} 秒`;
}

const StatsCard = ({ title, value, icon, color }: {
  title: string; value: number | string;
  icon: React.ReactNode; color: "blue" | "emerald" | "rose";
}) => {
  const cm: Record<string, string> = {
    blue: "bg-primary/10 text-primary border-primary/20",
    emerald: "bg-emerald-100 text-emerald-600 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-400 dark:border-emerald-800",
    rose: "bg-rose-100 text-rose-600 border-rose-200 dark:bg-rose-950 dark:text-rose-400 dark:border-rose-800",
  };
  return (
    <div className={cn("flex items-center gap-3 rounded-xl border p-4", cm[color])}>
      <div className="shrink-0">{icon}</div>
      <div>
        <p className="text-xs font-medium opacity-70">{title}</p>
        <p className="text-xl font-bold">{value}</p>
      </div>
    </div>
  );
};

/* Parse uploaded CSV or Excel file into address list */
async function parseUploadFile(file: File): Promise<{ headers: string[]; rows: Record<string, string>[] }> {
  const ext = file.name.split(".").pop()?.toLowerCase();

  try {
    if (ext === "xlsx" || ext === "xls") {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const json = XLSX.utils.sheet_to_json<Record<string, string>>(ws, { defval: "" });
      const headers = json.length > 0 ? Object.keys(json[0]) : [];
      return {
        headers,
        rows: json
          .map(r => {
            const out: Record<string, string> = {};
            headers.forEach(h => { out[h] = String(r[h] ?? ""); });
            return out;
          })
          .filter(r => headers.some(h => r[h]?.trim())),
      };
    }

    // CSV — try UTF-8 first, fallback GBK
    return await new Promise<{ headers: string[]; rows: Record<string, string>[] }>((resolve, reject) => {
      const tryParse = (encoding: string) => {
        const reader = new FileReader();
        reader.onload = () => {
          try {
            const text = reader.result as string;
            Papa.parse<Record<string, string>>(text, {
              header: true,
              skipEmptyLines: "greedy",
              complete: (res) => {
                const fields = (res.meta.fields ?? []).filter(f => f.trim());
                if (!fields.length) {
                  if (encoding === "UTF-8") {
                    tryParse("GBK");
                    return;
                  }
                  reject(new Error("无法识别 CSV 表头"));
                  return;
                }
                // Filter empty rows
                const cleaned = (res.data ?? []).filter(row =>
                  fields.some(f => (row[f] ?? "").trim())
                );
                resolve({ headers: fields, rows: cleaned });
              },
              error: () => {
                if (encoding === "UTF-8") {
                  tryParse("GBK");
                } else {
                  reject(new Error("CSV 解析失败"));
                }
              },
            });
          } catch {
            if (encoding === "UTF-8") {
              tryParse("GBK");
            } else {
              reject(new Error("CSV 解析异常"));
            }
          }
        };
        reader.onerror = () => reject(new Error("文件读取失败"));
        reader.readAsText(file, encoding);
      };
      tryParse("UTF-8");
    });
  } catch (err) {
    throw err instanceof Error ? err : new Error("文件解析失败");
  }
}

function getSystemDarkMode() {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function getInitialDarkMode(): boolean {
  if (typeof window === "undefined") return false;
  const stored = localStorage.getItem("theme");
  if (stored === "dark") return true;
  if (stored === "light") return false;
  return getSystemDarkMode();
}

export default function Index() {
  const { t, i18n } = useTranslation();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const geoMapRef = useRef<GeoMapHandle>(null);

  const [gaodeKey, setGaodeKey] = useState("");
  const [baiduKey, setBaiduKey] = useState("");
  const [showGaode, setShowGaode] = useState(false);
  const [showBaidu, setShowBaidu] = useState(false);
  const [mapSource, setMapSource] = useState<MapSource>("osm");
  const [regionFilter, setRegionFilter] = useState("");

  const [inputMode, setInputMode] = useState<"text" | "file">("text");
  const [textInput, setTextInput] = useState("");
  const [fileData, setFileData] = useState<Record<string, string>[]>([]);
  const [fileHeaders, setFileHeaders] = useState<string[]>([]);
  const [selectedColumn, setSelectedColumn] = useState("");
  const [fileName, setFileName] = useState("");

  // Category column
  const [categoryColumn, setCategoryColumn] = useState("");
  const [customColors, setCustomColors] = useState<Record<string, string>>({});

  const [isProcessing, setIsProcessing] = useState(false);
  const [completed, setCompleted] = useState(0);
  const [total, setTotal] = useState(0);
  const [startTime, setStartTime] = useState<number | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Track abort/pause state to control toast/logical flow
  const abortedRef = useRef(false);

  const [results, setResults] = useState<GeocodeItem[]>([]);
  const [isDone, setIsDone] = useState(false);

  // Cancel dialog
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [pendingAddresses, setPendingAddresses] = useState<string[]>([]);

  // Candidate selection
  const [candidateDialog, setCandidateDialog] = useState<{ address: string; candidates: GeocodeCandidate[] } | null>(null);

  // History
  const [showHistoryDialog, setShowHistoryDialog] = useState(false);
  const [historyList, setHistoryList] = useState<HistoryItem[]>([]);

  const HISTORY_KEY = "gc_history";

  interface HistoryItem {
    id: string;
    ts: number;
    source: MapSource;
    regionFilter: string;
    total: number;
    success: number;
    failed: number;
    results: GeocodeItem[];
  }

  function loadHistory(): HistoryItem[] {
    try {
      const raw = localStorage.getItem(HISTORY_KEY);
      if (!raw) return [];
      return JSON.parse(raw) as HistoryItem[];
    } catch {
      return [];
    }
  }

  function saveToHistory(item: HistoryItem) {
    try {
      const history = loadHistory();
      history.unshift(item);
      localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(0, 20)));
    } catch { /* ignore */ }
  }

  function deleteHistoryItem(id: string) {
    try {
      const history = loadHistory().filter(h => h.id !== id);
      localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
      setHistoryList(history);
    } catch { /* ignore */ }
  }

  function clearAllHistory() {
    try {
      localStorage.removeItem(HISTORY_KEY);
      setHistoryList([]);
    } catch { /* ignore */ }
  }

  // Auto-fit control
  const [autoFitDisabled, setAutoFitDisabled] = useState(false);

  // OSM area query
  const [queryMode, setQueryMode] = useState<"point" | "area">("point");
  const [areaKeyword, setAreaKeyword] = useState("");
  const [areaType, setAreaType] = useState<AreaQueryType>("building");
  const [areaResults, setAreaResults] = useState<AreaResult[]>([]);
  const [isQueryingArea, setIsQueryingArea] = useState(false);

  // Dark mode with system sync
  const [darkMode, setDarkMode] = useState(getInitialDarkMode);
  const [userOverride, setUserOverride] = useState(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem("theme") !== null;
  });

  useEffect(() => {
    document.documentElement.classList.toggle("dark", darkMode);
    if (userOverride) {
      localStorage.setItem("theme", darkMode ? "dark" : "light");
    }
  }, [darkMode, userOverride]);

  // Listen to system theme changes
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = (e: MediaQueryListEvent) => {
      if (!userOverride) {
        setDarkMode(e.matches);
      }
    };
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [userOverride]);

  const toggleDarkMode = () => {
    setUserOverride(true);
    setDarkMode(prev => !prev);
  };

  // Drag state
  const [isDragging, setIsDragging] = useState(false);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    try {
      const { headers, rows } = await parseUploadFile(file);
      setFileData(rows);
      setFileHeaders(headers);
      setFileName(file.name);
      setInputMode("file");
      const guess = headers.find(f => /地址|address|位置|名称|name/i.test(f)) || headers[0];
      setSelectedColumn(guess);
      setCategoryColumn("");
    } catch (err) {
      toast({ title: t("toast.parseError"), description: err instanceof Error ? err.message : t("toast.fileFormat"), variant: "destructive" });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toast, t]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  useEffect(() => {
    const map = geoMapRef.current?.getMap();
    if (!map) return;
    const disable = () => setAutoFitDisabled(true);
    map.on("mousedown touchstart", disable);
    return () => { map.off("mousedown touchstart", disable); };
  });

  // beforeunload guard
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (isProcessing) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isProcessing]);

  // Category unique values & color mapping
  const categoryValues = useMemo(() => {
    if (!categoryColumn || !fileData.length) return [];
    const set = new Set<string>();
    fileData.forEach(row => {
      const v = row[categoryColumn]?.trim();
      if (v) set.add(v);
    });
    return Array.from(set);
  }, [categoryColumn, fileData]);

  // Initialize default colors when category values change
  useEffect(() => {
    if (categoryValues.length === 0) return;
    setCustomColors(prev => {
      const next = { ...prev };
      categoryValues.forEach((v, i) => {
        if (!next[v]) next[v] = CATEGORY_PALETTE[i % CATEGORY_PALETTE.length];
      });
      return next;
    });
  }, [categoryValues]);

  const mapMarkers: MapMarker[] = results
    .filter(r => r.status === "success" && r.lat && r.lng)
    .map(r => ({
      lat: parseFloat(r.lat!),
      lng: parseFloat(r.lng!),
      label: r.address,
      category: r.category,
    }));

  const categoryColorList: CategoryColor[] = useMemo(() => {
    return categoryValues.map(v => ({
      category: v,
      color: customColors[v] || CATEGORY_PALETTE[0],
    }));
  }, [categoryValues, customColors]);

  const mapPolygons: MapPolygon[] = areaResults.map((r, i) => ({
    id: `${r.osmId}`,
    rings: r.polygon,
    label: r.name,
    tags: r.tags,
    osmId: r.osmId,
    osmType: r.osmType,
  }));

  const progress = total > 0 ? Math.min(Math.round((completed / total) * 100), 100) : 0;
  const eta = (() => {
    if (!isProcessing || completed === 0 || !startTime) return null;
    return ((elapsedMs / 1000) / completed) * (total - completed);
  })();
  const successCount = results.filter(r => r.status === "success").length;
  const failedCount = results.filter(r => r.status === "failed").length;

  const getAddresses = useCallback((): string[] => {
    if (inputMode === "text") {
      return textInput.split("\n").map(s => s.trim()).filter(Boolean);
    }
    if (!selectedColumn) return [];
    return fileData.map(row => row[selectedColumn]?.trim()).filter(Boolean) as string[];
  }, [inputMode, textInput, fileData, selectedColumn]);

  const resolveAddresses = useCallback((): string[] => {
    const addrs = getAddresses();
    if (addrs.length === 0 && inputMode === "text") {
      return DEMO_ADDRESSES.split("\n").map(s => s.trim()).filter(Boolean);
    }
    return addrs;
  }, [getAddresses, inputMode]);

  const addressCount = getAddresses().length;
  const keyMissing = (mapSource === "gaode" && !gaodeKey.trim()) || (mapSource === "baidu" && !baiduKey.trim());
  const canStart = !keyMissing && !isProcessing && queryMode === "point";

  const startTimer = (t0: number) => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => setElapsedMs(Date.now() - t0), 500);
  };
  const stopTimer = () => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const { headers, rows } = await parseUploadFile(file);
      setFileData(rows);
      setFileHeaders(headers);
      setFileName(file.name);
      const guess = headers.find(f => /地址|address|位置|名称|name/i.test(f)) || headers[0];
      setSelectedColumn(guess);
      setCategoryColumn("");
    } catch (err) {
      toast({ title: t("toast.parseError"), description: err instanceof Error ? err.message : t("toast.fileFormat"), variant: "destructive" });
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const runGeocoding = async (addresses: string[], resumeResults: GeocodeItem[] = []) => {
    const config: GeocodingConfig = {
      source: mapSource,
      gaodeKey: gaodeKey.trim() || undefined,
      baiduKey: baiduKey.trim() || undefined,
      regionFilter: regionFilter.trim() || undefined,
    };

    abortRef.current = new AbortController();
    setResults(resumeResults);
    setCompleted(resumeResults.length);
    setTotal(resumeResults.length + addresses.length);
    setIsDone(false);
    setIsProcessing(true);
    setAutoFitDisabled(false);
    const t0 = Date.now();
    setStartTime(t0);
    setElapsedMs(0);
    startTimer(t0);

    try {
      // Build optional address -> category mapping for export and UI
      let addressToCategory: Map<string, string> | undefined;
      if (categoryColumn && fileData.length > 0) {
        addressToCategory = new globalThis.Map<string, string>();
        fileData.forEach(row => {
          const addr = row[selectedColumn]?.trim();
          const cat = row[categoryColumn]?.trim();
          if (addr && cat) addressToCategory.set(addr, cat);
        });
      }
      const newResults = await geocodeBatch(
        addresses, config,
        (prog) => {
          setCompleted(resumeResults.length + prog.completed);
          if (prog.latestResult) {
            if (addressToCategory?.has((prog.latestResult as GeocodeItem).address)) {
              ;(prog.latestResult as GeocodeItem).category = addressToCategory.get((prog.latestResult as GeocodeItem).address)!;
            }
            setResults(prev => [...prev, prog.latestResult!]);
          }
        },
        abortRef.current.signal,
        addressToCategory,
      );
      setIsDone(true);
      const all = [...resumeResults, ...newResults];
      const sc = all.filter(r => r.status === "success").length;
      const fc = all.filter(r => r.status === "failed").length;
      if (!abortedRef.current) {
        toast({ title: t("toast.conversionDone"), description: t("toast.successCount", { success: sc, failed: fc }) });
        saveToHistory({
          id: `h_${Date.now()}`,
          ts: Date.now(),
          source: mapSource,
          regionFilter: regionFilter.trim(),
          total: all.length,
          success: sc,
          failed: fc,
          results: all,
        });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : t("toast.unknownError");
      toast({ title: t("toast.conversionInterrupted"), description: msg, variant: "destructive" });
    } finally {
      stopTimer();
      setIsProcessing(false);
    }
  };

  const handleConvert = () => {
    abortedRef.current = false;
    const addresses = resolveAddresses();
    if (addresses.length === 0) {
      toast({ title: t("toast.noAddress"), variant: "destructive" });
      return;
    }
    if (!canStart) return;
    setPendingAddresses(addresses);
    runGeocoding(addresses);
  };

  const handleAreaQuery = async () => {
    const kw = areaKeyword.trim();
    if (!kw) {
      toast({ title: t("toast.noKeyword"), variant: "destructive" });
      return;
    }
    const zoom = geoMapRef.current?.getZoom() ?? 0;
    if (zoom < 15) {
      toast({ title: t("toast.zoomTooLow"), variant: "destructive" });
      return;
    }
    setIsQueryingArea(true);
    setAreaResults([]);
    try {
      const results = await queryOSMArea(kw, areaType);
      setAreaResults(results);
        if (results.length === 0) {
          toast({ title: t("toast.areaNoResult"), description: t("toast.areaNoResultHint", { keyword: kw }) });
        } else {
          toast({ title: t("toast.areaQueryDone", { count: results.length }), description: t("toast.areaQueryType", { type: AREA_TYPE_LABELS[areaType] }) });
        }
    } catch (err) {
        toast({
        title: t("toast.areaQueryFail"),
        description: err instanceof Error ? err.message : t("toast.areaQueryFail"),
        variant: "destructive",
      });
    } finally {
      setIsQueryingArea(false);
    }
  };

  const handleStop = () => {
    abortRef.current?.abort();
    stopTimer();
    setIsProcessing(false);
    setShowCancelDialog(true);
    abortedRef.current = true;
  };

  const handleResume = () => {
    setShowCancelDialog(false);
    const processedAddrs = new Set(results.map(r => r.address));
    const remaining = pendingAddresses.filter(a => !processedAddrs.has(a));
    if (remaining.length === 0) {
      setIsDone(true);
      return;
    }
    abortedRef.current = false;
    runGeocoding(remaining, results);
  };

  const handleConfirmCancel = () => {
    setShowCancelDialog(false);
    setIsDone(true);
  };

  const handleCopyCoords = (r: GeocodeItem) => {
    if (r.lng && r.lat) {
      navigator.clipboard.writeText(`${r.lng},${r.lat}`);
      toast({ title: t("toast.copied"), description: `${r.lng},${r.lat}` });
    }
  };

  const handleExportPNG = async () => {
    if (!mapContainerRef.current) return;
    toast({ title: t("toast.screenshot"), description: t("toast.pleaseWait") });
    try {
      await exportMapPNG(mapContainerRef.current);
    } catch {
      toast({ title: t("toast.screenshotFail"), description: t("toast.screenshotHint"), variant: "destructive" });
    }
  };

  const displayCount = addressCount > 0 ? addressCount : (inputMode === "text" ? 5 : 0);

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Header */}
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="mb-8 text-center relative">
          <button
            onClick={toggleDarkMode}
            className="absolute right-0 top-0 rounded-full p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            title={darkMode ? t("theme.light") : t("theme.dark")}
          >
            {darkMode ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
          </button>
          <button
            onClick={() => i18n.changeLanguage(i18n.language === "zh" ? "en" : "zh")}
            className="absolute right-12 top-0 rounded-full px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground border border-transparent hover:border-border"
          >
            {i18n.language === "zh" ? "EN" : "中文"}
          </button>
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
            <MapPin className="h-8 w-8 text-primary" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">{t("app.title")}</h1>
          <p className="mt-2 text-sm text-muted-foreground">{t("app.subtitle")}</p>
        </motion.div>

        {/* Settings + Input */}
        <div className="mb-6 grid gap-6 lg:grid-cols-[1fr_1.2fr]">
          {/* Settings */}
          <Card>
            <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Settings className="h-4 w-4" /> {t("settings.title")}
                  </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-muted-foreground">{t("settings.mapSource")}</label>
                <Select value={mapSource} onValueChange={(v) => setMapSource(v as MapSource)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="gaode">{t("settings.gaode")}</SelectItem>
                    <SelectItem value="baidu">{t("settings.baidu")}</SelectItem>
                    <SelectItem value="osm">{t("settings.osm")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center justify-between rounded-lg border bg-accent/40 px-3 py-2">
                <div className="flex flex-col gap-0.5">
                  <span className="text-xs font-medium">{t("areaQuery.title")}</span>
                  <span className="text-xs text-muted-foreground">{t("areaQuery.desc")}</span>
                </div>
                <Switch
                  checked={queryMode === "area"}
                  onCheckedChange={(checked) => {
                    setQueryMode(checked ? "area" : "point");
                    setAreaResults([]);
                  }}
                />
              </div>

              {queryMode === "area" && (
                <div className="space-y-3 rounded-lg border border-primary/20 bg-primary/5 p-3">
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-muted-foreground">{t("areaQuery.type")}</label>
                    <Select value={areaType} onValueChange={(v) => setAreaType(v as AreaQueryType)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="building">🏢 {t("areaQuery.building")}</SelectItem>
                        <SelectItem value="residential">🏘️ {t("areaQuery.residential")}</SelectItem>
                        <SelectItem value="park">🏞️ {t("areaQuery.park")}</SelectItem>
                        <SelectItem value="commercial">🏬 {t("areaQuery.commercial")}</SelectItem>
                        <SelectItem value="administrative">🏛️ {t("areaQuery.administrative")}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-muted-foreground">{t("areaQuery.keyword")}</label>
                    <div className="flex gap-2">
                      <Input
                        value={areaKeyword}
                        onChange={(e) => setAreaKeyword(e.target.value)}
                        placeholder={t("areaQuery.keywordPlaceholder")}
                        className="flex-1"
                        onKeyDown={(e) => e.key === "Enter" && handleAreaQuery()}
                      />
                      <Button onClick={handleAreaQuery} disabled={isQueryingArea} size="default">
                        {isQueryingArea ? <><Loader2 className="h-4 w-4 animate-spin" /> {t("toast.areaQuery")}</> : <><Play className="h-4 w-4" /> {t("areaQuery.query")}</>}
                      </Button>
                    </div>
                  </div>
                  {areaResults.length > 0 && (
                    <p className="text-xs text-muted-foreground">
                      ✅ {t("areaQuery.rendered", { count: areaResults.length })}
                    </p>
                  )}
                </div>
              )}

                {mapSource === "osm" && (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300">
                    ⚠️ {t("settings.osmWarning")}
                  </div>
                )}

              {mapSource === "gaode" && (
                <div>
                  <label className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                    <Key className="h-3 w-3" /> {t("settings.gaodeKey")}
                  </label>
                  <div className="relative">
                    <Input type={showGaode ? "text" : "password"} value={gaodeKey} onChange={(e) => setGaodeKey(e.target.value)} placeholder={t("settings.gaodeKeyPlaceholder")} className="pr-10" />
                    <button type="button" onClick={() => setShowGaode(!showGaode)} className="absolute inset-y-0 right-0 flex items-center pr-3 text-muted-foreground hover:text-foreground">
                      {showGaode ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{t("settings.gaodeKeyHint")}</p>
                </div>
              )}

              {mapSource === "baidu" && (
                <div>
                  <label className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                    <Key className="h-3 w-3" /> {t("settings.baiduKey")}
                  </label>
                  <div className="relative">
                    <Input type={showBaidu ? "text" : "password"} value={baiduKey} onChange={(e) => setBaiduKey(e.target.value)} placeholder={t("settings.baiduKeyPlaceholder")} className="pr-10" />
                    <button type="button" onClick={() => setShowBaidu(!showBaidu)} className="absolute inset-y-0 right-0 flex items-center pr-3 text-muted-foreground hover:text-foreground">
                      {showBaidu ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{t("settings.baiduKeyHint")}</p>
                </div>
              )}

              {mapSource === "osm" && (
                  <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                    ✅ {t("settings.osmFree")}
                  </div>
              )}

              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 w-full"
                onClick={() => { setHistoryList(loadHistory()); setShowHistoryDialog(true); }}
              >
                <History className="h-3.5 w-3.5" /> {t("settings.history")}
              </Button>

              <div>
                <label className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                  <MapPin className="h-3 w-3" /> {t("settings.regionFilter")}
                </label>
                <Input
                  value={regionFilter}
                  onChange={(e) => setRegionFilter(e.target.value)}
                  placeholder={mapSource === "osm" ? t("settings.regionFilterOsm") : t("settings.regionFilterOther")}
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  {mapSource === "osm" ? t("settings.regionFilterHintOsm") : t("settings.regionFilterHintOther")}
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Data Input */}
          <div className="min-w-0 w-full overflow-hidden">
            <Tabs value={inputMode} onValueChange={(v) => setInputMode(v as "text" | "file")}>
              <TabsList className="w-full">
                <TabsTrigger value="text" className="flex-1 gap-1.5">
                  <FileText className="h-4 w-4" /> {t("input.textTab")}
                </TabsTrigger>
                <TabsTrigger value="file" className="flex-1 gap-1.5">
                  <UploadCloud className="h-4 w-4" /> {t("input.fileTab")}
                </TabsTrigger>
              </TabsList>
              <TabsContent value="text" className="mt-3">
                <Textarea
                  value={textInput}
                  onChange={(e) => setTextInput(e.target.value)}
                  placeholder={DEMO_ADDRESSES}
                  className="min-h-[200px] resize-y"
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  {t("input.textHint")}
                </p>
              </TabsContent>
              <TabsContent value="file" className="mt-3">
                <div className="min-w-0 w-full space-y-3 overflow-hidden">
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    onDragOver={handleDragOver}
                    onDragEnter={handleDragEnter}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                    className={cn(
                      "flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed p-8 transition-colors",
                      isDragging
                        ? "border-primary bg-primary/10"
                        : "border-muted-foreground/20 hover:border-primary/40 hover:bg-accent/50"
                    )}
                  >
                    <UploadCloud className={cn("mb-2 h-8 w-8", isDragging ? "text-primary" : "text-muted-foreground")} />
                    <p className="text-sm font-medium text-muted-foreground">
                      {isDragging ? t("input.fileUploading") : t("input.fileDrag")}
                    </p>
                    <p className="text-xs text-muted-foreground">{t("input.fileHint")}</p>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                      className="hidden"
                      onChange={handleFileUpload}
                    />
                  </div>
                  {fileHeaders.length > 0 && (
                    <>
                      <div className="grid gap-3 sm:grid-cols-2">
                          <div>
                            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                              📂 {fileName} — {t("input.addressCol")}
                            </label>
                            <Select value={selectedColumn} onValueChange={setSelectedColumn}>
                              <SelectTrigger><SelectValue /></SelectTrigger>
                              <SelectContent>
                                {fileHeaders.map(h => <SelectItem key={h} value={h}>{h}</SelectItem>)}
                              </SelectContent>
                            </Select>
                            <p className="mt-1 text-xs text-muted-foreground">{t("input.rowsLoaded", { count: fileData.length })}</p>
                          </div>
                          <div>
                            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                              🏷️ {t("input.categoryCol")}
                            </label>
                            <Select value={categoryColumn} onValueChange={setCategoryColumn}>
                              <SelectTrigger><SelectValue placeholder={t("input.noCategory")} /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="__none__">{t("input.noCategory")}</SelectItem>
                                {fileHeaders.filter(h => h !== selectedColumn).map(h => <SelectItem key={h} value={h}>{h}</SelectItem>)}
                              </SelectContent>
                            </Select>
                          </div>
                      </div>

                      {/* Category color editor */}
                      {categoryColumn && categoryColumn !== "__none__" && categoryValues.length > 0 && (
                        <div className="rounded-lg border p-3">
                          <p className="mb-2 text-xs font-medium text-muted-foreground">🎨 {t("input.categoryColors")}</p>
                          <div className="flex flex-wrap gap-2">
                            {categoryValues.map(v => (
                              <label key={v} className="flex cursor-pointer items-center gap-1.5 rounded-md border px-2 py-1 text-xs transition-colors hover:bg-accent">
                                <input
                                  type="color"
                                  value={customColors[v] || CATEGORY_PALETTE[0]}
                                  onChange={(e) => setCustomColors(prev => ({ ...prev, [v]: e.target.value }))}
                                  className="h-4 w-4 cursor-pointer border-0 p-0"
                                />
                                <span className="max-w-[100px] truncate">{v}</span>
                              </label>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Preview table */}
                      <div className="min-w-0 w-full overflow-hidden">
                        <Table
                          className="w-full whitespace-nowrap text-left text-sm"
                          containerClassName="w-full overflow-x-auto overflow-y-auto max-h-[300px] border rounded-md"
                        >
                          <TableHeader className="sticky top-0 z-10 bg-card">
                            <TableRow>
                              {fileHeaders.map(h => (
                                <TableHead
                                  key={h}
                                  title={h}
                                  className={cn("max-w-xs truncate whitespace-nowrap text-xs", h === selectedColumn && "bg-primary/10 font-bold")}
                                >
                                  {h}
                                </TableHead>
                              ))}
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {fileData.slice(0, 5).map((row, i) => (
                              <TableRow key={i}>
                                {fileHeaders.map(h => (
                                  <TableCell
                                    key={h}
                                    title={String(row[h] ?? "")}
                                    className={cn("max-w-xs truncate whitespace-nowrap text-xs", h === selectedColumn && "bg-primary/5 font-medium")}
                                  >
                                    {row[h] ?? ""}
                                  </TableCell>
                                ))}
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                        {fileData.length > 5 && (
                          <p className="pt-2 text-center text-xs text-muted-foreground">
                            {t("input.previewRows", { count: fileData.length })}
                          </p>
                        )}
                      </div>
                    </>
                  )}
                </div>
              </TabsContent>
            </Tabs>
          </div>
        </div>

        {/* Convert Button */}
        <div className="mb-6">
          {isProcessing ? (
            <Button variant="destructive" size="lg" className="w-full gap-2" onClick={handleStop}>
              <StopCircle className="h-5 w-5" /> {t("convert.stop")}
            </Button>
          ) : (
            <Button size="lg" className="w-full gap-2" disabled={!canStart} onClick={handleConvert}>
              {queryMode === "area" ? <><Map className="h-5 w-5" /> {t("convert.areaMode")}</> : <><Play className="h-5 w-5" /> {t("convert.start", { source: SOURCE_LABELS[mapSource], count: displayCount })}</>}
            </Button>
          )}
        </div>

        {/* Progress */}
        <AnimatePresence>
          {(isProcessing || isDone) && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="mb-6">
              <Card>
                <CardContent className="pt-6">
                  <div className="mb-4 flex items-center justify-between text-sm">
                    <span className="flex items-center gap-1.5 text-muted-foreground">
                      {isProcessing ? (
                        <><Loader2 className="h-4 w-4 animate-spin" /> {t("progress.processing")}</>
                      ) : (
                        <><CheckCircle2 className="h-4 w-4 text-emerald-500" /> {t("progress.done")}</>
                      )}
                    </span>
                    <span className="font-mono text-xs text-muted-foreground">
                      {completed} / {total}
                      {eta !== null && ` · ${t("progress.remaining", { time: formatSeconds(eta) })}`}
                    </span>
                  </div>
                  <Progress value={progress} className="h-2" />
                  <div className="mt-4 grid grid-cols-3 gap-3">
                    <StatsCard title={t("progress.total")} value={total} icon={<Map className="h-5 w-5" />} color="blue" />
                    <StatsCard title={t("progress.success")} value={successCount} icon={<CheckCircle2 className="h-5 w-5" />} color="emerald" />
                    <StatsCard title={t("progress.failed")} value={failedCount} icon={<XCircle className="h-5 w-5" />} color="rose" />
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Map */}
        <Card className="mb-6">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-base">
                <Map className="h-4 w-4" /> {t("map.title")}
              </CardTitle>
              <span className="text-xs text-muted-foreground">
                {mapMarkers.length > 0 || mapPolygons.length > 0
                  ? `${mapMarkers.length > 0 ? t("map.markers", { count: mapMarkers.length }) : ""}${mapMarkers.length > 0 && mapPolygons.length > 0 ? " · " : ""}${mapPolygons.length > 0 ? t("map.polygons", { count: mapPolygons.length }) : ""}`
                  : t("map.waiting")}
              </span>
            </div>
          </CardHeader>
          <CardContent>
            <div ref={mapContainerRef} className="h-[400px] overflow-hidden rounded-xl border">
              <GeoMap
                ref={geoMapRef}
                markers={mapMarkers}
                polygons={mapPolygons}
                className="h-full w-full"
                autoFitDisabled={autoFitDisabled}
                categoryColors={categoryColorList.length > 0 ? categoryColorList : undefined}
              />
            </div>
          </CardContent>
        </Card>

        {/* Results Table + Export */}
        <AnimatePresence>
          {results.length > 0 && (
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="min-w-0 w-full overflow-hidden">
              <Card>
                <CardHeader className="pb-3">
                      <div className="flex items-center justify-between">
                        <CardTitle className="flex items-center gap-2 text-base">
                          {t("results.title")}
                          <Badge variant="secondary" className="ml-1">{results.length} {t("stats.tooltipCount")}</Badge>
                        </CardTitle>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="outline" size="sm" className="gap-1.5">
                              <Download className="h-4 w-4" /> {t("results.export")} <ChevronDown className="h-3 w-3" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => exportCSV(results)}>📄 {t("results.exportCSV")}</DropdownMenuItem>
                            <DropdownMenuItem onClick={() => exportGeoJSON(results)}>🗺️ {t("results.exportGeoJSON")}</DropdownMenuItem>
                            <DropdownMenuItem onClick={() => exportKML(results)}>📍 {t("results.exportKML")}</DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={handleExportPNG}>🖼️ {t("results.exportPNG")}</DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                  </div>
                </CardHeader>
                <CardContent className="min-w-0 overflow-hidden">
                    <Table
                      className="w-full whitespace-nowrap text-left text-sm"
                      containerClassName="w-full overflow-x-auto overflow-y-auto max-h-[500px] border rounded-md"
                    >
                      <TableHeader className="sticky top-0 z-10 bg-card">
                        <TableRow>
                          <TableHead className="max-w-xs truncate whitespace-nowrap" title="Address">{t("results.address")}</TableHead>
                          <TableHead className="whitespace-nowrap">{t("results.lng")}</TableHead>
                          <TableHead className="whitespace-nowrap">{t("results.lat")}</TableHead>
                          <TableHead className="max-w-sm truncate whitespace-nowrap" title="Formatted Address">{t("results.formatted")}</TableHead>
                          <TableHead className="whitespace-nowrap">{t("results.category")}</TableHead>
                          <TableHead className="whitespace-nowrap">{t("results.status")}</TableHead>
                          <TableHead className="w-[60px] whitespace-nowrap">{t("results.action")}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {results.map((r, i) => (
                          <TableRow key={i}>
                            <TableCell className="max-w-xs truncate whitespace-nowrap font-medium" title={r.address}>{r.address}</TableCell>
                            <TableCell className="whitespace-nowrap font-mono text-xs">{r.lng ?? "-"}</TableCell>
                            <TableCell className="whitespace-nowrap font-mono text-xs">{r.lat ?? "-"}</TableCell>
                            <TableCell className="max-w-sm truncate whitespace-nowrap text-xs text-muted-foreground" title={r.formattedAddress ?? "-"}>{r.formattedAddress ?? "-"}</TableCell>
                            <TableCell className="whitespace-nowrap text-xs">
                              {r.category ? (
                                <Badge variant="outline" className="text-xs">{r.category}</Badge>
                              ) : "-"}
                            </TableCell>
                            <TableCell className="whitespace-nowrap">
                              {r.status === "success" ? (
                                <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-900 dark:text-emerald-300">{t("progress.success")}</Badge>
                              ) : (
                                <Badge variant="destructive" className="text-xs">{r.error || t("progress.failed")}</Badge>
                              )}
                            </TableCell>
                            <TableCell>
                              {r.status === "success" && r.candidates && r.candidates.length > 1 && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-7 gap-1 text-xs"
                                  onClick={() => setCandidateDialog({ address: r.address, candidates: r.candidates! })}
                                >
                                  <MapPin className="h-3 w-3" /> {t("results.select")}
                                </Button>
                              )}
                              {r.status === "success" && (!r.candidates || r.candidates.length <= 1) && (
                                <button
                                  onClick={() => handleCopyCoords(r)}
                                  className="rounded p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                                  title={t("results.copyCoords")}
                                >
                                  <Copy className="h-3.5 w-3.5" />
                                </button>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                </CardContent>
              </Card>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Candidate Selection Dialog */}
      <AlertDialog open={!!candidateDialog} onOpenChange={() => setCandidateDialog(null)}>
        <AlertDialogContent className="max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <MapPin className="h-4 w-4" /> {t("candidate.title", { address: candidateDialog?.address })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("candidate.description", { count: candidateDialog?.candidates.length })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="max-h-[400px] overflow-y-auto space-y-2 py-2">
            {candidateDialog?.candidates.map((c, i) => (
              <button
                key={i}
                className="w-full text-left rounded-lg border p-3 hover:border-primary hover:bg-accent/50 transition-colors"
                onClick={() => {
                  setResults(prev => prev.map(r =>
                    r.address === candidateDialog.address
                      ? { ...r, lng: c.lng, lat: c.lat, formattedAddress: c.formattedAddress }
                      : r
                  ));
                  setCandidateDialog(null);
                  toast({ title: t("toast.candidateSelected"), description: c.formattedAddress });
                }}
              >
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 shrink-0">
                    <Badge variant="outline" className="text-xs">#{i + 1}</Badge>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{c.formattedAddress}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {c.province}{c.city ? ` · ${c.city}` : ""}{c.district ? ` · ${c.district}` : ""}
                    </p>
                    <p className="text-xs font-mono text-muted-foreground mt-0.5">{c.lng}, {c.lat}</p>
                    {c.level && <Badge variant="secondary" className="mt-1 text-xs">{c.level}</Badge>}
                  </div>
                </div>
              </button>
            ))}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setCandidateDialog(null)}>{t("candidate.cancel")}</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* History Dialog */}
      <AlertDialog open={showHistoryDialog} onOpenChange={setShowHistoryDialog}>
        <AlertDialogContent className="max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <History className="h-4 w-4" /> {t("history.title")}
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div>
                <p>{t("history.description")}</p>
                <p className="mt-1 text-muted-foreground">
                  {t("history.total", { count: historyList.length })}
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="max-h-[400px] overflow-y-auto space-y-2 py-2">
            {historyList.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">{t("history.noHistory")}</p>
            ) : (
              historyList.map(item => (
                <div key={item.id} className="flex items-center justify-between rounded-lg border p-3 gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge variant="outline" className="text-xs">
                        {SOURCE_LABELS[item.source]}
                      </Badge>
                      {item.regionFilter && (
                        <span className="text-xs text-muted-foreground truncate">{item.regionFilter}</span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {new Date(item.ts).toLocaleString(i18n.language === "en" ? "en-US" : "zh-CN")}
                    </p>
                    <p className="text-xs mt-0.5">
                      <span className="text-emerald-600">{t("history.success")} {item.success}</span>
                      {item.failed > 0 && <span className="text-rose-500 ml-2">{t("history.failed")} {item.failed}</span>}
                      <span className="text-muted-foreground ml-2">{t("history.total2", { count: item.total })}</span>
                    </p>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 gap-1"
                      onClick={() => {
                        setResults(item.results);
                        setIsDone(true);
                        setTotal(item.total);
                        setCompleted(item.total);
                        setShowHistoryDialog(false);
                        toast({ title: t("toast.historyLoaded"), description: t("toast.historyLoadedHint", { count: item.total }) });
                      }}
                    >
                      <RotateCcw className="h-3 w-3" /> {t("history.load")}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 w-8 p-0 text-rose-500"
                      onClick={() => deleteHistoryItem(item.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => { clearAllHistory(); }}>
              <Trash2 className="h-3.5 w-3.5 mr-1" /> {t("history.clearAll")}
            </AlertDialogCancel>
            <AlertDialogAction onClick={() => setShowHistoryDialog(false)}>{t("history.close")}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Cancel Dialog */}
      <AlertDialog open={showCancelDialog} onOpenChange={setShowCancelDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("cancel.title")}</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                <p>{t("cancel.processed", { total: results.length, success: successCount, failed: failedCount })}</p>
                <p>{t("cancel.remaining", { count: pendingAddresses.length - results.length })}</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={handleConfirmCancel}>{t("cancel.confirm")}</AlertDialogCancel>
            <AlertDialogAction onClick={handleResume}>{t("cancel.resume")}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
