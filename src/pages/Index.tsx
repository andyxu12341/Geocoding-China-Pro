import { useState, useRef, useCallback, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { motion, AnimatePresence } from "framer-motion";
import {
  MapPin, Download, CheckCircle2, XCircle, Loader2,
  Map, StopCircle, Copy, Sun, Moon, History, Trash2, RotateCcw, Clock,
} from "lucide-react";
import { GeocodingPanel } from "@/components/GeocodingPanel";
import { AreaQueryPanel } from "@/components/AreaQueryPanel";
import { ResultsSection } from "@/components/ResultsSection";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { type MapSource, type GeocodeItem, type AreaResult, type GeocodeCandidate } from "@/utils/geocoding";
import { exportMapPNG } from "@/utils/exportUtils";
import { GeoMap, type MapMarker, type GeoMapHandle, type CategoryColor, type MapPolygon } from "@/components/GeoMap";

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
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const geoMapRef = useRef<GeoMapHandle>(null);

  const [mapSource, setMapSource] = useState<MapSource>("osm");
  const [gaodeKey, setGaodeKey] = useState("");
  const [baiduKey, setBaiduKey] = useState("");
  const [showGaode, setShowGaode] = useState(false);
  const [showBaidu, setShowBaidu] = useState(false);
  const [regionFilter, setRegionFilter] = useState("");
  const [appMode, setAppMode] = useState<"geocoding" | "polygon">("geocoding");

  const [results, setResults] = useState<GeocodeItem[]>([]);
  const [isDone, setIsDone] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [completed, setCompleted] = useState(0);
  const [total, setTotal] = useState(0);
  const [elapsedMs, setElapsedMs] = useState(0);

  // Cancel dialog
  const [showCancelDialog, setShowCancelDialog] = useState(false);

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

  const [areaResults, setAreaResults] = useState<AreaResult[]>([]);

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

  useEffect(() => {
    const map = geoMapRef.current?.getMap();
    if (!map) return;
    const disable = () => setAutoFitDisabled(true);
    map.on("mousedown touchstart", disable);
    return () => { map.off("mousedown touchstart", disable); };
  });

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
    .map(r => ({
      lat: parseFloat(r.lat!),
      lng: parseFloat(r.lng!),
      label: r.address,
      category: r.category,
    }));

  const mapPolygons: MapPolygon[] = areaResults.map((r) => ({
    id: `${r.osmId}`,
    rings: r.polygon,
    label: r.name,
    tags: r.tags,
    color: r.color,
    categoryName: r.categoryName,
    osmId: r.osmId,
    osmType: r.osmType,
  }));

  const progress = total > 0 ? Math.min(Math.round((completed / total) * 100), 100) : 0;
  const eta = (() => {
    if (!isProcessing || completed === 0) return null;
    return ((elapsedMs / 1000) / completed) * (total - completed);
  })();
  const successCount = results.filter(r => r.status === "success").length;
  const failedCount = results.filter(r => r.status === "failed").length;

  const handleStop = () => {
    setShowCancelDialog(true);
  };

  const handleResume = () => {
    setShowCancelDialog(false);
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

        {/* App Mode Tabs — top level navigation */}
        <Tabs value={appMode} onValueChange={(v) => setAppMode(v as "geocoding" | "polygon")} className="mb-4">
          <TabsList className="w-full grid grid-cols-2">
            <TabsTrigger value="geocoding" className="gap-2">
              <MapPin className="h-4 w-4" /> {t("tabs.geocoding")}
            </TabsTrigger>
            <TabsTrigger value="polygon" className="gap-2">
              <Map className="h-4 w-4" /> {t("tabs.polygon")}
            </TabsTrigger>
          </TabsList>

          {/* Main workspace */}
          <div className="flex flex-col md:flex-row gap-4 mt-4">
            {/* Left: control panel */}
            <div className="w-full md:w-[400px] shrink-0 space-y-4 overflow-y-auto pr-1" style={{ maxHeight: "calc(100vh - 120px)" }}>

              {/* Tab A: Point Geocoding */}
              <TabsContent value="geocoding" className="mt-0">
                <GeocodingPanel
                  mapSource={mapSource}
                  onMapSourceChange={setMapSource}
                  gaodeKey={gaodeKey}
                  onGaodeKeyChange={setGaodeKey}
                  baiduKey={baiduKey}
                  onBaiduKeyChange={setBaiduKey}
                  showGaode={showGaode}
                  onShowGaodeChange={setShowGaode}
                  showBaidu={showBaidu}
                  onShowBaiduChange={setShowBaidu}
                  regionFilter={regionFilter}
                  onRegionFilterChange={setRegionFilter}
                  onResults={setResults}
                  onProcessingChange={setIsProcessing}
                />
              </TabsContent>

              {/* Tab B: Polygon Extraction */}
              <TabsContent value="polygon" className="mt-0">
                <motion.div
                  key="tab-polygon"
                  initial={{ opacity: 0, x: 8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.25, ease: "easeOut" }}
                >
                <AreaQueryPanel
                  geoMapRef={geoMapRef}
                  onResults={(results) => setAreaResults(results)}
                />
                </motion.div>
              </TabsContent>
            </div>

            {/* Map */}
            <Card className="w-full md:flex-1 md:min-h-0">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2 text-sm">
                    <Map className="h-4 w-4" /> {t("map.title")}
                  </CardTitle>
                  <span className="text-xs text-muted-foreground">
                    {mapMarkers.length > 0 || mapPolygons.length > 0
                      ? `${mapMarkers.length > 0 ? t("map.markers", { count: mapMarkers.length }) : ""}${mapMarkers.length > 0 && mapPolygons.length > 0 ? " · " : ""}${mapPolygons.length > 0 ? t("map.polygons", { count: mapPolygons.length }) : ""}`
                      : t("map.waiting")}
                  </span>
                </div>
              </CardHeader>
              <CardContent className="p-6 pt-0">
                <div ref={mapContainerRef} className="rounded-xl border overflow-hidden" style={{ height: "calc(100vh - 220px)" }}>
                  <GeoMap
                    ref={geoMapRef}
                    markers={mapMarkers}
                    polygons={mapPolygons}
                    className="h-full w-full"
                    autoFitDisabled={autoFitDisabled}
                  />
                </div>
              </CardContent>
            </Card>
          </div>
        </Tabs>

        {/* Progress stats — below map, above results */}
        <AnimatePresence>
          {(isProcessing || isDone) && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="mb-4">
              <Card>
                <CardContent className="pt-4">
                  <div className="mb-3 flex items-center justify-between text-xs">
                    <span className="flex items-center gap-1 text-muted-foreground">
                      {isProcessing ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> {t("progress.processing")}</> : <><CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" /> {t("progress.done")}</>}
                    </span>
                    <span className="font-mono text-xs text-muted-foreground">{completed} / {total}{eta !== null && ` · ${t("progress.remaining", { time: formatSeconds(eta) })}`}</span>
                  </div>
                  <Progress value={results.length > 0 && total > 0 ? Math.min(Math.round((completed / total) * 100), 100) : 0} className="h-1.5" />
                  <div className="mt-3 grid grid-cols-3 gap-2">
                    <StatsCard title={t("progress.total")} value={total} icon={<Map className="h-4 w-4" />} color="blue" />
                    <StatsCard title={t("progress.success")} value={successCount} icon={<CheckCircle2 className="h-4 w-4" />} color="emerald" />
                    <StatsCard title={t("progress.failed")} value={failedCount} icon={<XCircle className="h-4 w-4" />} color="rose" />
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          )}
        </AnimatePresence>

        <ResultsSection
          appMode={appMode}
          results={results}
          areaResults={areaResults}
          onExportPNG={handleExportPNG}
          onCopyCoords={handleCopyCoords}
          onSelectCandidate={(address, candidates) => setCandidateDialog({ address, candidates })}
        />
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
