import { useState, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Papa from "papaparse";
import {
  MapPin, Key, Eye, EyeOff, UploadCloud, FileText,
  Play, Download, CheckCircle2, XCircle, Loader2, Clock
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
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

const BATCH_SIZE = 20;

interface GeocodeResult {
  address: string;
  lng?: string;
  lat?: string;
  formattedAddress?: string;
  status: "success" | "failed";
  error?: string;
}

interface BatchSummary {
  results: GeocodeResult[];
  total: number;
  success: number;
  failed: number;
}

// --- Helper ---
function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

function formatSeconds(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)} 秒`;
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m} 分 ${s} 秒`;
}

// --- Subcomponents ---
const StatsCard = ({ title, value, icon, color }: {
  title: string; value: number | string; icon: React.ReactNode;
  color: "blue" | "emerald" | "rose";
}) => {
  const colorMap = {
    blue: "bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400 border-blue-200 dark:border-blue-800",
    emerald: "bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800",
    rose: "bg-rose-100 text-rose-600 dark:bg-rose-900/30 dark:text-rose-400 border-rose-200 dark:border-rose-800",
  };
  return (
    <Card className="shadow-lg shadow-slate-200/40 border-slate-200/60 dark:border-slate-800 dark:shadow-none bg-white/50 dark:bg-slate-900/50 backdrop-blur-sm">
      <CardContent className="p-6 flex items-center space-x-4">
        <div className={cn("p-4 rounded-2xl border", colorMap[color])}>{icon}</div>
        <div>
          <p className="text-sm font-medium text-slate-500 dark:text-slate-400">{title}</p>
          <h3 className="text-3xl font-bold text-slate-900 dark:text-white">{value}</h3>
        </div>
      </CardContent>
    </Card>
  );
};

