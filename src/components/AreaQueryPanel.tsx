import { useState } from "react";
import { useTranslation } from "react-i18next";
import { motion, AnimatePresence } from "framer-motion";
import {
  MapPin, Search, Maximize2, Square, Pentagon, Loader2, CheckCircle2, XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import {
  queryOSMArea,
  type AreaQueryType,
  type AreaQueryMode,
  type AreaResult,
  AREA_TYPE_LABELS,
} from "@/utils/geocoding";
import type { GeoMapHandle } from "@/components/GeoMap";

interface AreaQueryPanelProps {
  geoMapRef: React.RefObject<GeoMapHandle>;
  onResults: (results: AreaResult[]) => void;
}

const MODE_OPTIONS: { value: AreaQueryMode; labelKey: string; hintKey: string; icon: React.ReactNode }[] = [
  {
    value: "semantic",
    labelKey: "areaQuery.modeSemantic",
    hintKey: "areaQuery.modeSemanticHint",
    icon: <Search className="h-4 w-4" />,
  },
  {
    value: "viewport",
    labelKey: "areaQuery.modeViewport",
    hintKey: "areaQuery.modeViewportHint",
    icon: <Maximize2 className="h-4 w-4" />,
  },
  {
    value: "rectangle",
    labelKey: "areaQuery.modeRectangle",
    hintKey: "areaQuery.modeRectangleHint",
    icon: <Square className="h-4 w-4" />,
  },
  {
    value: "polygon",
    labelKey: "areaQuery.modePolygon",
    hintKey: "areaQuery.modePolygonHint",
    icon: <Pentagon className="h-4 w-4" />,
  },
];

export function AreaQueryPanel({ geoMapRef, onResults }: AreaQueryPanelProps) {
  const { t } = useTranslation();
  const { toast } = useToast();

  const [mode, setMode] = useState<AreaQueryMode>("semantic");
  const [keyword, setKeyword] = useState("");
  const [areaType, setAreaType] = useState<AreaQueryType>("building");
  const [isQuerying, setIsQuerying] = useState(false);
  const [drawHint, setDrawHint] = useState(false);

  const isDrawingMode = mode === "rectangle" || mode === "polygon";

  const handleQuery = async () => {
    if (mode === "semantic") {
      if (!keyword.trim()) {
        toast({ title: t("toast.noKeyword"), variant: "destructive" });
        return;
      }
    }

    const zoom = geoMapRef.current?.getZoom() ?? 0;
    if (mode === "viewport" && zoom < 15) {
      toast({ title: t("toast.zoomTooLow"), variant: "destructive" });
      return;
    }

    setIsQuerying(true);
    setDrawHint(false);

    try {
      let results: AreaResult[];

      if (mode === "semantic") {
        results = await queryOSMArea("semantic", areaType, { keyword: keyword.trim() });
      } else if (mode === "viewport") {
        const bounds = geoMapRef.current?.getBounds();
        if (!bounds) throw new Error("无法获取地图边界");
        const bbox: [number, number, number, number] = [
          bounds.getSouth(),
          bounds.getWest(),
          bounds.getNorth(),
          bounds.getEast(),
        ];
        results = await queryOSMArea("viewport", areaType, { bbox });
      } else {
        toast({ title: t("toast.drawFirst"), description: t("toast.drawFirstHint") });
        setDrawHint(true);
        setIsQuerying(false);
        return;
      }

      onResults(results);

      if (results.length === 0) {
        toast({ title: t("toast.areaNoResult"), description: t("toast.areaNoResultHint", { keyword: mode === "semantic" ? keyword : "" }) });
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
      setIsQuerying(false);
    }
  };

  const handleDraw = (drawMode: "rectangle" | "polygon") => {
    if (geoMapRef.current?.cancelDraw) geoMapRef.current.cancelDraw();
    setDrawHint(true);

    if (drawMode === "rectangle") {
      geoMapRef.current?.startDrawRect((bounds) => {
        setIsQuerying(true);
        const bbox: [number, number, number, number] = [
          bounds.getSouth(),
          bounds.getWest(),
          bounds.getNorth(),
          bounds.getEast(),
        ];
        queryOSMArea("rectangle", areaType, { bbox })
          .then(results => {
            onResults(results);
            if (results.length === 0) {
              toast({ title: t("toast.areaNoResult"), variant: "destructive" });
            } else {
              toast({ title: t("toast.areaQueryDone", { count: results.length }) });
            }
          })
          .catch(err => {
            toast({ title: t("toast.areaQueryFail"), description: err instanceof Error ? err.message : "", variant: "destructive" });
          })
          .finally(() => setIsQuerying(false));
      });
    } else {
      geoMapRef.current?.startDrawPolygon((latlngs) => {
        setIsQuerying(true);
        const polygonLatLngs: [number, number][] = latlngs.map(l => [l.lat, l.lng]);
        queryOSMArea("polygon", areaType, { polygonLatLngs })
          .then(results => {
            onResults(results);
            if (results.length === 0) {
              toast({ title: t("toast.areaNoResult"), variant: "destructive" });
            } else {
              toast({ title: t("toast.areaQueryDone", { count: results.length }) });
            }
          })
          .catch(err => {
            toast({ title: t("toast.areaQueryFail"), description: err instanceof Error ? err.message : "", variant: "destructive" });
          })
          .finally(() => setIsQuerying(false));
      });
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <MapPin className="h-4 w-4" />
          {t("areaQuery.title")}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
            {t("areaQuery.queryType")}
          </label>
          <Select value={areaType} onValueChange={v => setAreaType(v as AreaQueryType)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">🌐 {t("areaQuery.all")}</SelectItem>
              <SelectItem value="building">🏢 {t("areaQuery.building")}</SelectItem>
              <SelectItem value="residential">🏘️ {t("areaQuery.residential")}</SelectItem>
              <SelectItem value="park">🏞️ {t("areaQuery.park")}</SelectItem>
              <SelectItem value="commercial">🏬 {t("areaQuery.commercial")}</SelectItem>
              <SelectItem value="administrative">🏛️ {t("areaQuery.administrative")}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
            {t("areaQuery.extractionMode")}
          </label>
          <RadioGroup value={mode} onValueChange={v => { setMode(v as AreaQueryMode); setDrawHint(false); if (geoMapRef.current?.cancelDraw) geoMapRef.current.cancelDraw(); }} className="space-y-2">
            {MODE_OPTIONS.map(opt => (
              <div key={opt.value} className="flex items-start gap-2.5 rounded-lg border p-2.5 hover:bg-accent/40 transition-colors">
                <RadioGroupItem value={opt.value} id={opt.value} className="mt-0.5" />
                <div className="flex-1 min-w-0">
                  <Label htmlFor={opt.value} className="flex items-center gap-1.5 text-sm font-medium cursor-pointer">
                    {opt.icon}
                    {t(opt.labelKey)}
                  </Label>
                  <p className="text-xs text-muted-foreground mt-0.5">{t(opt.hintKey)}</p>
                </div>
              </div>
            ))}
          </RadioGroup>
        </div>

        <AnimatePresence mode="wait">
          {mode === "semantic" && (
            <motion.div
              key="semantic"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="space-y-2"
            >
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                {t("areaQuery.keyword")}
              </label>
              <Input
                value={keyword}
                onChange={e => setKeyword(e.target.value)}
                placeholder={t("areaQuery.keywordPlaceholder")}
                onKeyDown={e => e.key === "Enter" && handleQuery()}
              />
            </motion.div>
          )}

          {mode === "viewport" && (
            <motion.div
              key="viewport"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="rounded-lg border border-primary/20 bg-primary/5 p-3 text-xs text-muted-foreground"
            >
              {t("areaQuery.viewportHint")}
            </motion.div>
          )}

          {isDrawingMode && (
            <motion.div
              key="draw"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="space-y-2"
            >
              <Button
                variant="outline"
                className="w-full gap-1.5"
                onClick={() => handleDraw(mode)}
                disabled={isQuerying}
              >
                {isQuerying ? <Loader2 className="h-4 w-4 animate-spin" /> :
                  mode === "rectangle" ? <Square className="h-4 w-4" /> : <Pentagon className="h-4 w-4" />}
                {t(mode === "rectangle" ? "areaQuery.startDrawRect" : "areaQuery.startDrawPoly")}
              </Button>
              {drawHint && (
                <p className="text-xs text-center text-muted-foreground animate-pulse">
                  {t(mode === "rectangle" ? "areaQuery.drawRectHint" : "areaQuery.drawPolyHint")}
                </p>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {mode !== "rectangle" && mode !== "polygon" && (
          <Button
            onClick={handleQuery}
            disabled={isQuerying}
            className="w-full gap-1.5"
          >
            {isQuerying ? <><Loader2 className="h-4 w-4 animate-spin" /> {t("toast.areaQuery")}</> : <><Search className="h-4 w-4" /> {t("areaQuery.query")}</>}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
