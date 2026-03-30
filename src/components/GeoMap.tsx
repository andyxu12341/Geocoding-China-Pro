import { useEffect, useRef, forwardRef, useImperativeHandle, useCallback } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet.chinatmsproviders";
import "leaflet-draw";
import "leaflet-draw/dist/leaflet.draw.css";
import { AREA_CATEGORY_COLORS, AREA_CATEGORY_LABELS } from "@/utils/geocoding";

type DrawMode = "none" | "rectangle" | "polygon";

export interface MapMarker {
  lat: number;
  lng: number;
  label: string;
  category?: string;
}

export interface MapPolygon {
  id: string;
  rings: number[][][];
  label: string;
  tags?: Record<string, string>;
  category?: string;
  osmId?: number;
  osmType?: string;
}

export interface CategoryColor {
  category: string;
  color: string;
}

interface GeoMapProps {
  markers: MapMarker[];
  className?: string;
  autoFitDisabled?: boolean;
  categoryColors?: CategoryColor[];
  polygons?: MapPolygon[];
}

export interface GeoMapHandle {
  getMap: () => L.Map | null;
  getZoom: () => number;
  getBounds: () => L.LatLngBounds | null;
  setDrawMode: (mode: DrawMode) => void;
  setDrawCallbacks: (rectDone: ((bounds: L.LatLngBounds) => void) | null, polyDone: ((latlngs: L.LatLng[]) => void) | null) => void;
  cancelDraw: () => void;
  invalidateSize: () => void;
}

const OSM_ATTR = '&copy; <a href="https://openstreetmap.org/copyright">OpenStreetMap</a> contributors';
const SAT_ATTR = "&copy; Esri &middot; Maxar &middot; Earthstar Geographics";
const DARK_ATTR = '&copy; <a href="https://openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/">CARTO</a>';
const TIANDITU_ATTR = '&copy; <a href="https://www.tianditu.gov.cn">天地图</a>';
const GAODE_ATTR = '&copy; <a href="https://www.autonavi.com">高德地图</a>';
const GEOQ_ATTR = '&copy; <a href="https://www.geoq.cn">智图科技</a>';

const DEFAULT_MARKER_COLOR = "#6366f1";

