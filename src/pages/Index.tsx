import { useState, useRef, useCallback, useEffect } from "react";
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
import { GeoMap, type MapMarker, type GeoMapHandle } from "@/components/GeoMap";

const BATCH_SIZE = 20;

const DEMO_ADDRESSES = "北京故宫\n上海东方明珠\n广州塔\n深圳平安金融中心\n成都大熊猫繁育研究基地";

const SOURCE_LABELS: Record<MapSource, string> = {
  gaode: "高德地图",
  baidu: "百度地图",
  osm: "OpenStreetMap",
};

function formatSeconds(s: number) {
  return s < 60 ? `${Math.round(s)} 秒` : `${Math.floor(s / 60)} 分 ${Math.round(s % 60)} 秒`;
}

const StatsCard = ({ title, value, icon, color }: {
  title: string; value: number | string;
  icon: React.ReactNode; color: "blue" | "emerald" | "rose";
}) => {
  const cm: Record<string, string> = {
    blue: "bg-primary/10 text-primary border-primary/20",
    emerald: "bg-emerald-100 text-emerald-600 border-emerald-200",
    rose: "bg-rose-100 text-rose-600 border-rose-200",
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

  if (ext === "xlsx" || ext === "xls") {
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: "array" });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const json = XLSX.utils.sheet_to_json<Record<string, string>>(ws, { defval: "" });
    const headers = json.length > 0 ? Object.keys(json[0]) : [];
    return { headers, rows: json.map(r => {
      const out: Record<string, string> = {};
      headers.forEach(h => { out[h] = String(r[h] ?? ""); });
      return out;
    })};
  }

  // CSV — try UTF-8 first, fallback GBK
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const text = reader.result as string;
      Papa.parse<Record<string, string>>(text, {
        header: true,
        skipEmptyLines: true,
        complete: (res) => {
          if (!res.meta.fields?.length) {
            reject(new Error("无法识别 CSV 表头"));
            return;
          }
          resolve({ headers: res.meta.fields, rows: res.data });
        },
        error: () => reject(new Error("CSV 解析失败")),
      });
    };
    // Try reading as UTF-8 first; if garbled, re-read as GBK
    reader.readAsText(file, "UTF-8");
  });
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

  const [inputMode, setInputMode] = useState<"text" | "file">("text");
  const [textInput, setTextInput] = useState("");
  const [fileData, setFileData] = useState<Record<string, string>[]>([]);
  const [fileHeaders, setFileHeaders] = useState<string[]>([]);
  const [selectedColumn, setSelectedColumn] = useState("");
  const [fileName, setFileName] = useState("");

  const [isProcessing, setIsProcessing] = useState(false);
  const [completed, setCompleted] = useState(0);
  const [total, setTotal] = useState(0);
  const [startTime, setStartTime] = useState<number | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [results, setResults] = useState<GeocodeItem[]>([]);
  const [isDone, setIsDone] = useState(false);

  // Cancel dialog
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [pendingAddresses, setPendingAddresses] = useState<string[]>([]);

  // Auto-fit control
  const [autoFitDisabled, setAutoFitDisabled] = useState(false);

  // Dark mode
  const [darkMode, setDarkMode] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("theme") === "dark";
    }
    return false;
  });

  useEffect(() => {
    document.documentElement.classList.toggle("dark", darkMode);
    localStorage.setItem("theme", darkMode ? "dark" : "light");
  }, [darkMode]);

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

  const mapMarkers: MapMarker[] = results
    .filter(r => r.status === "success" && r.lat && r.lng)
    .map(r => ({ lat: parseFloat(r.lat!), lng: parseFloat(r.lng!), label: r.address }));

  const progress = total > 0 ? Math.min(Math.round((completed / total) * 100), 100) : 0;
  const eta = (() => {
    if (!isProcessing || completed === 0 || !startTime) return null;
    return ((elapsedMs / 1000) / completed) * (total - completed);
  })();
  const successCount = results.filter(r => r.status === "success").length;
  const failedCount = results.filter(r => r.status === "failed").length;

  const getAddresses = useCallback((): string[] => {
    if (inputMode === "text") {
      const lines = textInput.split("\n").map(s => s.trim()).filter(Boolean);
      return lines;
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
      const newResults = await geocodeBatch(
        addresses, config,
        (prog) => {
          setCompleted(resumeResults.length + prog.completed);
          if (prog.latestResult) setResults(prev => [...prev, prog.latestResult!]);
        },
        abortRef.current.signal,
        BATCH_SIZE,
      );
      setIsDone(true);
      const sc = [...resumeResults, ...newResults].filter(r => r.status === "success").length;
      const fc = [...resumeResults, ...newResults].filter(r => r.status === "failed").length;
      toast({ title: "🎉 转换完成", description: `成功 ${sc} 条，失败 ${fc} 条。` });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "未知错误";
      toast({ title: "转换中断", description: msg, variant: "destructive" });
    } finally {
      stopTimer();
      setIsProcessing(false);
    }
  };

  const handleConvert = () => {
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
  };

  const handleResume = () => {
    setShowCancelDialog(false);
    const processedAddrs = new Set(results.map(r => r.address));
    const remaining = pendingAddresses.filter(a => !processedAddrs.has(a));
    if (remaining.length === 0) {
      setIsDone(true);
      return;
    }
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
            onClick={() => setDarkMode(!darkMode)}
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
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
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
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-700">
                  ✅ OpenStreetMap 无需 API Key，完全免费开放。
                </div>
              )}
            </CardContent>
          </Card>

          {/* Data Input */}
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
              <div className="space-y-3">
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
                    {/* Preview table */}
                    <div className="max-h-[200px] overflow-auto rounded-lg border">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            {fileHeaders.map(h => (
                              <TableHead key={h} className={cn("text-xs", h === selectedColumn && "bg-primary/10 font-bold")}>{h}</TableHead>
                            ))}
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {fileData.slice(0, 5).map((row, i) => (
                            <TableRow key={i}>
                              {fileHeaders.map(h => (
                                <TableCell key={h} className={cn("text-xs", h === selectedColumn && "bg-primary/5 font-medium")}>
                                  {row[h] ?? ""}
                                </TableCell>
                              ))}
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                      {fileData.length > 5 && (
                        <p className="p-2 text-center text-xs text-muted-foreground">
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
              <GeoMap ref={geoMapRef} markers={mapMarkers} className="h-full w-full" autoFitDisabled={autoFitDisabled} />
            </div>
          </CardContent>
        </Card>

        {/* Results Table + Export */}
        <AnimatePresence>
          {results.length > 0 && (
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
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
                <CardContent>
                  <div className="max-h-[400px] overflow-auto rounded-lg border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="min-w-[180px]">地址</TableHead>
                          <TableHead>经度</TableHead>
                          <TableHead>纬度</TableHead>
                          <TableHead>格式化地址</TableHead>
                          <TableHead>状态</TableHead>
                          <TableHead className="w-[60px]">操作</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {results.map((r, i) => (
                          <TableRow key={i}>
                            <TableCell className="font-medium">{r.address}</TableCell>
                            <TableCell className="font-mono text-xs">{r.lng ?? "-"}</TableCell>
                            <TableCell className="font-mono text-xs">{r.lat ?? "-"}</TableCell>
                            <TableCell className="max-w-[200px] truncate text-xs text-muted-foreground">{r.formattedAddress ?? "-"}</TableCell>
                            <TableCell>
                              {r.status === "success" ? (
                                <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">成功</Badge>
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
                  </div>
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
