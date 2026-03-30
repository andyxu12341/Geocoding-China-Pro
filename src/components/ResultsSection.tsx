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
import type { GeocodeItem, AreaResult } from "@/utils/geocoding";
import {
  exportCSV, exportGeoJSON, exportKML,
  exportPolygonCSV, exportPolygonGeoJSON, exportPolygonKML,
} from "@/utils/exportUtils";

interface ResultsSectionProps {
  appMode: "geocoding" | "polygon";
  results: GeocodeItem[];
  areaResults: AreaResult[];
  onExportPNG: () => void;
  onCopyCoords: (r: GeocodeItem) => void;
  onSelectCandidate: (address: string, candidates: GeocodeItem["candidates"]) => void;
}

export function ResultsSection({
  appMode, results, areaResults, onExportPNG, onCopyCoords, onSelectCandidate,
}: ResultsSectionProps) {
  const { t } = useTranslation();
  const count = appMode === "geocoding" ? results.length : areaResults.length;

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
                        <DropdownMenuItem onClick={() => exportKML(results)}>📍 {t("results.exportKML")}</DropdownMenuItem>
                      </>
                    ) : (
                      <>
                        <DropdownMenuItem onClick={() => exportPolygonCSV(areaResults)}>📄 CSV</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => exportPolygonGeoJSON(areaResults)}>🗺️ GeoJSON</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => exportPolygonKML(areaResults)}>🌍 Google Earth (KML)</DropdownMenuItem>
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
                <Table
                  className="w-full whitespace-nowrap text-left text-sm"
                  containerClassName="w-full overflow-x-auto overflow-y-auto max-h-[500px] border rounded-md"
                >
                  <TableHeader className="sticky top-0 z-10 bg-card">
                    <TableRow>
                      <TableHead className="whitespace-nowrap">名称</TableHead>
                      <TableHead className="whitespace-nowrap">类别</TableHead>
                      <TableHead className="whitespace-nowrap">OSM ID</TableHead>
                      <TableHead className="whitespace-nowrap">中心点</TableHead>
                      <TableHead className="max-w-xs truncate whitespace-nowrap">标签</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {areaResults.map((r) => (
                      <TableRow key={r.osmId}>
                        <TableCell className="max-w-xs truncate font-medium">{r.name || "未命名"}</TableCell>
                        <TableCell className="whitespace-nowrap">
                          <Badge variant="outline" className="text-xs">
                            {r.categoryName}
                          </Badge>
                        </TableCell>
                        <TableCell className="whitespace-nowrap font-mono text-xs text-muted-foreground">{r.osmId}</TableCell>
                        <TableCell className="whitespace-nowrap font-mono text-xs text-muted-foreground">
                          {r.center ? `${r.center.lat.toFixed(5)}, ${r.center.lng.toFixed(5)}` : "—"}
                        </TableCell>
                        <TableCell className="max-w-xs truncate text-xs text-muted-foreground">
                          {Object.entries(r.tags).slice(0, 3).map(([k, v]) => `${k}:${v}`).join(", ")}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
