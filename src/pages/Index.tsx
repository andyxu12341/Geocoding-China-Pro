import { useState, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Papa from "papaparse";
import {
  MapPin, Key, Eye, EyeOff, UploadCloud, FileText,
  Play, Download, CheckCircle2, XCircle, Loader2, Clock,
  Map, Settings, StopCircle, ChevronDown,
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
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { geocodeBatch, type MapSource, type GeocodeItem, type GeocodingConfig } from "@/utils/geocoding";
import { exportCSV, exportGeoJSON, exportKML, exportMapPNG } from "@/utils/exportUtils";
import { GeoMap, type MapMarker } from "@/components/GeoMap";

const BATCH_SIZE = 20;

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

export default function Index() {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);

  const [gaodeKey, setGaodeKey] = useState("");
  const [baiduKey, setBaiduKey] = useState("");
  const [showGaode, setShowGaode] = useState(false);
  const [showBaidu, setShowBaidu] = useState(false);
  const [mapSource, setMapSource] = useState<MapSource>("gaode");

  const [inputMode, setInputMode] = useState<"text" | "csv">("text");
  const [textInput, setTextInput] = useState("");
  const [csvData, setCsvData] = useState<Record<string, string>[]>([]);
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [selectedColumn, setSelectedColumn] = useState("");

  const [isProcessing, setIsProcessing] = useState(false);
  const [completed, setCompleted] = useState(0);
  const [total, setTotal] = useState(0);
  const [startTime, setStartTime] = useState<number | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [results, setResults] = useState<GeocodeItem[]>([]);
  const [isDone, setIsDone] = useState(false);

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
    if (inputMode === "text") return textInput.split("\n").map(s => s.trim()).filter(Boolean);
    if (!selectedColumn) return [];
    return csvData.map(row => row[selectedColumn]?.trim()).filter(Boolean) as string[];
  }, [inputMode, textInput, csvData, selectedColumn]);

  const addressCount = getAddresses().length;
  const keyMissing = (mapSource === "gaode" && !gaodeKey.trim()) || (mapSource === "baidu" && !baiduKey.trim());
  const canStart = !keyMissing && addressCount > 0 && !isProcessing;

  const startTimer = (t0: number) => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => setElapsedMs(Date.now() - t0), 500);
  };
  const stopTimer = () => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    Papa.parse<Record<string, string>>(file, {
      header: true, skipEmptyLines: true,
      complete: (res) => {
        setCsvData(res.data);
        if (res.meta.fields?.length) {
          setCsvHeaders(res.meta.fields);
          const guess = res.meta.fields.find(f => /地址|address|位置|名称|name/i.test(f)) || res.meta.fields[0];
          setSelectedColumn(guess);
        }
      },
      error: () => toast({ title: "解析失败", description: "CSV 格式不正确", variant: "destructive" }),
    });
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleConvert = async () => {
    const addresses = getAddresses();
    if (!canStart) return;

    const config: GeocodingConfig = {
      source: mapSource,
      gaodeKey: gaodeKey.trim() || undefined,
      baiduKey: baiduKey.trim() || undefined,
    };

    abortRef.current = new AbortController();
    setResults([]);
    setCompleted(0);
    setTotal(addresses.length);
    setIsDone(false);
    setIsProcessing(true);
    const t0 = Date.now();
    setStartTime(t0);
    setElapsedMs(0);
    startTimer(t0);

    try {
      await geocodeBatch(
        addresses, config,
        (prog) => {
          setCompleted(prog.completed);
          if (prog.latestResult) setResults(prev => [...prev, prog.latestResult!]);
        },
        abortRef.current.signal,
        BATCH_SIZE,
      );
      setIsDone(true);
      toast({ title: "🎉 转换完成", description: `成功 ${successCount} 条，失败 ${failedCount} 条。` });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "未知错误";
      toast({ title: "转换中断", description: msg, variant: "destructive" });
    } finally {
      stopTimer();
      setIsProcessing(false);
    }
  };

  const handleStop = () => {
    abortRef.current?.abort();
    stopTimer();
    setIsProcessing(false);
    setIsDone(true);
    toast({ title: "已停止", description: "已完成的结果已保留。" });
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

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8 text-center"
        >
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
            <MapPin className="h-8 w-8 text-primary" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            空间数据工作站
          </h1>
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
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
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
                    <Input
                      type={showGaode ? "text" : "password"}
                      value={gaodeKey}
                      onChange={(e) => setGaodeKey(e.target.value)}
                      placeholder="输入高德 Web 服务 API Key..."
                      className="pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowGaode(!showGaode)}
                      className="absolute inset-y-0 right-0 flex items-center pr-3 text-muted-foreground hover:text-foreground"
                    >
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
                    <Input
                      type={showBaidu ? "text" : "password"}
                      value={baiduKey}
                      onChange={(e) => setBaiduKey(e.target.value)}
                      placeholder="输入百度地图 Browser 端 AK..."
                      className="pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowBaidu(!showBaidu)}
                      className="absolute inset-y-0 right-0 flex items-center pr-3 text-muted-foreground hover:text-foreground"
                    >
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
          <Tabs value={inputMode} onValueChange={(v) => setInputMode(v as "text" | "csv")}>
            <TabsList className="w-full">
              <TabsTrigger value="text" className="flex-1 gap-1.5">
                <FileText className="h-4 w-4" /> 文本粘贴
              </TabsTrigger>
              <TabsTrigger value="csv" className="flex-1 gap-1.5">
                <UploadCloud className="h-4 w-4" /> CSV 上传
              </TabsTrigger>
            </TabsList>
            <TabsContent value="text" className="mt-3">
              <Textarea
                value={textInput}
                onChange={(e) => setTextInput(e.target.value)}
                placeholder={"每行一个地址，例如：\n北京市朝阳区阜通东大街6号\n上海市浦东新区陆家嘴环路1000号"}
                className="min-h-[200px] resize-y"
              />
            </TabsContent>
            <TabsContent value="csv" className="mt-3">
              <div className="space-y-3">
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-muted-foreground/20 p-8 transition-colors hover:border-primary/40 hover:bg-accent/50"
                >
                  <UploadCloud className="mb-2 h-8 w-8 text-muted-foreground" />
                  <p className="text-sm font-medium text-muted-foreground">点击上传 CSV 文件</p>
                  <input ref={fileInputRef} type="file" accept=".csv" className="hidden" onChange={handleFileUpload} />
                </div>
                {csvHeaders.length > 0 && (
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-muted-foreground">选择地址列</label>
                    <Select value={selectedColumn} onValueChange={setSelectedColumn}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {csvHeaders.map(h => (
                          <SelectItem key={h} value={h}>{h}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="mt-1 text-xs text-muted-foreground">已加载 {csvData.length} 行数据</p>
                  </div>
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
            <Button
              size="lg"
              className="w-full gap-2"
              disabled={!canStart}
              onClick={handleConvert}
            >
              <Play className="h-5 w-5" /> 开始转换 — {SOURCE_LABELS[mapSource]}（{addressCount} 条）
            </Button>
          )}
        </div>

        {/* Progress */}
        <AnimatePresence>
          {(isProcessing || isDone) && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="mb-6"
            >
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
              <GeoMap markers={mapMarkers} className="h-full w-full" />
            </div>
          </CardContent>
        </Card>

        {/* Results Table + Export */}
        <AnimatePresence>
          {results.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
            >
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
    </div>
  );
}
