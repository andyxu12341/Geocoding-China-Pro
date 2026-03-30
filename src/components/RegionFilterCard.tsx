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
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm">
          <MapPin className="h-4 w-4" />
          {t("settings.regionFilter")}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-1">
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