export const GeoMap = forwardRef<GeoMapHandle, GeoMapProps>(({ markers, className, autoFitDisabled, categoryColors, polygons }, ref) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerLayerRef = useRef<L.LayerGroup | null>(null);
  const polygonLayerRef = useRef<L.LayerGroup | null>(null);
  const rendererRef = useRef<L.Canvas | null>(null);
  const drawLayerRef = useRef<L.FeatureGroup | null>(null);
  const osmLayerRef = useRef<L.TileLayer | null>(null);
  const darkLayerRef = useRef<L.TileLayer | null>(null);
  const legendRef = useRef<L.Control | null>(null);
  const drawModeRef = useRef<DrawMode>("none");
  const drawCallbacksRef = useRef<{
    rectDone: ((bounds: L.LatLngBounds) => void) | null;
    polyDone: ((latlngs: L.LatLng[]) => void) | null;
  }>({ rectDone: null, polyDone: null });

  useImperativeHandle(ref, () => ({
    getMap: () => mapRef.current,
    getZoom: () => mapRef.current?.getZoom() ?? 0,
    getBounds: () => mapRef.current?.getBounds() ?? null,
    setDrawMode: (mode) => {
      console.log("[GeoMap] setDrawMode called:", mode);
      drawModeRef.current = mode;
      const map = mapRef.current;
      if (!map) return;
      const prevMode = (map as L.Map & { _prevDrawMode?: DrawMode })._prevDrawMode;
      if (prevMode === mode) return;
      (map as L.Map & { _prevDrawMode?: DrawMode })._prevDrawMode = mode;
      map.fire("draw:modechange");
    },
    setDrawCallbacks: (rectDone, polyDone) => {
      console.log("[GeoMap] setDrawCallbacks called, rectDone:", !!rectDone, "polyDone:", !!polyDone);
      drawCallbacksRef.current = { rectDone, polyDone };
    },
    cancelDraw: () => {
      drawModeRef.current = "none";
      const map = mapRef.current;
      if (map) (map as L.Map & { _prevDrawMode?: DrawMode })._prevDrawMode = "none";
      mapRef.current?.fire("draw:modechange");
    },
    invalidateSize: () => {
      const map = mapRef.current;
      if (map) map.invalidateSize({ animate: true });
    },
  }));

  useEffect(() => {
    const el = containerRef.current;
    if (!el || mapRef.current) return;

    const map = L.map(el, {
      center: [35, 105],
      zoom: 4,
      zoomControl: true,
      attributionControl: true,
    });

    const osmLayer = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { attribution: OSM_ATTR, maxZoom: 19, crossOrigin: "anonymous" });
    const satLayer = L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", { attribution: SAT_ATTR, maxZoom: 19 });
    const darkLayer = L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", { attribution: DARK_ATTR, maxZoom: 19, crossOrigin: "anonymous" });
    const gaodeLayer = L.tileLayer.chinaProvider("GaoDe.Normal.Map", { attribution: GAODE_ATTR, maxZoom: 18 });
    const gaodeSatLayer = L.tileLayer.chinaProvider("GaoDe.Satellite.Map", { attribution: GAODE_ATTR, maxZoom: 18 });
    const geoqLayer = L.tileLayer.chinaProvider("Geoq.Normal.Map", { attribution: GEOQ_ATTR, maxZoom: 18 });
    const geoqBlueLayer = L.tileLayer.chinaProvider("Geoq.Normal.PurplishBlue", { attribution: GEOQ_ATTR, maxZoom: 18 });
    const tdtLayer = L.tileLayer.chinaProvider("TianDiTu.Normal.Map", { attribution: TIANDITU_ATTR, maxZoom: 18 });
    const tdtSatLayer = L.tileLayer.chinaProvider("TianDiTu.Satellite.Map", { attribution: TIANDITU_ATTR, maxZoom: 18 });

    osmLayerRef.current = osmLayer;
    darkLayerRef.current = darkLayer;

    gaodeLayer.addTo(map);

    L.control.layers(
      {
        "🏠 高德地图": gaodeLayer,
        "🗺️ OpenStreetMap": osmLayer,
        "🛰️ 卫星图(Esri)": satLayer,
        "📡 高德卫星": gaodeSatLayer,
        "🗄️ 智图在线": geoqLayer,
        "🎨 智图藏蓝": geoqBlueLayer,
        "🌐 天地图": tdtLayer,
        "🛰️ 天地图卫星": tdtSatLayer,
        "🌙 暗色地图": darkLayer,
      },
      {},
      { position: "topright", collapsed: true }
    ).addTo(map);

    L.control.scale({ imperial: false, position: "bottomleft" }).addTo(map);

    rendererRef.current = L.canvas({ padding: 0.5 });
    markerLayerRef.current = L.layerGroup().addTo(map);
    polygonLayerRef.current = L.layerGroup().addTo(map);
    drawLayerRef.current = new L.FeatureGroup().addTo(map);
    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    const map = mapRef.current;
    if (!el || !map) return;

    const observer = new ResizeObserver(() => {
      map.invalidateSize({ animate: false });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);



  // Build color lookup from categoryColors
  const colorMap = new Map<string, string>();
  categoryColors?.forEach(cc => colorMap.set(cc.category, cc.color));

  useEffect(() => {
    const map = mapRef.current;
    const mLayer = markerLayerRef.current;
    const pLayer = polygonLayerRef.current;
    const renderer = rendererRef.current;
    if (!map || !mLayer || !pLayer || !renderer) return;

    mLayer.clearLayers();
    pLayer.clearLayers();

    // Remove old legend
    if (legendRef.current) {
      map.removeControl(legendRef.current);
      legendRef.current = null;
    }

    if (markers.length === 0 && (!polygons || polygons.length === 0)) return;

    const latLngs: L.LatLngTuple[] = [];

    // Render markers
    markers.forEach(m => {
      const fillColor = (m.category && colorMap.get(m.category)) || DEFAULT_MARKER_COLOR;
      const cm = L.circleMarker([m.lat, m.lng], {
        renderer,
        radius: 5,
        fillColor,
        color: "#ffffff",
        weight: 1.5,
        fillOpacity: 0.88,
        interactive: true,
      })
        .bindPopup(
          `<div style="font-weight:600;margin-bottom:2px">${m.label}</div>` +
          `<div style="font-size:12px;color:#666">${m.lat.toFixed(5)}, ${m.lng.toFixed(5)}</div>`,
          { closeButton: false }
        )
        .addTo(mLayer);

      cm.on("mouseover", function (this: L.CircleMarker) { this.openPopup(); });
      cm.on("mouseout", function (this: L.CircleMarker) { this.closePopup(); });

      latLngs.push([m.lat, m.lng]);
    });

    // Render polygons
    const seenCategories = new Set<string>();
    polygons?.forEach((poly) => {
      const cat = poly.category ?? "other";
      const color = AREA_CATEGORY_COLORS[cat] ?? AREA_CATEGORY_COLORS.other;
      poly.rings.forEach(ring => {
        const latLngRing: L.LatLngExpression[] = ring.map(c => [c[1], c[0]] as L.LatLngTuple);
        if (latLngRing.length < 3) return;

        const tags = poly.tags || {};
        const tagLines = Object.entries(tags)
          .filter(([k]) => ["name", "landuse", "leisure", "building", "boundary", "admin_level"].includes(k))
          .map(([k, v]) => `<div style="font-size:11px"><b>${k}:</b> ${v}</div>`)
          .join("");

        L.polygon(latLngRing, {
          renderer,
          color,
          weight: 2,
          fillColor: color,
          fillOpacity: 0.3,
          interactive: true,
        })
          .bindPopup(
            `<div style="font-weight:600;margin-bottom:4px">${poly.label}</div>` +
            `<div style="font-size:11px;color:#666">${tagLines || "OSM 多边形数据"}</div>`,
            { closeButton: false }
          )
          .addTo(pLayer);

        latLngs.push(latLngRing[0] as L.LatLngTuple);
      });
      seenCategories.add(cat);
    });

    // Add category legend
    const legendItems: { color: string; label: string }[] = [];
    categoryColors?.forEach(cc => legendItems.push({ color: cc.color, label: cc.category }));
    seenCategories.forEach(cat => {
      const color = AREA_CATEGORY_COLORS[cat] ?? AREA_CATEGORY_COLORS.other;
      const label = AREA_CATEGORY_LABELS[cat] ?? "其他设施";
      legendItems.push({ color, label });
    });

    if (legendItems.length > 0) {
      const legend = new L.Control({ position: "bottomright" });
      legend.onAdd = () => {
        const div = L.DomUtil.create("div", "leaflet-legend");
        div.style.cssText = "background:rgba(255,255,255,0.92);backdrop-filter:blur(4px);padding:8px 12px;border-radius:8px;font-size:12px;line-height:22px;box-shadow:0 2px 8px rgba(0,0,0,0.15);max-height:220px;overflow-y:auto;min-width:130px;";
        div.innerHTML = legendItems.map(item =>
          `<div style="display:flex;align-items:center;gap:8px;"><span style="display:inline-block;width:12px;height:12px;border-radius:3px;background:${item.color};border:1px solid rgba(0,0,0,0.15);"></span><span>${item.label}</span></div>`
        ).join("");
        return div;
      };
      legend.addTo(map);
      legendRef.current = legend;
    }

    if (!autoFitDisabled && latLngs.length > 0) {
      if (latLngs.length === 1) {
        map.setView(latLngs[0], 13, { animate: true, duration: 1.2 });
      } else {
        map.fitBounds(L.latLngBounds(latLngs), {
          padding: [50, 50],
          maxZoom: 14,
          animate: true,
          duration: 1,
        });
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [markers, autoFitDisabled, categoryColors, polygons]);

  const DrawController = () => {
    const activeHandlerRef = useRef<L.Draw.Rectangle | L.Draw.Polygon | null>(null);

    useEffect(() => {
      console.log("[DrawController] Effect mounted, map ready:", !!mapRef.current);
      const map = mapRef.current;
      if (!map || !drawLayerRef.current) return;

      const handleModeChange = () => {
        console.log("[DrawController] handleModeChange fired, drawModeRef:", drawModeRef.current);
        if (!drawLayerRef.current) {
          console.warn("[DrawController] drawLayerRef not ready");
          return;
        }

        if (activeHandlerRef.current) {
          console.log("[DrawController] Disabling previous handler");
          try { activeHandlerRef.current.disable(); } catch (e) { console.warn("[DrawController] disable error:", e); }
          activeHandlerRef.current = null;
        }

        drawLayerRef.current.clearLayers();
        map.off(L.Draw.Event.CREATED);

        const mode = drawModeRef.current;
        const callbacks = drawCallbacksRef.current;
        console.log("[DrawController] Mode:", mode, "callbacks:", callbacks);

        if (mode === "none") {
          console.log("[DrawController] Mode is none, skipping handler creation");
          return;
        }

        let handler: L.Draw.Rectangle | L.Draw.Polygon;

        if (mode === "rectangle") {
          console.log("[DrawController] Creating L.Draw.Rectangle");
          handler = new L.Draw.Rectangle(map, {
            shapeOptions: { color: "#6366f1", weight: 3, fillOpacity: 0.15, dashArray: "6,4" },
          });
        } else {
          console.log("[DrawController] Creating L.Draw.Polygon");
          handler = new L.Draw.Polygon(map, {
            shapeOptions: { color: "#f59e0b", weight: 3, fillOpacity: 0.15, dashArray: "6,4" },
            allowIntersection: false,
          });
        }

        activeHandlerRef.current = handler;
        handler.enable();
        console.log("[DrawController] Handler enabled for mode:", mode);

        map.on(L.Draw.Event.CREATED, (e: L.LeafletEvent) => {
          console.log("[DrawController] draw:created fired, mode:", mode);
          const layer = (e as L.DrawEvents.Created).layer;
          if (drawLayerRef.current) {
            drawLayerRef.current.addLayer(layer);
            drawLayerRef.current.removeLayer(layer);
          }

          if (mode === "rectangle" && callbacks.rectDone) {
            console.log("[DrawController] Calling rectDone callback");
            callbacks.rectDone((layer as L.Rectangle).getBounds());
          } else if (mode === "polygon" && callbacks.polyDone) {
            console.log("[DrawController] Calling polyDone callback");
            callbacks.polyDone((layer as L.Polygon).getLatLngs()[0] as L.LatLng[]);
          } else {
            console.warn("[DrawController] No callback for mode:", mode, "callbacks:", callbacks);
          }
        });
      };

      map.on("draw:modechange", handleModeChange);
      return () => {
        map.off("draw:modechange", handleModeChange);
        map.off(L.Draw.Event.CREATED);
        if (activeHandlerRef.current) {
          try { activeHandlerRef.current.disable(); } catch {}
          activeHandlerRef.current = null;
        }
      };
    }, []);

    return null;
  };

  return (
    <div ref={containerRef} className={className} style={{ width: "100%", height: "100%" }}>
      <DrawController />
    </div>
  );
});

GeoMap.displayName = "GeoMap";
