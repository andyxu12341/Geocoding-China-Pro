import { useTranslation } from "react-i18next";
import { MapPin } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { type MapSource } from "@/utils/geocoding";

interface RegionFilterCardProps {
  mapSource: MapSource;
  regionFilter: string;
  onRegionFilterChange: (v: string) => void;
}

export function RegionFilterCard({ mapSource, regionFilter, onRegionFilterChange }: RegionFilterCardProps) {
  const { t } = useTranslation();

  return (
    <Card>
      <CardContent className="pt-4 space-y-1">
        <label className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
          <MapPin className="h-3 w-3" /> {t("settings.regionFilter")}
        </label>
        <Input
          value={regionFilter}
          onChange={(e) => onRegionFilterChange(e.target.value)}
          placeholder={mapSource === "osm" ? t("settings.regionFilterOsm") : t("settings.regionFilterOther")}
          className="text-sm"
        />
        <p className="text-xs text-muted-foreground">
          {mapSource === "osm" ? t("settings.regionFilterHintOsm") : t("settings.regionFilterHintOther")}
        </p>
      </CardContent>
    </Card>
  );
}
