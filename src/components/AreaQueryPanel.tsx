import { useState, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { motion, AnimatePresence } from "framer-motion";
import {
  MapPin, Search, Maximize2, Square, Pentagon, Loader2,
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

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (mode === "rectangle") {
      geoMapRef.current?.enableDrawRect();
    } else if (mode === "polygon") {
      geoMapRef.current?.enableDrawPolygon();
    }
  }, [mode, geoMapRef]);

  const handleQuery = async () => {
    if (debounceRef.current) return;
    debounceRef.current = setTimeout(() => { debounceRef.current = null; }, 800);

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

    if (mode === "rectangle") {
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
              toast({ title: t("toast.areaQueryDone", { count: results.length }), description: t("toast.areaQueryType", { type: AREA_TYPE_LABELS[areaType] }) });
            }
          })
          .catch(err => {
            toast({ title: t("toast.areaQueryFail"), description: err instanceof Error ? err.message : "", variant: "destructive" });
          })
          .finally(() => setIsQuerying(false));
      });
      return;
    }

    if (mode === "polygon") {
      geoMapRef.current?.startDrawPolygon((latlngs) => {
        setIsQuerying(true);
        const polygonLatLngs: [number, number][] = latlngs.map(l => [l.lat, l.lng]);
        queryOSMArea("polygon", areaType, { polygonLatLngs })
          .then(results => {
            onResults(results);
            if (results.length === 0) {
              toast({ title: t("toast.areaNoResult"), variant: "destructive" });
            } else {
              toast({ title: t("toast.areaQueryDone", { count: results.length }), description: t("toast.areaQueryType", { type: AREA_TYPE_LABELS[areaType] }) });
            }
          })
          .catch(err => {
            toast({ title: t("toast.areaQueryFail"), description: err instanceof Error ? err.message : "", variant: "destructive" });
          })
          .finally(() => setIsQuerying(false));
      });
      return;
    }

    setIsQuerying(true);

    try {
      let results: AreaResult[];

      if (mode === "semantic") {
        results = await queryOSMArea("semantic", areaType, { keyword: keyword.trim() });
      } else {
        const bounds = geoMapRef.current?.getBounds();
        if (!bounds) throw new Error("无法获取地图边界");
        const bbox: [number, number, number, number] = [
          bounds.getSouth(),
          bounds.getWest(),
          bounds.getNorth(),
          bounds.getEast(),
        ];
        results = await queryOSMArea("viewport", areaType, { bbox });
      }

      onResults(results);

      if (results.length === 0) {
        toast({ title: t("toast.areaNoResult"), description: t("toast.areaNoResultHint", { keyword: keyword }) });
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
          <RadioGroup value={mode} onValueChange={v => setMode(v as AreaQueryMode)} className="space-y-2">
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

          {mode === "rectangle" && (
            <motion.div
              key="rect"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="rounded-lg border border-primary/20 bg-primary/5 p-3 text-xs text-muted-foreground"
            >
              <Square className="inline h-3 w-3 mr-1" />
              {t("areaQuery.viewportHint").replace("📍 ", "")} — {t("areaQuery.drawRectHint")}
            </motion.div>
          )}

          {mode === "polygon" && (
            <motion.div
              key="poly"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="rounded-lg border border-primary/20 bg-primary/5 p-3 text-xs text-muted-foreground"
            >
              <Pentagon className="inline h-3 w-3 mr-1" />
              {t("areaQuery.drawPolyHint")}
            </motion.div>
          )}
        </AnimatePresence>

        <Button
          onClick={handleQuery}
          disabled={isQuerying}
          className="w-full gap-1.5"
        >
          {isQuerying ? <><Loader2 className="h-4 w-4 animate-spin" /> {t("toast.areaQuery")}...</> :
            mode === "rectangle" ? <><Square className="h-4 w-4" /> {t("areaQuery.startDrawRect")}</> :
            mode === "polygon" ? <><Pentagon className="h-4 w-4" /> {t("areaQuery.startDrawPoly")}</> :
            <><Search className="h-4 w-4" /> {t("areaQuery.query")}</>}
        </Button>

      </CardContent>
    </Card>
  );
}
