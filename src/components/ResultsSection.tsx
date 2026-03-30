import { AnimatePresence, motion } from "framer-motion";
import { Download, ChevronDown, MapPin, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useTranslation } from "react-i18next";
import type { GeocodeItem, AreaResult, POIResult } from "@/utils/geocoding";
import {
  exportCSV, exportGeoJSON, exportGeocodingKML,
  exportPolygonCSV, exportPolygonGeoJSON, exportPolygonKML,
  exportCombinedCSV, exportCombinedGeoJSON, exportCombinedKML,
  exportPOIGeoJSON, exportPOICSV, exportPOIKML,
} from "@/utils/exportUtils";
import type { SpatialResult } from "@/hooks/useOverpassQuery";

interface ResultsSectionProps {
  appMode: "geocoding" | "polygon";
  results: GeocodeItem[];
  areaResults: SpatialResult[];
  onExportPNG: () => void;
  onCopyCoords: (r: GeocodeItem) => void;
  onSelectCandidate: (address: string, candidates: GeocodeItem["candidates"]) => void;
}

export function ResultsSection({
  appMode, results, areaResults, onExportPNG, onCopyCoords, onSelectCandidate,
}: ResultsSectionProps) {
  const { t } = useTranslation();
  const count = appMode === "geocoding" ? results.length : areaResults.length;

  const polygonResults: AreaResult[] = areaResults
    .filter(r => !!r.polygon)
    .map(r => r.polygon!);
  const poiResults: POIResult[] = areaResults
    .filter(r => !!r.poi)
    .map(r => r.poi!);

  const polygonExportDisabled = polygonResults.length === 0;
  const poiExportDisabled = poiResults.length === 0;

  const handleExportPolygonCSV = () => {
    if (polygonExportDisabled) return;
    exportPolygonCSV(polygonResults);
  };
  const handleExportPolygonGeoJSON = () => {
    if (polygonExportDisabled) return;
    exportPolygonGeoJSON(polygonResults);
  };
  const handleExportPolygonKML = () => {
    if (polygonExportDisabled) return;
    exportPolygonKML(polygonResults);
  };

  const handleExportPOIGeoJSON = () => {
    if (poiExportDisabled) return;
    exportPOIGeoJSON(poiResults);
  };

  const handleExportPOIKML = () => {
    if (poiExportDisabled) return;
    exportPOIKML(poiResults);
  };

  const handleExportPOICSV = () => {
    if (poiExportDisabled) return;
    exportPOICSV(poiResults);
  };

  return (
    <AnimatePresence>
      {count > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="min-w-0 w-full overflow-hidden"
        >
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2 text-base">
                  {t("results.title")}
                  <Badge variant="secondary" className="ml-1">{count}</Badge>
                </CardTitle>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" className="gap-1.5">
                      <Download className="h-4 w-4" /> {t("results.export")} <ChevronDown className="h-3 w-3" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {appMode === "geocoding" ? (
                      <>
                        <DropdownMenuItem onClick={() => exportCSV(results)}>📄 {t("results.exportCSV")}</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => exportGeoJSON(results)}>🗺️ {t("results.exportGeoJSON")}</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => exportGeocodingKML(results)}>📍 {t("results.exportKML")}</DropdownMenuItem>
                      </>
                    ) : (
                      <>
                        {poiResults.length > 0 && (
                          <>
                            <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">📍 POI 点位</div>
                            <DropdownMenuItem onClick={handleExportPOIGeoJSON} disabled={poiExportDisabled}>🗺️ GeoJSON</DropdownMenuItem>
                            <DropdownMenuItem onClick={handleExportPOIKML} disabled={poiExportDisabled}>🌍 KML</DropdownMenuItem>
                            <DropdownMenuItem onClick={handleExportPOICSV} disabled={poiExportDisabled}>📄 CSV</DropdownMenuItem>
                          </>
                        )}
                        {polygonResults.length > 0 && (
                          <>
                            <DropdownMenuSeparator />
                            <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">🏗️ 面域数据</div>
                            <DropdownMenuItem onClick={handleExportPolygonCSV} disabled={polygonExportDisabled}>📄 CSV</DropdownMenuItem>
                            <DropdownMenuItem onClick={handleExportPolygonGeoJSON} disabled={polygonExportDisabled}>🗺️ GeoJSON</DropdownMenuItem>
                            <DropdownMenuItem onClick={handleExportPolygonKML} disabled={polygonExportDisabled}>🌍 KML</DropdownMenuItem>
                          </>
                        )}
                        {polygonResults.length > 0 && poiResults.length > 0 && (
                          <>
                            <DropdownMenuSeparator />
                            <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">📦 统一导出</div>
                            <DropdownMenuItem onClick={() => exportCombinedCSV(
                              poiResults.map(p => ({
                                address: p.name,
                                lat: String(p.lat),
                                lng: String(p.lng),
                                formattedAddress: p.address,
                                source: p.source,
                                category: p.categoryName,
                                status: "success" as const,
                              })),
                              polygonResults
                            )}>📄 Combined CSV</DropdownMenuItem>
                            <DropdownMenuItem onClick={() => exportCombinedGeoJSON(
                              poiResults.map(p => ({
                                address: p.name,
                                lat: String(p.lat),
                                lng: String(p.lng),
                                formattedAddress: p.address,
                                source: p.source,
                                category: p.categoryName,
                                status: "success" as const,
                              })),
                              polygonResults
                            )}>🗺️ Combined GeoJSON</DropdownMenuItem>
                            <DropdownMenuItem onClick={() => exportCombinedKML(
                              poiResults.map(p => ({
                                address: p.name,
                                lat: String(p.lat),
                                lng: String(p.lng),
                                formattedAddress: p.address,
                                source: p.source,
                                category: p.categoryName,
                                status: "success" as const,
                              })),
                              polygonResults
                            )}>🌍 Combined KML</DropdownMenuItem>
                          </>
                        )}
                      </>
                    )}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={onExportPNG}>🖼️ {t("results.exportPNG")}</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </CardHeader>
            <CardContent className="min-w-0 overflow-hidden">
              {appMode === "geocoding" ? (
                <Table
                  className="w-full whitespace-nowrap text-left text-sm"
                  containerClassName="w-full overflow-x-auto overflow-y-auto max-h-[500px] border rounded-md"
                >
                  <TableHeader className="sticky top-0 z-10 bg-card">
                    <TableRow>
                      <TableHead className="max-w-xs truncate whitespace-nowrap">{t("results.address")}</TableHead>
                      <TableHead className="whitespace-nowrap">{t("results.lng")}</TableHead>
                      <TableHead className="whitespace-nowrap">{t("results.lat")}</TableHead>
                      <TableHead className="max-w-sm truncate whitespace-nowrap">{t("results.formatted")}</TableHead>
                      <TableHead className="whitespace-nowrap">{t("results.category")}</TableHead>
                      <TableHead className="whitespace-nowrap">{t("results.status")}</TableHead>
                      <TableHead className="w-[60px] whitespace-nowrap">{t("results.action")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {results.map((r, i) => (
                      <TableRow key={i}>
                        <TableCell className="max-w-xs truncate whitespace-nowrap font-medium">{r.address}</TableCell>
                        <TableCell className="whitespace-nowrap font-mono text-xs">{r.lng ?? "-"}</TableCell>
                        <TableCell className="whitespace-nowrap font-mono text-xs">{r.lat ?? "-"}</TableCell>
                        <TableCell className="max-w-sm truncate whitespace-nowrap text-xs text-muted-foreground">{r.formattedAddress ?? "-"}</TableCell>
                        <TableCell className="whitespace-nowrap text-xs">{r.category ? <Badge variant="outline" className="text-xs">{r.category}</Badge> : "-"}</TableCell>
                        <TableCell className="whitespace-nowrap">
                          {r.status === "success" ? (
                            <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300">{t("progress.success")}</Badge>
                          ) : (
                            <Badge variant="destructive" className="text-xs">{r.error || t("progress.failed")}</Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          {r.status === "success" && r.candidates && r.candidates.length > 1 && (
                            <Button size="sm" variant="outline" className="h-7 gap-1 text-xs" onClick={() => onSelectCandidate(r.address, r.candidates!)}>
                              <MapPin className="h-3 w-3" /> {t("results.select")}
                            </Button>
                          )}
                          {r.status === "success" && (!r.candidates || r.candidates.length <= 1) && (
                            <button onClick={() => onCopyCoords(r)} className="rounded p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
                              <Copy className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="space-y-4">
                  {polygonResults.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground mb-2">🏗️ 面域数据 ({polygonResults.length})</p>
                      <Table containerClassName="w-full overflow-x-auto overflow-y-auto max-h-[300px] border rounded-md">
                        <TableHeader className="sticky top-0 z-10 bg-card">
                          <TableRow>
                            <TableHead className="whitespace-nowrap">{t("results.polyName")}</TableHead>
                            <TableHead className="whitespace-nowrap">{t("results.polyCategory")}</TableHead>
                            <TableHead className="whitespace-nowrap">{t("results.polyOsmId")}</TableHead>
                            <TableHead className="whitespace-nowrap">{t("results.polyCenter")}</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {polygonResults.map((r) => (
                            <TableRow key={`poly-${r.osmId}`}>
                              <TableCell className="max-w-xs truncate font-medium">{r.name || "未命名"}</TableCell>
                              <TableCell className="whitespace-nowrap">
                                <Badge variant="outline" className="text-xs" style={{ borderColor: r.color, backgroundColor: `${r.color}20` }}>{r.categoryName}</Badge>
                              </TableCell>
                              <TableCell className="whitespace-nowrap font-mono text-xs text-muted-foreground">{r.osmId}</TableCell>
                              <TableCell className="whitespace-nowrap font-mono text-xs text-muted-foreground">
                                {r.center ? `${r.center.lat.toFixed(5)}, ${r.center.lng.toFixed(5)}` : "—"}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                  {poiResults.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground mb-2">📍 POI 点位 ({poiResults.length})</p>
                      <Table containerClassName="w-full overflow-x-auto overflow-y-auto max-h-[300px] border rounded-md">
                        <TableHeader className="sticky top-0 z-10 bg-card">
                          <TableRow>
                            <TableHead className="whitespace-nowrap">{t("results.polyName")}</TableHead>
                            <TableHead className="whitespace-nowrap">{t("results.polyCategory")}</TableHead>
                            <TableHead className="whitespace-nowrap">来源</TableHead>
                            <TableHead className="whitespace-nowrap">{t("results.lat")} / {t("results.lng")}</TableHead>
                            <TableHead className="max-w-xs truncate whitespace-nowrap">地址</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {poiResults.map((r, i) => (
                            <TableRow key={`poi-${i}`}>
                              <TableCell className="max-w-xs truncate font-medium">{r.name}</TableCell>
                              <TableCell className="whitespace-nowrap">
                                <Badge variant="outline" className="text-xs" style={{ borderColor: r.color, backgroundColor: `${r.color}20` }}>{r.categoryName}</Badge>
                              </TableCell>
                              <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                                {r.source === "osm" ? "OSM" : r.source === "gaode" ? "高德" : "百度"}
                              </TableCell>
                              <TableCell className="whitespace-nowrap font-mono text-xs text-muted-foreground">
                                {r.lat.toFixed(5)}, {r.lng.toFixed(5)}
                              </TableCell>
                              <TableCell className="max-w-xs truncate text-xs text-muted-foreground">
                                {r.address || "—"}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
