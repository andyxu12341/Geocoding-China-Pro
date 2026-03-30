import { useState, useRef, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { motion, AnimatePresence } from "framer-motion";
import { MapPin, Search, Square, Pentagon, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useOverpassQuery, type SpatialResult } from "@/hooks/useOverpassQuery";
import {
  type AreaQueryType,
  type AreaQueryMode,
  AREA_TYPE_LABELS,
  type MapSource,
} from "@/utils/geocoding";
import type { GeoMapHandle } from "@/components/GeoMap";

interface AreaQueryPanelProps {
  geoMapRef: React.RefObject<GeoMapHandle>;
  mapSource: MapSource;
  gaodeKey: string;
  baiduKey: string;
  onResults: (results: SpatialResult[]) => void;
}

const POLYGON_TYPES: AreaQueryType[] = ["all", "building", "landuse", "admin"];
const POI_TYPES: AreaQueryType[] = [
  "poi_restaurant", "poi_medical", "poi_transport",
  "poi_shopping", "poi_education", "poi_sport",
  "poi_hotel", "poi_all",
];

function TypeButton({
  type, active, onClick, disabled, tooltip,
}: {
  type: AreaQueryType;
  active: boolean;
  onClick: () => void;
  disabled?: boolean;
  tooltip?: string;
}) {
  return (
    <button
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      title={tooltip}
      className={`rounded-md border px-2 py-1 text-xs transition-colors ${
        disabled
          ? "border-border bg-muted/40 text-muted-foreground cursor-not-allowed opacity-60"
          : active
            ? "border-primary bg-primary/10 text-primary"
            : "border-border hover:bg-accent"
      }`}
    >
      {AREA_TYPE_LABELS[type]}
    </button>
  );
}

export function AreaQueryPanel({ geoMapRef, mapSource, gaodeKey, baiduKey, onResults }: AreaQueryPanelProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { fetchSpatial, isLoading, error } = useOverpassQuery();

  const [mode, setMode] = useState<AreaQueryMode>("semantic");
  const [keyword, setKeyword] = useState("");
  const [areaType, setAreaType] = useState<AreaQueryType>("building");

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isOsm = mapSource === "osm";

  useEffect(() => {
    if (!isOsm && !areaType.startsWith("poi_")) {
      setAreaType("poi_all");
    }
  }, [isOsm, areaType, mapSource]);

  const poiSource = isOsm ? "osm" : mapSource === "gaode" ? "gaode" : "baidu";
  const apiKey = poiSource === "gaode" ? gaodeKey.trim() : poiSource === "baidu" ? baiduKey.trim() : undefined;
  const effectiveAreaType = (!isOsm && !areaType.startsWith("poi_")) ? "poi_all" : areaType;


  const handleQuery = async () => {
    if (debounceRef.current) return;
    debounceRef.current = setTimeout(() => { debounceRef.current = null; }, 800);

    if (mode === "semantic" && !keyword.trim()) {
      toast({ title: t("toast.noKeyword"), variant: "destructive" });
      return;
    }

    if (mode === "rectangle") {
      geoMapRef.current?.setDrawCallbacks(async (bounds) => {
        const bbox: [number, number, number, number] = [
          bounds.getSouth(), bounds.getWest(),
          bounds.getNorth(), bounds.getEast(),
        ];
        const results = await fetchSpatial({ mode: "rectangle", areaType: effectiveAreaType, dataSource: poiSource, bbox, apiKey });
        onResults(results);
        geoMapRef.current?.setDrawMode("none");
      }, null);
      geoMapRef.current?.setDrawMode("rectangle");
      return;
    }

    if (mode === "polygon") {
      geoMapRef.current?.setDrawCallbacks(null, async (latlngs) => {
        const polygonLatLngs: [number, number][] = latlngs.map(l => [l.lat, l.lng]);
        const results = await fetchSpatial({ mode: "polygon", areaType: effectiveAreaType, dataSource: poiSource, polygonLatLngs, apiKey });
        onResults(results);
        geoMapRef.current?.setDrawMode("none");
      });
      geoMapRef.current?.setDrawMode("polygon");
      return;
    }

    const results = await fetchSpatial({ mode: "semantic", areaType: effectiveAreaType, dataSource: poiSource, keyword: keyword.trim(), apiKey });
    onResults(results);
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
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground font-medium">🏗️ {t("areaQuery.groupPolygon")}</span>
              {!isOsm && <span className="text-xs text-muted-foreground">({t("areaQuery.osmOnly")})</span>}
            </div>
            <div className="flex flex-wrap gap-1">
              {POLYGON_TYPES.map(type => (
                <TypeButton
                  key={type}
                  type={type}
                  active={effectiveAreaType === type}
                  onClick={() => setAreaType(type)}
                  disabled={!isOsm}
                  tooltip={!isOsm ? t("areaQuery.polygonDisabled") : undefined}
                />
              ))}
            </div>
            <div className="mt-2 flex items-center gap-2">
              <span className="text-xs text-muted-foreground font-medium">📍 {t("areaQuery.groupPOI")}</span>
            </div>
            <div className="flex flex-wrap gap-1">
              {POI_TYPES.map(type => (
                <TypeButton
                  key={type}
                  type={type}
                  active={effectiveAreaType === type}
                  onClick={() => setAreaType(type)}
                />
              ))}
            </div>
          </div>
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
            {t("areaQuery.extractionMode")}
          </label>
          <RadioGroup value={mode} onValueChange={v => setMode(v as AreaQueryMode)} className="space-y-2">
            {(["semantic", "rectangle", "polygon"] as AreaQueryMode[]).map(m => {
              const icons = { semantic: Search, rectangle: Square, polygon: Pentagon };
              const Icon = icons[m];
              return (
                <div key={m} className="flex items-start gap-2.5 rounded-lg border p-2.5 hover:bg-accent/40 transition-colors">
                  <RadioGroupItem value={m} id={m} className="mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <Label htmlFor={m} className="flex items-center gap-1.5 text-sm font-medium cursor-pointer">
                      <Icon className="h-4 w-4" />
                      {t(`areaQuery.mode${m.charAt(0).toUpperCase() + m.slice(1)}`)}
                    </Label>
                    <p className="text-xs text-muted-foreground mt-0.5">{t(`areaQuery.mode${m.charAt(0).toUpperCase() + m.slice(1)}Hint`)}</p>
                  </div>
                </div>
              );
            })}
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

        <Button onClick={handleQuery} disabled={isLoading} className="w-full gap-1.5">
          {isLoading ? (
            <><Loader2 className="h-4 w-4 animate-spin" /> {t("toast.areaQuery")}...</>
          ) : mode === "rectangle" ? (
            <><Square className="h-4 w-4" /> {t("areaQuery.startDrawRect")}</>
          ) : mode === "polygon" ? (
            <><Pentagon className="h-4 w-4" /> {t("areaQuery.startDrawPoly")}</>
          ) : (
            <><Search className="h-4 w-4" /> {t("areaQuery.query")}</>
          )}
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
