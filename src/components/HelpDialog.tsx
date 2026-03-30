import { useState } from "react";
import { useTranslation } from "react-i18next";
import { HelpCircle, Map, Globe, Key, Layers, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";

interface HelpDialogProps {
  mapSource: string;
  gaodeKeyConfigured: boolean;
  baiduKeyConfigured: boolean;
}

function Section({ title, icon, children, defaultOpen = true }: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b last:border-b-0">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex w-full items-center gap-2 px-1 py-3 text-sm font-medium text-foreground hover:text-primary transition-colors"
      >
        {icon}
        <span className="flex-1 text-left">{title}</span>
        {open ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
      </button>
      {open && <div className="pb-4 pl-7 text-sm text-muted-foreground leading-relaxed space-y-2">{children}</div>}
    </div>
  );
}

function FeatureTag({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-md bg-primary/10 px-1.5 py-0.5 text-xs font-medium text-primary">
      {children}
    </span>
  );
}

export function HelpDialog({ mapSource, gaodeKeyConfigured, baiduKeyConfigured }: HelpDialogProps) {
  const { t, i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const isZh = i18n.language === "zh";

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setOpen(true)}
        className="gap-1.5 text-muted-foreground hover:text-foreground"
        title={isZh ? "使用指南" : "Help"}
      >
        <HelpCircle className="h-4 w-4" />
        <span className="hidden sm:inline">{isZh ? "帮助" : "Help"}</span>
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <HelpCircle className="h-5 w-5 text-primary" />
              {isZh ? "Geospatial Studio 使用指南" : "Geospatial Studio — User Guide"}
            </DialogTitle>
            <DialogDescription>
              {isZh
                ? "纯前端 WebGIS 工作站，高德 / 百度 / OSM 三源聚合"
                : "Pure frontend WebGIS — Amap · Baidu · OSM unified"}
            </DialogDescription>
          </DialogHeader>

          <div className="divide-y">
            {/* 双引擎机制 */}
            <Section
              title={isZh ? "双引擎：按场景选最优数据源" : "Dual-Engine: Optimal Source by Scenario"}
              icon={<Layers className="h-4 w-4 text-primary shrink-0" />}
            >
              <p>
                {isZh
                  ? "本平台采用双引擎路由策略，为不同数据类型匹配最优数据源："
                  : "This platform uses a dual-engine routing strategy to match the best data source for each data type:"}
              </p>
              <div className="space-y-2">
                <div className="flex items-start gap-2 rounded-lg bg-emerald-50 dark:bg-emerald-950/50 p-2.5 border border-emerald-200 dark:border-emerald-800">
                  <Map className="h-4 w-4 text-emerald-600 dark:text-emerald-400 mt-0.5 shrink-0" />
                  <div>
                    <p className="font-medium text-emerald-800 dark:text-emerald-300 text-xs">
                      {isZh ? "面域数据 → OpenStreetMap（OSM）" : "Polygons → OpenStreetMap (OSM)"}
                    </p>
                    <p className="text-xs mt-0.5">
                      {isZh
                        ? "遵循《国土空间规划城市用地分类》国标标准（GB/T 21010-2017），60+ 色卡精准对应用地功能分区"
                        : "Conforms to national land use standard GB/T 21010-2017, 60+ color codes map precisely to land use zones"}
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-2 rounded-lg bg-blue-50 dark:bg-blue-950/50 p-2.5 border border-blue-200 dark:border-blue-800">
                  <Globe className="h-4 w-4 text-blue-600 dark:text-blue-400 mt-0.5 shrink-0" />
                  <div>
                    <p className="font-medium text-blue-800 dark:text-blue-300 text-xs">
                      {isZh ? "POI 点位 → 高德地图（推荐）" : "POI Points → Amap (Recommended)"}
                    </p>
                    <p className="text-xs mt-0.5">
                      {isZh
                        ? "国内精度最高、现势性最强的 POI 数据库，需填入高德 Web 服务 API Key"
                        : "Most accurate and up-to-date POI database for China; requires Amap Web Service API Key"}
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-2 rounded-lg bg-purple-50 dark:bg-purple-950/50 p-2.5 border border-purple-200 dark:border-purple-800">
                  <Globe className="h-4 w-4 text-purple-600 dark:text-purple-400 mt-0.5 shrink-0" />
                  <div>
                    <p className="font-medium text-purple-800 dark:text-purple-300 text-xs">
                      {isZh ? "POI 点位 → 百度地图（备选）" : "POI Points → Baidu Maps (Alternative)"}
                    </p>
                    <p className="text-xs mt-0.5">
                      {isZh
                        ? "与高德互补使用，需填入百度浏览器端 AK"
                        : "Complementary to Amap; requires Baidu Browser AK"}
                    </p>
                  </div>
                </div>
              </div>
            </Section>

            {/* 坐标系脱密承诺 */}
            <Section
              title={isZh ? "坐标系自动脱密：GCJ-02 → WGS-84" : "Coordinate Auto-Transform: GCJ-02 → WGS-84"}
              icon={<Globe className="h-4 w-4 text-primary shrink-0" />}
            >
              <p>
                {isZh
                  ? "高德和百度地图使用 GCJ-02（火星坐标系），与国际标准 WGS-84 存在系统性偏移（约 50–500 米）。"
                  : "Amap and Baidu use GCJ-02 (Mars coordinate system), which has a systematic offset (≈ 50–500m) from the international WGS-84 standard."}
              </p>
              <div className="rounded-lg bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800 p-3">
                <p className="text-amber-800 dark:text-amber-300 text-xs font-medium mb-1">
                  ⚠️ {isZh ? "关键保证" : "Key Guarantee"}
                </p>
                <p className="text-xs text-amber-700 dark:text-amber-400">
                  {isZh
                    ? "平台在数据返回后立即执行 GCJ-02 → WGS-84 算法洗白。所有地图渲染、GeoJSON / KML / CSV 导出均使用纯净 WGS-84 坐标，可直接拖入 QGIS、ArcGIS、Mapbox 等国际 GIS 软件，无需二次转换。"
                    : "The platform immediately executes GCJ-02 → WGS-84 transformation after data returns. All map rendering and GeoJSON / KML / CSV exports use pure WGS-84 coordinates — drag directly into QGIS, ArcGIS, Mapbox, etc. without any conversion."}
                </p>
              </div>
            </Section>

            {/* API Key 说明 */}
            <Section
              title={isZh ? "API Key 配置说明" : "API Key Configuration"}
              icon={<Key className="h-4 w-4 text-primary shrink-0" />}
            >
              <p>
                {isZh
                  ? "本工具为纯前端应用，不设服务端，所有 API 请求均从浏览器直发："
                  : "This tool is a pure frontend app with no backend — all API requests are sent directly from the browser:"}
              </p>
              <div className="space-y-1.5 text-xs">
                <div className="flex items-center gap-2">
                  <FeatureTag>OSM</FeatureTag>
                  <span>{isZh ? "无需 Key，完全免费（Nominatim 限速 1 次/秒）" : "No key needed, completely free (Nominatim rate limit: 1 req/sec)"}</span>
                </div>
                <div className="flex items-center gap-2">
                  <FeatureTag>高德</FeatureTag>
                  <span>
                    {gaodeKeyConfigured
                      ? isZh ? "✓ 已配置" : "✓ Configured"
                      : isZh ? "需要配置高德 Web 服务 Key（免费申请）" : "Amap Web Service Key required (free to apply)"}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <FeatureTag>百度</FeatureTag>
                  <span>
                    {baiduKeyConfigured
                      ? isZh ? "✓ 已配置" : "✓ Configured"
                      : isZh ? "可选：需要配置百度浏览器端 AK" : "Optional: Baidu Browser AK required"}
                  </span>
                </div>
              </div>
              <p className="text-xs mt-2">
                {isZh
                  ? "Key 填写后自动存入本地浏览器（localStorage），关闭页面不丢失，下次回访自动填充。"
                  : "Keys are saved in your browser's localStorage — they persist after closing the page."}
              </p>
            </Section>

            {/* 当前数据源 */}
            <Section
              title={isZh ? "当前数据源状态" : "Current Data Source Status"}
              icon={<Map className="h-4 w-4 text-primary shrink-0" />}
              defaultOpen={false}
            >
              <div className="space-y-1.5 text-xs">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{isZh ? "地图底图" : "Map Tile Layer"}:</span>
                  <span className="font-medium">
                    {mapSource === "osm" ? "OpenStreetMap" : mapSource === "gaode" ? "高德地图" : "百度地图"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">OSM:</span>
                  <span className="text-emerald-600 font-medium">{isZh ? "免费可用" : "Free & Available"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">高德:</span>
                  <span className={gaodeKeyConfigured ? "text-emerald-600 font-medium" : "text-rose-500"}>
                    {gaodeKeyConfigured ? (isZh ? "✓ 已配置" : "✓ Configured") : isZh ? "未配置" : "Not configured"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">百度:</span>
                  <span className={baiduKeyConfigured ? "text-emerald-600 font-medium" : "text-muted-foreground"}>
                    {baiduKeyConfigured ? (isZh ? "✓ 已配置" : "✓ Configured") : isZh ? "未配置（可选）" : "Not configured (optional)"}
                  </span>
                </div>
              </div>
            </Section>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
