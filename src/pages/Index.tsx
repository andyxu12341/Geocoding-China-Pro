import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Papa from "papaparse";
import * as XLSX from "xlsx";
import {
  MapPin, Key, Eye, EyeOff, UploadCloud, FileText,
  Play, Download, CheckCircle2, XCircle, Loader2,
  Map, Settings, StopCircle, ChevronDown, Copy, Sun, Moon,
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
import { geocodeBatch, type MapSource, type GeocodeItem, type GeocodingConfig } from "@/utils/geocoding";
import { exportCSV, exportGeoJSON, exportKML, exportMapPNG } from "@/utils/exportUtils";
import { GeoMap, type MapMarker, type GeoMapHandle, type CategoryColor } from "@/components/GeoMap";

const BATCH_SIZE = 20;

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

  // Auto-fit control
  const [autoFitDisabled, setAutoFitDisabled] = useState(false);

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
      toast({ title: "解析失败", description: err instanceof Error ? err.message : "文件格式不正确", variant: "destructive" });
    }
  }, [toast]);

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

  // Build category-address mapping for markers
  const addressCategoryMap = useMemo((): globalThis.Map<string, string> => {
    if (!categoryColumn || !fileData.length) return new globalThis.Map();
    const map = new globalThis.Map<string, string>();
    fileData.forEach(row => {
      const addr = row[selectedColumn]?.trim();
      const cat = row[categoryColumn]?.trim();
      if (addr && cat) map.set(addr, cat);
    });
    return map;
  }, [categoryColumn, fileData, selectedColumn]);

  const mapMarkers: MapMarker[] = results
    .filter(r => r.status === "success" && r.lat && r.lng)
    .map(r => ({
      lat: parseFloat(r.lat!),
      lng: parseFloat(r.lng!),
      label: r.address,
      category: addressCategoryMap.get(r.address),
    }));

  const categoryColorList: CategoryColor[] = useMemo(() => {
    return categoryValues.map(v => ({
      category: v,
      color: customColors[v] || CATEGORY_PALETTE[0],
    }));
  }, [categoryValues, customColors]);

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
  const canStart = !keyMissing && !isProcessing;

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
      toast({ title: "解析失败", description: err instanceof Error ? err.message : "文件格式不正确", variant: "destructive" });
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
        BATCH_SIZE,
        addressToCategory,
      );
      setIsDone(true);
      const all = [...resumeResults, ...newResults];
      const sc = all.filter(r => r.status === "success").length;
      const fc = all.filter(r => r.status === "failed").length;
      if (!abortedRef.current) {
        toast({ title: "🎉 转换完成", description: `成功 ${sc} 条，失败 ${fc} 条。` });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "未知错误";
      toast({ title: "转换中断", description: msg, variant: "destructive" });
    } finally {
      stopTimer();
      setIsProcessing(false);
    }
  };

  const handleConvert = () => {
    abortedRef.current = false;
    const addresses = resolveAddresses();
    if (addresses.length === 0) {
      toast({ title: "请输入地址", variant: "destructive" });
      return;
    }
    if (!canStart) return;
    setPendingAddresses(addresses);
    runGeocoding(addresses);
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
      toast({ title: "已复制", description: `${r.lng},${r.lat}` });
    }
  };

  const handleExportPNG = async () => {
    if (!mapContainerRef.current) return;
    toast({ title: "正在生成截图...", description: "请稍候" });
    try {
      await exportMapPNG(mapContainerRef.current);
    } catch {
      toast({ title: "截图失败", description: "请切换至标准地图图层后重试", variant: "destructive" });
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
            title={darkMode ? "切换亮色模式" : "切换暗色模式"}
          >
            {darkMode ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
          </button>
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
            <MapPin className="h-8 w-8 text-primary" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">空间数据工作站</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            纯前端 · 零后端 · 高德 / 百度 / OpenStreetMap 三源批量地理编码 · GeoJSON / KML / PNG 导出
          </p>
        </motion.div>

        {/* Settings + Input */}
        <div className="mb-6 grid gap-6 lg:grid-cols-[1fr_1.2fr]">
          {/* Settings */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Settings className="h-4 w-4" /> API 设置
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-muted-foreground">地图数据源</label>
                <Select value={mapSource} onValueChange={(v) => setMapSource(v as MapSource)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="gaode">🗺️ 高德地图（推荐，国内最准）</SelectItem>
                    <SelectItem value="baidu">🔵 百度地图</SelectItem>
                    <SelectItem value="osm">🌍 OpenStreetMap（Nominatim，免费）</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {mapSource === "osm" && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300">
                  ⚠️ Nominatim 严格限速 1 次/秒，大批量建议使用高德或百度。
                </div>
              )}

              {mapSource === "gaode" && (
                <div>
                  <label className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                    <Key className="h-3 w-3" /> 高德 Web 服务 Key
                  </label>
                  <div className="relative">
                    <Input type={showGaode ? "text" : "password"} value={gaodeKey} onChange={(e) => setGaodeKey(e.target.value)} placeholder="输入高德 Web 服务 API Key..." className="pr-10" />
                    <button type="button" onClick={() => setShowGaode(!showGaode)} className="absolute inset-y-0 right-0 flex items-center pr-3 text-muted-foreground hover:text-foreground">
                      {showGaode ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">在高德开放平台创建「Web 服务」类型 Key</p>
                </div>
              )}

              {mapSource === "baidu" && (
                <div>
                  <label className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                    <Key className="h-3 w-3" /> 百度地图浏览器端 AK
                  </label>
                  <div className="relative">
                    <Input type={showBaidu ? "text" : "password"} value={baiduKey} onChange={(e) => setBaiduKey(e.target.value)} placeholder="输入百度地图 Browser 端 AK..." className="pr-10" />
                    <button type="button" onClick={() => setShowBaidu(!showBaidu)} className="absolute inset-y-0 right-0 flex items-center pr-3 text-muted-foreground hover:text-foreground">
                      {showBaidu ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">在百度地图开放平台创建 Browser/JS 类型 AK</p>
                </div>
              )}

              {mapSource === "osm" && (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                  ✅ OpenStreetMap 无需 API Key，完全免费开放。
                </div>
              )}

              <div>
                <label className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                  <MapPin className="h-3 w-3" /> 限定搜索区域（可选）
                </label>
                <Input
                  value={regionFilter}
                  onChange={(e) => setRegionFilter(e.target.value)}
                  placeholder={mapSource === "osm" ? "例如：China、Beijing" : "例如：山东 或 济南市"}
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  {mapSource === "osm" ? "填写后将强制在该区域搜索" : "填写后将强制在该区域内搜索，杜绝跨省误匹配"}
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Data Input */}
          <div className="min-w-0 w-full overflow-hidden">
            <Tabs value={inputMode} onValueChange={(v) => setInputMode(v as "text" | "file")}>
              <TabsList className="w-full">
                <TabsTrigger value="text" className="flex-1 gap-1.5">
                  <FileText className="h-4 w-4" /> 文本粘贴
                </TabsTrigger>
                <TabsTrigger value="file" className="flex-1 gap-1.5">
                  <UploadCloud className="h-4 w-4" /> 文件上传
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
                  每行一个地址。留空直接点击按钮可体验 Demo 数据。
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
                      {isDragging ? "松开鼠标即可上传" : "点击或拖拽上传 CSV / Excel 文件"}
                    </p>
                    <p className="text-xs text-muted-foreground">支持 .csv / .xls / .xlsx</p>
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
                            📂 {fileName} — 选择地址列
                          </label>
                          <Select value={selectedColumn} onValueChange={setSelectedColumn}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {fileHeaders.map(h => <SelectItem key={h} value={h}>{h}</SelectItem>)}
                            </SelectContent>
                          </Select>
                          <p className="mt-1 text-xs text-muted-foreground">已加载 {fileData.length} 行数据</p>
                        </div>
                        <div>
                          <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                            🏷️ 选择类别列（可选）
                          </label>
                          <Select value={categoryColumn} onValueChange={setCategoryColumn}>
                            <SelectTrigger><SelectValue placeholder="不使用类别" /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="__none__">不使用类别</SelectItem>
                              {fileHeaders.filter(h => h !== selectedColumn).map(h => <SelectItem key={h} value={h}>{h}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>

                      {/* Category color editor */}
                      {categoryColumn && categoryColumn !== "__none__" && categoryValues.length > 0 && (
                        <div className="rounded-lg border p-3">
                          <p className="mb-2 text-xs font-medium text-muted-foreground">🎨 类别颜色（点击色块自定义）</p>
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
                            仅显示前 5 行，共 {fileData.length} 行
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
              <StopCircle className="h-5 w-5" /> 停止转换
            </Button>
          ) : (
            <Button size="lg" className="w-full gap-2" disabled={!canStart} onClick={handleConvert}>
              <Play className="h-5 w-5" /> 开始转换 — {SOURCE_LABELS[mapSource]}（{displayCount} 条）
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
                        <><Loader2 className="h-4 w-4 animate-spin" /> 处理中...</>
                      ) : (
                        <><CheckCircle2 className="h-4 w-4 text-emerald-500" /> 完成</>
                      )}
                    </span>
                    <span className="font-mono text-xs text-muted-foreground">
                      {completed} / {total}
                      {eta !== null && ` · 预计剩余 ${formatSeconds(eta)}`}
                    </span>
                  </div>
                  <Progress value={progress} className="h-2" />
                  <div className="mt-4 grid grid-cols-3 gap-3">
                    <StatsCard title="总计" value={total} icon={<Map className="h-5 w-5" />} color="blue" />
                    <StatsCard title="成功" value={successCount} icon={<CheckCircle2 className="h-5 w-5" />} color="emerald" />
                    <StatsCard title="失败" value={failedCount} icon={<XCircle className="h-5 w-5" />} color="rose" />
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
                <Map className="h-4 w-4" /> 地理底图
              </CardTitle>
              <span className="text-xs text-muted-foreground">
                {mapMarkers.length > 0 ? `${mapMarkers.length} 个坐标点` : "等待地址输入..."}
              </span>
            </div>
          </CardHeader>
          <CardContent>
            <div ref={mapContainerRef} className="h-[400px] overflow-hidden rounded-xl border">
              <GeoMap
                ref={geoMapRef}
                markers={mapMarkers}
                className="h-full w-full"
                autoFitDisabled={autoFitDisabled}
                darkMode={darkMode}
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
                      转换结果
                      <Badge variant="secondary" className="ml-1">{results.length} 条</Badge>
                    </CardTitle>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="outline" size="sm" className="gap-1.5">
                          <Download className="h-4 w-4" /> 导出 <ChevronDown className="h-3 w-3" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => exportCSV(results)}>📄 导出 CSV</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => exportGeoJSON(results)}>🗺️ 导出 GeoJSON</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => exportKML(results)}>📍 导出 KML</DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={handleExportPNG}>🖼️ 导出地图 PNG</DropdownMenuItem>
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
                          <TableHead className="max-w-xs truncate whitespace-nowrap" title="地址">地址</TableHead>
                          <TableHead className="whitespace-nowrap">经度</TableHead>
                          <TableHead className="whitespace-nowrap">纬度</TableHead>
                          <TableHead className="max-w-sm truncate whitespace-nowrap" title="格式化地址">格式化地址</TableHead>
                          <TableHead className="whitespace-nowrap">类别</TableHead>
                          <TableHead className="whitespace-nowrap">状态</TableHead>
                          <TableHead className="w-[60px] whitespace-nowrap">操作</TableHead>
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
                                <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-900 dark:text-emerald-300">成功</Badge>
                              ) : (
                                <Badge variant="destructive" className="text-xs">{r.error || "失败"}</Badge>
                              )}
                            </TableCell>
                            <TableCell>
                              {r.status === "success" && (
                                <button
                                  onClick={() => handleCopyCoords(r)}
                                  className="rounded p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                                  title="复制坐标"
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

      {/* Cancel Dialog */}
      <AlertDialog open={showCancelDialog} onOpenChange={setShowCancelDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>转换已暂停</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                <p>已处理 <strong>{results.length}</strong> 条，其中成功 <strong>{successCount}</strong> 条，失败 <strong>{failedCount}</strong> 条。</p>
                <p>剩余 <strong>{pendingAddresses.length - results.length}</strong> 条未处理。</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={handleConfirmCancel}>确认取消</AlertDialogCancel>
            <AlertDialogAction onClick={handleResume}>继续转换</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
