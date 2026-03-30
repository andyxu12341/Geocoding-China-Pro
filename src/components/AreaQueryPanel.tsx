import { useState, useRef } from "react";
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
import { useOverpassQuery } from "@/hooks/useOverpassQuery";
import {
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
  const { fetchPolygons, isLoading, error } = useOverpassQuery();

  const [mode, setMode] = useState<AreaQueryMode>("semantic");
  const [keyword, setKeyword] = useState("");
  const [areaType, setAreaType] = useState<AreaQueryType>("building");

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleQuery = () => {
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
      geoMapRef.current?.setDrawCallbacks(
        async (bounds) => {
          const bbox: [number, number, number, number] = [
            bounds.getSouth(),
            bounds.getWest(),
            bounds.getNorth(),
            bounds.getEast(),
          ];
          const results = await fetchPolygons("rectangle", areaType, { bbox });
          onResults(results);
          geoMapRef.current?.setDrawMode("none");
        },
        null
      );
      geoMapRef.current?.setDrawMode("rectangle");
      return;
    }

    if (mode === "polygon") {
      geoMapRef.current?.setDrawCallbacks(
        null,
        async (latlngs) => {
          const polygonLatLngs: [number, number][] = latlngs.map(l => [l.lat, l.lng]);
          const results = await fetchPolygons("polygon", areaType, { polygonLatLngs });
          onResults(results);
          geoMapRef.current?.setDrawMode("none");
        }
      );
      geoMapRef.current?.setDrawMode("polygon");
      return;
    }

    const runQuery = async () => {
      if (mode === "semantic") {
        const results = await fetchPolygons("semantic", areaType, { keyword: keyword.trim() });
        onResults(results);
      } else {
        const bounds = geoMapRef.current?.getBounds();
        const zoom = geoMapRef.current?.getZoom() ?? 0;
        if (!bounds) return;
        if (zoom < 14) {
          toast({ title: "查询范围过大", description: "请放大地图（缩放级别 ≥ 14）后再试！", variant: "destructive" });
          return;
        }
        const bbox: [number, number, number, number] = [
          bounds.getSouth(),
          bounds.getWest(),
          bounds.getNorth(),
          bounds.getEast(),
        ];
        const results = await fetchPolygons("viewport", areaType, { bbox });
        onResults(results);
      }
    };

    runQuery();
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
              <SelectItem value="landuse">🗺️ {t("areaQuery.landuse")}</SelectItem>
              <SelectItem value="admin">🏛️ {t("areaQuery.admin")}</SelectItem>
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
              {t("areaQuery.drawRectHint")}
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
          disabled={isLoading}
          className="w-full gap-1.5"
        >
          {isLoading ? <><Loader2 className="h-4 w-4 animate-spin" /> {t("toast.areaQuery")}...</> :
            mode === "rectangle" ? <><Square className="h-4 w-4" /> {t("areaQuery.startDrawRect")}</> :
            mode === "polygon" ? <><Pentagon className="h-4 w-4" /> {t("areaQuery.startDrawPoly")}</> :
            <><Search className="h-4 w-4" /> {t("areaQuery.query")}</>}
        </Button>

        {error && (
          <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700 dark:border-rose-800 dark:bg-rose-950 dark:text-rose-300">
            <p className="font-medium">{t("toast.areaError") || "查询失败"}</p>
            <p className="mt-1">{error}</p>
          </div>
        )}

      </CardContent>
    </Card>
  );
}
