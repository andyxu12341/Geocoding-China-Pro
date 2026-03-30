import { useState, useRef, useCallback, useMemo, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { motion } from "framer-motion";
import Papa from "papaparse";
import * as XLSX from "xlsx";
import {
  MapPin, Key, Eye, EyeOff, UploadCloud, FileText,
  Play, StopCircle, Settings, History, Map,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { useGeocoding } from "@/hooks/useGeocoding";
import { cn } from "@/lib/utils";
import { type MapSource, type GeocodingConfig, type GeocodeItem, type GeocodeCandidate } from "@/utils/geocoding";

export interface GeocodingPanelProps {
  mapSource: MapSource;
  onMapSourceChange: (v: MapSource) => void;
  gaodeKey: string;
  onGaodeKeyChange: (v: string) => void;
  baiduKey: string;
  onBaiduKeyChange: (v: string) => void;
  showGaode: boolean;
  onShowGaodeChange: (v: boolean) => void;
  showBaidu: boolean;
  onShowBaiduChange: (v: boolean) => void;
  regionFilter: string;
  onRegionFilterChange: (v: string) => void;
  onResults: (results: GeocodeItem[]) => void;
  onProcessingChange: (isProcessing: boolean) => void;
}

const DEMO_ADDRESSES = "北京故宫\n上海东方明珠\n广州塔\n深圳平安金融中心\n成都大熊猫繁育研究基地";

const CATEGORY_PALETTE = [
  "#4e79a7", "#f28e2b", "#e15759", "#76b7b2", "#59a14f",
  "#edc948", "#b07aa1", "#ff9da7", "#9c755f", "#bab0ac",
  "#af7aa1", "#17becf", "#bcbd22", "#7f7f7f", "#e377c2",
];

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
                  if (encoding === "UTF-8") { tryParse("GBK"); return; }
                  reject(new Error("无法识别 CSV 表头"));
                  return;
                }
                const cleaned = (res.data ?? []).filter(row =>
                  fields.some(f => (row[f] ?? "").trim())
                );
                resolve({ headers: fields, rows: cleaned });
              },
              error: () => {
                if (encoding === "UTF-8") { tryParse("GBK"); }
                else { reject(new Error("CSV 解析失败")); }
              },
            });
          } catch {
            if (encoding === "UTF-8") { tryParse("GBK"); }
            else { reject(new Error("CSV 解析异常")); }
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

export function GeocodingPanel({
  mapSource, onMapSourceChange,
  gaodeKey, onGaodeKeyChange,
  baiduKey, onBaiduKeyChange,
  showGaode, onShowGaodeChange,
  showBaidu, onShowBaiduChange,
  regionFilter, onRegionFilterChange,
  onResults, onProcessingChange,
}: GeocodingPanelProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const geo = useGeocoding();

  const [inputMode, setInputMode] = useState<"text" | "file">("text");
  const [textInput, setTextInput] = useState("");
  const [fileData, setFileData] = useState<Record<string, string>[]>([]);
  const [fileHeaders, setFileHeaders] = useState<string[]>([]);
  const [selectedColumn, setSelectedColumn] = useState("");
  const [fileName, setFileName] = useState("");
  const [categoryColumn, setCategoryColumn] = useState("");
  const [customColors, setCustomColors] = useState<Record<string, string>>({});
  const [isDragging, setIsDragging] = useState(false);

  const isProcessing = geo.isProcessing;
  const results = geo.results;

  useEffect(() => {
    onProcessingChange(isProcessing);
  }, [isProcessing, onProcessingChange]);

  useEffect(() => {
    onResults(results);
  }, [results, onResults]);

  const categoryValues = useMemo(() => {
    if (!categoryColumn || !fileData.length) return [];
    const set = new Set<string>();
    fileData.forEach(row => {
      const v = row[categoryColumn]?.trim();
      if (v) set.add(v);
    });
    return Array.from(set);
  }, [categoryColumn, fileData]);

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

  const keyMissing = (mapSource === "gaode" && !gaodeKey.trim()) || (mapSource === "baidu" && !baiduKey.trim());

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
  const displayCount = addressCount > 0 ? addressCount : (inputMode === "text" ? 5 : 0);

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
      const guess = headers.find(f => /地址|address|位置|名称|name/i.test(f)) || headers[0];
      setSelectedColumn(guess);
      setCategoryColumn("");
    } catch (err) {
      toast({ title: t("toast.parseError"), description: err instanceof Error ? err.message : t("toast.fileFormat"), variant: "destructive" });
    }
  }, [toast, t]);

  const handleConvert = () => {
    const addresses = resolveAddresses();
    if (addresses.length === 0) {
      toast({ title: t("toast.noAddress"), variant: "destructive" });
      return;
    }
    if (keyMissing) return;

    let addressToCategory: Map<string, string> | undefined;
    if (categoryColumn && fileData.length > 0) {
      addressToCategory = new globalThis.Map() as Map<string, string>;
      fileData.forEach(row => {
        const addr = row[selectedColumn]?.trim();
        const cat = row[categoryColumn]?.trim();
        if (addr && cat) addressToCategory!.set(addr, cat);
      });
    }

    const config: GeocodingConfig = {
      source: mapSource,
      gaodeKey: gaodeKey.trim() || undefined,
      baiduKey: baiduKey.trim() || undefined,
      regionFilter: regionFilter.trim() || undefined,
    };

    geo.startGeocoding(addresses, config, addressToCategory);
  };

  return (
    <div className="space-y-3">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Settings className="h-4 w-4" /> {t("settings.title")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">{t("settings.mapSource")}</label>
            <Select value={mapSource} onValueChange={(v) => onMapSourceChange(v as MapSource)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="gaode">{t("settings.gaode")}</SelectItem>
                <SelectItem value="baidu">{t("settings.baidu")}</SelectItem>
                <SelectItem value="osm">{t("settings.osm")}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {mapSource === "osm" && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300">
              ⚠️ {t("settings.osmWarning")}
            </div>
          )}

          {mapSource === "gaode" && (
            <div>
              <label className="mb-1 flex items-center gap-1 text-xs font-medium text-muted-foreground">
                <Key className="h-3 w-3" /> {t("settings.gaodeKey")}
              </label>
              <div className="relative">
                <Input type={showGaode ? "text" : "password"} value={gaodeKey} onChange={(e) => onGaodeKeyChange(e.target.value)} placeholder={t("settings.gaodeKeyPlaceholder")} className="pr-10 text-sm" />
                <button type="button" onClick={() => onShowGaodeChange(!showGaode)} className="absolute inset-y-0 right-0 flex items-center pr-3 text-muted-foreground hover:text-foreground">
                  {showGaode ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{t("settings.gaodeKeyHint")}</p>
            </div>
          )}

          {mapSource === "baidu" && (
            <div>
              <label className="mb-1 flex items-center gap-1 text-xs font-medium text-muted-foreground">
                <Key className="h-3 w-3" /> {t("settings.baiduKey")}
              </label>
              <div className="relative">
                <Input type={showBaidu ? "text" : "password"} value={baiduKey} onChange={(e) => onBaiduKeyChange(e.target.value)} placeholder={t("settings.baiduKeyPlaceholder")} className="pr-10 text-sm" />
                <button type="button" onClick={() => onShowBaiduChange(!showBaidu)} className="absolute inset-y-0 right-0 flex items-center pr-3 text-muted-foreground hover:text-foreground">
                  {showBaidu ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{t("settings.baiduKeyHint")}</p>
            </div>
          )}

          {mapSource === "osm" && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-2 text-xs text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
              ✅ {t("settings.osmFree")}
            </div>
          )}

          <div>
            <label className="mb-1 flex items-center gap-1 text-xs font-medium text-muted-foreground">
              <MapPin className="h-3 w-3" /> {t("settings.regionFilter")}
            </label>
            <Input value={regionFilter} onChange={(e) => onRegionFilterChange(e.target.value)} placeholder={mapSource === "osm" ? t("settings.regionFilterOsm") : t("settings.regionFilterOther")} className="text-sm" />
            <p className="mt-1 text-xs text-muted-foreground">
              {mapSource === "osm" ? t("settings.regionFilterHintOsm") : t("settings.regionFilterHintOther")}
            </p>
          </div>
        </CardContent>
      </Card>

      <div className="min-w-0 overflow-hidden">
        <Tabs value={inputMode} onValueChange={(v) => setInputMode(v as "text" | "file")}>
          <TabsList className="w-full">
            <TabsTrigger value="text" className="flex-1 gap-1">
              <FileText className="h-3.5 w-3.5" /> {t("input.textTab")}
            </TabsTrigger>
            <TabsTrigger value="file" className="flex-1 gap-1">
              <UploadCloud className="h-3.5 w-3.5" /> {t("input.fileTab")}
            </TabsTrigger>
          </TabsList>
          <TabsContent value="text" className="mt-2">
            <Textarea value={textInput} onChange={(e) => setTextInput(e.target.value)} placeholder={DEMO_ADDRESSES} className="min-h-[120px] resize-y text-sm" />
            <p className="mt-1 text-xs text-muted-foreground">{t("input.textHint")}</p>
          </TabsContent>
          <TabsContent value="file" className="mt-2">
            <div
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); }}
              onDragEnter={(e) => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={(e) => { e.preventDefault(); setIsDragging(false); }}
              onDrop={handleDrop}
              className={cn("flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed p-6 transition-colors", isDragging ? "border-primary bg-primary/10" : "border-muted-foreground/20 hover:border-primary/40 hover:bg-accent/50")}
            >
              <UploadCloud className={cn("mb-1 h-6 w-6", isDragging ? "text-primary" : "text-muted-foreground")} />
              <p className="text-xs font-medium text-muted-foreground">{isDragging ? t("input.fileUploading") : t("input.fileDrag")}</p>
              <p className="text-xs text-muted-foreground">{t("input.fileHint")}</p>
              <input ref={fileInputRef} type="file" accept=".csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="hidden" onChange={handleFileUpload} />
            </div>
            {fileHeaders.length > 0 && (
              <div className="mt-2 space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-muted-foreground">📂 {fileName} — {t("input.addressCol")}</label>
                    <Select value={selectedColumn} onValueChange={setSelectedColumn}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{fileHeaders.map(h => <SelectItem key={h} value={h}>{h}</SelectItem>)}</SelectContent>
                    </Select>
                    <p className="mt-1 text-xs text-muted-foreground">{t("input.rowsLoaded", { count: fileData.length })}</p>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-muted-foreground">🏷️ {t("input.categoryCol")}</label>
                    <Select value={categoryColumn} onValueChange={setCategoryColumn}>
                      <SelectTrigger><SelectValue placeholder={t("input.noCategory")} /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">{t("input.noCategory")}</SelectItem>
                        {fileHeaders.filter(h => h !== selectedColumn).map(h => <SelectItem key={h} value={h}>{h}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                {categoryColumn && categoryColumn !== "__none__" && categoryValues.length > 0 && (
                  <div className="rounded-lg border p-2">
                    <p className="mb-1 text-xs font-medium text-muted-foreground">🎨 {t("input.categoryColors")}</p>
                    <div className="flex flex-wrap gap-1.5">
                      {categoryValues.map(v => (
                        <label key={v} className="flex cursor-pointer items-center gap-1 rounded-md border px-1.5 py-0.5 text-xs hover:bg-accent">
                          <input type="color" value={customColors[v] || CATEGORY_PALETTE[0]} onChange={(e) => setCustomColors(prev => ({ ...prev, [v]: e.target.value }))} className="h-3.5 w-3.5 cursor-pointer border-0 p-0" />
                          <span className="max-w-[80px] truncate">{v}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                )}
                <div className="overflow-hidden">
                  <Table containerClassName="w-full overflow-x-auto overflow-y-auto max-h-[200px] border rounded text-xs">
                    <TableHeader className="sticky top-0 z-10 bg-card">
                      <TableRow>{fileHeaders.map(h => <TableHead key={h} title={h} className={cn("max-w-[120px] truncate text-xs", h === selectedColumn && "bg-primary/10 font-bold")}>{h}</TableHead>)}</TableRow>
                    </TableHeader>
                    <TableBody>
                      {fileData.slice(0, 5).map((row, i) => (
                        <TableRow key={i}>{fileHeaders.map(h => <TableCell key={h} title={String(row[h] ?? "")} className={cn("max-w-[120px] truncate text-xs", h === selectedColumn && "bg-primary/5 font-medium")}>{row[h] ?? ""}</TableCell>)}</TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  {fileData.length > 5 && <p className="pt-1 text-center text-xs text-muted-foreground">{t("input.previewRows", { count: fileData.length })}</p>}
                </div>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>

      <Button
        size="lg"
        className="w-full gap-2"
        disabled={keyMissing || isProcessing}
        onClick={handleConvert}
      >
        <Play className="h-5 w-5" /> {t("convert.start", { source: mapSource === "gaode" ? "高德地图" : mapSource === "baidu" ? "百度地图" : "OpenStreetMap", count: displayCount })}
      </Button>
    </div>
  );
}