// --- Main Page ---
export default function Home() {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<boolean>(false);

  // Input state
  const [apiKey, setApiKey] = useState("");
  const [showApiKey, setShowApiKey] = useState(false);
  const [inputMode, setInputMode] = useState<"text" | "csv">("text");
  const [textInput, setTextInput] = useState("");
  const [csvData, setCsvData] = useState<Record<string, string>[]>([]);
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [selectedColumn, setSelectedColumn] = useState<string>("");

  // Processing state
  const [isProcessing, setIsProcessing] = useState(false);
  const [completedCount, setCompletedCount] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [startTime, setStartTime] = useState<number | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Results state
  const [summary, setSummary] = useState<BatchSummary | null>(null);

  // --- Computed Progress ---
  const progress = totalCount > 0
    ? Math.min(Math.round((completedCount / totalCount) * 100), 100)
    : 0;

  const estimatedRemaining = (() => {
    if (!isProcessing || completedCount === 0 || startTime === null) return null;
    const elapsed = elapsedMs / 1000;
    const rate = completedCount / elapsed; // items per second
    const remaining = (totalCount - completedCount) / rate;
    return remaining;
  })();

  // --- Handlers ---
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        setCsvData(results.data);
        if (results.meta.fields && results.meta.fields.length > 0) {
          setCsvHeaders(results.meta.fields);
          const guessCol = results.meta.fields.find(f =>
            f.includes("地址") || f.includes("address") || f.includes("位置") || f.includes("名称")
          ) || results.meta.fields[0];
          setSelectedColumn(guessCol);
        }
      },
      error: () => {
        toast({ title: "解析失败", description: "CSV 文件格式不正确", variant: "destructive" });
      },
    });
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const getAddresses = useCallback((): string[] => {
    if (inputMode === "text") {
      return textInput.split("\n").map(s => s.trim()).filter(Boolean);
    } else {
      if (!selectedColumn) return [];
      return csvData.map(row => row[selectedColumn]?.trim()).filter(Boolean) as string[];
    }
  }, [inputMode, textInput, csvData, selectedColumn]);

  const addressCount = getAddresses().length;

  const startTimer = (start: number) => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setElapsedMs(Date.now() - start);
    }, 500);
  };

  const stopTimer = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  const handleConvert = async () => {
    const addresses = getAddresses();
    if (!apiKey.trim()) {
      toast({ title: "需要 API Key", description: "请输入您的高德 Web 服务 API Key", variant: "destructive" });
      return;
    }
    if (addresses.length === 0) {
      toast({ title: "暂无数据", description: "请输入或上传需要转换的地址列表", variant: "destructive" });
      return;
    }

    // Reset
    abortRef.current = false;
    setSummary(null);
    setCompletedCount(0);
    setTotalCount(addresses.length);
    setIsProcessing(true);
    const now = Date.now();
    setStartTime(now);
    setElapsedMs(0);
    startTimer(now);

    const batches = chunkArray(addresses, BATCH_SIZE);
    const allResults: GeocodeResult[] = [];
    let done = 0;

    try {
      for (const batch of batches) {
        if (abortRef.current) break;

        const res = await fetch(`${import.meta.env.BASE_URL}api/geocode`.replace(/\/\//g, "/"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ apiKey: apiKey.trim(), addresses: batch }),
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({ message: `HTTP ${res.status}` }));
          throw new Error(errData.message || `请求失败: HTTP ${res.status}`);
        }

        const data = await res.json() as BatchSummary;
        allResults.push(...data.results);
        done += batch.length;
        setCompletedCount(done);
      }

      stopTimer();
      const successCount = allResults.filter(r => r.status === "success").length;
      const failedCount = allResults.filter(r => r.status === "failed").length;

      setSummary({
        results: allResults,
        total: allResults.length,
        success: successCount,
        failed: failedCount,
      });

      toast({
        title: "🎉 转换完成",
        description: `成功转换 ${successCount} 条，失败 ${failedCount} 条。`,
      });
    } catch (err: unknown) {
      stopTimer();
      const message = err instanceof Error ? err.message : "未知错误";
      toast({
        title: "转换失败",
        description: message,
        variant: "destructive",
      });
    } finally {
      stopTimer();
      setIsProcessing(false);
    }
  };

  const handleExport = () => {
    if (!summary?.results) return;
    const headers = ["原始地址", "经度", "纬度", "格式化地址", "状态", "错误信息"];
    const rows = summary.results.map(r => [
      r.address || "",
      r.lng || "",
      r.lat || "",
      r.formattedAddress || "",
      r.status === "success" ? "成功" : "失败",
      r.error || "",
    ]);
    const csvContent = [headers, ...rows]
      .map(e => e.map(v => `"${(v || "").toString().replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob(["\ufeff", csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `Geocoding_Results_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-slate-100 via-slate-50 to-slate-100 dark:from-slate-900 dark:via-slate-950 dark:to-slate-950 font-sans pb-24">
      <div className="max-w-5xl mx-auto px-4 pt-16 space-y-10">

        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="text-center space-y-5"
        >
          <div className="inline-flex items-center justify-center p-4 bg-white dark:bg-slate-900 rounded-2xl shadow-xl shadow-indigo-500/10 border border-slate-100 dark:border-slate-800">
            <MapPin className="w-10 h-10 text-indigo-600 dark:text-indigo-400" />
          </div>
          <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight bg-clip-text text-transparent bg-gradient-to-br from-slate-900 to-slate-500 dark:from-white dark:to-slate-400">
            批量地理编码转换器
          </h1>
          <p className="text-lg text-slate-600 dark:text-slate-400 max-w-2xl mx-auto font-medium">
            提供高德 Web 服务 API Key，一键将结构化地址批量转换为高精度经纬度坐标。
          </p>
        </motion.div>

        {/* Config */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="max-w-3xl mx-auto space-y-6"
        >
          {/* API Key */}
          <Card className="rounded-2xl shadow-xl shadow-slate-200/40 border-slate-200/60 dark:border-slate-800 bg-white/60 dark:bg-slate-900/60 backdrop-blur-md">
            <CardContent className="p-6">
              <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
                高德 Web 服务 API Key
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <Key className="h-5 w-5 text-slate-400" />
                </div>
                <Input
                  type={showApiKey ? "text" : "password"}
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="在此输入您的 API Key (BYOK 模式，绝不保存)..."
                  className="pl-12 pr-12 py-6 text-base rounded-xl bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-800 shadow-sm focus-visible:ring-indigo-500 transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowApiKey(!showApiKey)}
                  className="absolute inset-y-0 right-0 pr-4 flex items-center text-slate-400 hover:text-slate-600 transition-colors"
                >
                  {showApiKey ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>
            </CardContent>
          </Card>

          {/* Data Input */}
          <Card className="rounded-2xl shadow-xl shadow-slate-200/40 border-slate-200/60 dark:border-slate-800 bg-white/60 dark:bg-slate-900/60 backdrop-blur-md">
            <CardContent className="p-6">
              <Tabs value={inputMode} onValueChange={(v) => setInputMode(v as "text" | "csv")} className="w-full">
                <TabsList className="grid w-full grid-cols-2 mb-6 p-1.5 bg-slate-100/80 dark:bg-slate-800/80 rounded-xl h-14">
                  <TabsTrigger value="text" className="rounded-lg text-base font-medium h-full data-[state=active]:bg-white dark:data-[state=active]:bg-slate-950 data-[state=active]:shadow-sm data-[state=active]:text-indigo-600 dark:data-[state=active]:text-indigo-400">
                    <FileText className="w-4 h-4 mr-2" /> 文本粘贴
                  </TabsTrigger>
                  <TabsTrigger value="csv" className="rounded-lg text-base font-medium h-full data-[state=active]:bg-white dark:data-[state=active]:bg-slate-950 data-[state=active]:shadow-sm data-[state=active]:text-indigo-600 dark:data-[state=active]:text-indigo-400">
                    <UploadCloud className="w-4 h-4 mr-2" /> CSV 上传
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="text" className="mt-0 outline-none">
                  <Textarea
                    value={textInput}
                    onChange={(e) => setTextInput(e.target.value)}
                    placeholder={"请粘贴地址列表，每行一个地址...\n例如：\n北京市朝阳区阜通东大街6号\n上海市海淀区中关村南大街27号"}
                    className="min-h-[240px] resize-y rounded-xl bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-800 focus-visible:ring-indigo-500 p-4 text-base leading-relaxed placeholder:text-slate-400 shadow-sm"
                  />
                </TabsContent>

                <TabsContent value="csv" className="mt-0 outline-none">
                  {!csvData.length ? (
                    <div
                      onClick={() => fileInputRef.current?.click()}
                      className="border-2 border-dashed border-slate-300 dark:border-slate-700 rounded-xl p-12 flex flex-col items-center justify-center cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50 hover:border-indigo-400 dark:hover:border-indigo-500 transition-all duration-200 group bg-white dark:bg-slate-950"
                    >
                      <div className="p-4 bg-indigo-50 dark:bg-indigo-900/30 rounded-full mb-4 group-hover:scale-110 transition-transform shadow-inner">
                        <UploadCloud className="w-8 h-8 text-indigo-500 dark:text-indigo-400" />
                      </div>
                      <p className="text-base font-medium text-slate-700 dark:text-slate-300">点击或拖拽上传 CSV 文件</p>
                      <p className="text-sm text-slate-500 dark:text-slate-400 mt-2">支持 UTF-8 / GBK 编码格式</p>
                    </div>
                  ) : (
                    <div className="space-y-6">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between p-4 bg-indigo-50 dark:bg-indigo-900/20 rounded-xl border border-indigo-100 dark:border-indigo-800/30 gap-4">
                        <div className="flex items-center space-x-3">
                          <div className="p-2 bg-white dark:bg-slate-800 rounded-lg shadow-sm">
                            <FileText className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                          </div>
                          <div>
                            <p className="font-medium text-indigo-900 dark:text-indigo-300">成功加载数据集</p>
                            <p className="text-sm text-indigo-700/70 dark:text-indigo-400/70">共识别到 {csvData.length} 行数据</p>
                          </div>
                        </div>
                        <Button variant="outline" size="sm" onClick={() => { setCsvData([]); setCsvHeaders([]); }} className="bg-white hover:bg-slate-50">
                          重新上传
                        </Button>
                      </div>

                      <div className="space-y-3">
                        <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">请选择包含目标地址的列：</label>
                        <Select value={selectedColumn} onValueChange={setSelectedColumn}>
                          <SelectTrigger className="w-full h-12 bg-white dark:bg-slate-950 rounded-xl border-slate-200 dark:border-slate-800 focus:ring-indigo-500 text-base">
                            <SelectValue placeholder="选择列..." />
                          </SelectTrigger>
                          <SelectContent>
                            {csvHeaders.map(h => <SelectItem key={h} value={h}>{h}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden bg-white dark:bg-slate-950">
                        <div className="overflow-x-auto">
                          <Table>
                            <TableHeader className="bg-slate-50 dark:bg-slate-900">
                              <TableRow>
                                {csvHeaders.slice(0, 4).map(h => (
                                  <TableHead key={h} className="whitespace-nowrap font-medium text-slate-600 dark:text-slate-400">{h}</TableHead>
                                ))}
                                {csvHeaders.length > 4 && <TableHead className="text-slate-400">...</TableHead>}
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {csvData.slice(0, 3).map((row, i) => (
                                <TableRow key={i} className="border-b border-slate-100 dark:border-slate-800 last:border-0">
                                  {csvHeaders.slice(0, 4).map(h => (
                                    <TableCell key={h} className="max-w-[150px] truncate text-slate-600 dark:text-slate-300">{row[h]}</TableCell>
                                  ))}
                                  {csvHeaders.length > 4 && <TableCell className="text-slate-400">...</TableCell>}
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                        <div className="bg-slate-50 dark:bg-slate-900 p-2 text-center text-xs text-slate-400 border-t border-slate-100 dark:border-slate-800">
                          仅预览前 3 行数据
                        </div>
                      </div>
                    </div>
                  )}
                  <input type="file" ref={fileInputRef} className="hidden" accept=".csv" onChange={handleFileUpload} />
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>

          {/* Action + Progress */}
          <div className="pt-4">
            <Button
              className={cn(
                "w-full h-16 text-lg font-bold rounded-xl transition-all duration-300 shadow-xl",
                !apiKey || addressCount === 0 || isProcessing
                  ? "bg-slate-200 text-slate-400 shadow-none hover:bg-slate-200 cursor-not-allowed"
                  : "bg-gradient-to-r from-indigo-500 to-blue-600 hover:from-indigo-600 hover:to-blue-700 text-white shadow-indigo-500/25 hover:shadow-indigo-500/40 hover:-translate-y-0.5 active:translate-y-0"
              )}
              disabled={!apiKey || addressCount === 0 || isProcessing}
              onClick={handleConvert}
            >
              {isProcessing ? (
                <><Loader2 className="w-6 h-6 mr-3 animate-spin" /> 正在分批处理中...</>
              ) : (
                <><Play className="w-6 h-6 mr-3 fill-current" /> 开始转换 ({addressCount} 条地址)</>
              )}
            </Button>

            {/* Progress Panel */}
            <AnimatePresence>
              {isProcessing && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="mt-6 space-y-3 overflow-hidden"
                >
                  {/* Progress header row */}
                  <div className="flex justify-between items-center text-sm font-semibold text-slate-600 dark:text-slate-400 px-1">
                    <span className="flex items-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin text-indigo-500" />
                      <span>
                        已完成 <span className="text-indigo-600 dark:text-indigo-400 font-mono">{completedCount}</span>
                        {" / "}
                        <span className="font-mono">{totalCount}</span> 条
                        {totalCount > BATCH_SIZE && (
                          <span className="ml-2 text-xs text-slate-400 font-normal">
                            (每批 {BATCH_SIZE} 条，共 {Math.ceil(totalCount / BATCH_SIZE)} 批)
                          </span>
                        )}
                      </span>
                    </span>
                    <span className="text-indigo-600 dark:text-indigo-400 font-mono text-base">
                      {progress}%
                    </span>
                  </div>

                  {/* Progress Bar */}
                  <Progress
                    value={progress}
                    className="h-3 bg-slate-200 dark:bg-slate-800 rounded-full [&>div]:bg-gradient-to-r [&>div]:from-indigo-500 [&>div]:to-blue-500 [&>div]:rounded-full [&>div]:transition-all [&>div]:duration-500"
                  />

                  {/* Estimated Remaining Time */}
                  <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400 px-1">
                    <Clock className="w-4 h-4 text-slate-400" />
                    <span>
                      预计剩余时间：
                      <span className="font-semibold text-slate-700 dark:text-slate-300 ml-1">
                        {estimatedRemaining === null
                          ? "计算中..."
                          : estimatedRemaining <= 1
                            ? "即将完成"
                            : formatSeconds(estimatedRemaining)}
                      </span>
                    </span>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </motion.div>

        {/* Results Section */}
        <AnimatePresence>
          {summary && !isProcessing && (
            <motion.div
              initial={{ opacity: 0, y: 40 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-6 pt-8"
            >
              {/* Stats */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <StatsCard title="总计转换" value={summary.total} icon={<FileText className="w-8 h-8" />} color="blue" />
                <StatsCard title="成功落位" value={summary.success} icon={<CheckCircle2 className="w-8 h-8" />} color="emerald" />
                <StatsCard title="解析失败" value={summary.failed} icon={<XCircle className="w-8 h-8" />} color="rose" />
              </div>

              {/* Table */}
              <Card className="rounded-2xl shadow-xl shadow-slate-200/40 border-slate-200/60 dark:border-slate-800 overflow-hidden bg-white dark:bg-slate-900">
                <CardHeader className="border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/50 px-6 py-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <CardTitle className="text-xl">落位结果详情</CardTitle>
                    <p className="text-sm text-slate-500 mt-1">包含经纬度、格式化地址及状态反馈</p>
                  </div>
                  <Button onClick={handleExport} variant="outline" className="bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-xl shadow-sm border-slate-200 dark:border-slate-700 h-11 px-6">
                    <Download className="w-5 h-5 mr-2 text-indigo-600 dark:text-indigo-400" />
                    <span className="font-semibold text-slate-700 dark:text-slate-200">导出 CSV (UTF-8)</span>
                  </Button>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="overflow-x-auto max-h-[600px]">
                    <Table>
                      <TableHeader className="bg-slate-50/80 dark:bg-slate-900/80 sticky top-0 z-10 shadow-sm backdrop-blur-md">
                        <TableRow className="border-slate-200 dark:border-slate-800">
                          <TableHead className="w-16 text-center font-semibold text-slate-600 dark:text-slate-300">序号</TableHead>
                          <TableHead className="font-semibold text-slate-600 dark:text-slate-300">原始地址</TableHead>
                          <TableHead className="font-semibold text-slate-600 dark:text-slate-300">经度</TableHead>
                          <TableHead className="font-semibold text-slate-600 dark:text-slate-300">纬度</TableHead>
                          <TableHead className="font-semibold text-slate-600 dark:text-slate-300">格式化地址</TableHead>
                          <TableHead className="w-24 text-center font-semibold text-slate-600 dark:text-slate-300">状态</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {summary.results.map((r, i) => (
                          <TableRow key={i} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/50 transition-colors border-slate-100 dark:border-slate-800/60">
                            <TableCell className="text-center text-slate-400 font-mono text-sm">{i + 1}</TableCell>
                            <TableCell className="font-medium text-slate-700 dark:text-slate-300 max-w-[200px] truncate" title={r.address}>{r.address}</TableCell>
                            <TableCell className="text-slate-600 dark:text-slate-400 font-mono text-sm">{r.lng || "-"}</TableCell>
                            <TableCell className="text-slate-600 dark:text-slate-400 font-mono text-sm">{r.lat || "-"}</TableCell>
                            <TableCell className="text-slate-600 dark:text-slate-400 text-sm max-w-[250px] truncate" title={r.formattedAddress}>{r.formattedAddress || "-"}</TableCell>
                            <TableCell className="text-center">
                              {r.status === "success" ? (
                                <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800 hover:bg-emerald-200 shadow-none font-medium">
                                  成功
                                </Badge>
                              ) : (
                                <TooltipProvider>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Badge className="bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-400 border border-rose-200 dark:border-rose-800 hover:bg-rose-200 shadow-none cursor-help font-medium">
                                        失败
                                      </Badge>
                                    </TooltipTrigger>
                                    <TooltipContent side="left" className="max-w-[240px] text-xs">
                                      {r.error || "未知原因"}
                                    </TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
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
