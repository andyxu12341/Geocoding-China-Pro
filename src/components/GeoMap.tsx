import { useEffect, useRef, forwardRef, useImperativeHandle, useCallback } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet.chinatmsproviders";
import "leaflet-draw";
import "leaflet-draw/dist/leaflet.draw.css";
import { LANDUSE_STANDARD_MAP } from "@/utils/geocoding";

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
  color: string;
  categoryName: string;
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

const RECT_COLOR = "#6366f1";
const RECT_WEIGHT = 2;
const RECT_FILL_OPACITY = 0.15;
const TEMP_MARKER_COLOR = "#ef4444";

export const GeoMap = forwardRef<GeoMapHandle, GeoMapProps>(({ markers, className, autoFitDisabled, categoryColors, polygons }, ref) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerLayerRef = useRef<L.LayerGroup | null>(null);
  const polygonLayerRef = useRef<L.LayerGroup | null>(null);
  const rendererRef = useRef<L.Canvas | null>(null);
  const drawLayerRef = useRef<L.FeatureGroup | null>(null);
  const legendRef = useRef<L.Control | null>(null);

  const drawModeRef = useRef<DrawMode>("none");
  const drawCallbacksRef = useRef<{
    rectDone: ((bounds: L.LatLngBounds) => void) | null;
    polyDone: ((latlngs: L.LatLng[]) => void) | null;
  }>({ rectDone: null, polyDone: null });

  const rectClicksRef = useRef<L.LatLng[]>([]);
  const rectTempMarkerRef = useRef<L.CircleMarker | null>(null);
  const rectClickHandlerRef = useRef<((e: L.LeafletMouseEvent) => void) | null>(null);

  const polyHandlerRef = useRef<L.Draw.Polygon | null>(null);

  const cleanupRectMode = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;

    if (rectClickHandlerRef.current) {
      map.off("click", rectClickHandlerRef.current);
      rectClickHandlerRef.current = null;
    }
    if (rectTempMarkerRef.current) {
      map.removeLayer(rectTempMarkerRef.current);
      rectTempMarkerRef.current = null;
    }
    rectClicksRef.current = [];
    if (containerRef.current) {
      containerRef.current.style.cursor = "";
    }
  }, []);

  const setupRectClick = useCallback(() => {
    const map = mapRef.current;
    if (!map || !drawLayerRef.current) return;

    cleanupRectMode();
    if (containerRef.current) {
      containerRef.current.style.cursor = "crosshair";
    }

    const handler = (e: L.LeafletMouseEvent) => {
      const pts = rectClicksRef.current;
      const clickPos = e.latlng;

      if (pts.length === 0) {
        pts.push(clickPos);

        const marker = L.circleMarker(clickPos, {
          radius: 6,
          fillColor: TEMP_MARKER_COLOR,
          color: "#ffffff",
          weight: 2,
          fillOpacity: 0.9,
          interactive: false,
        }).addTo(map);
        rectTempMarkerRef.current = marker;
        return;
      }

      const pointA = pts[0];
      const pointB = clickPos;
      const bounds = L.latLngBounds(pointA, pointB);

      const rectLayer = L.rectangle(bounds, {
        color: RECT_COLOR,
        weight: RECT_WEIGHT,
        fillOpacity: RECT_FILL_OPACITY,
        fillColor: RECT_COLOR,
      }).addTo(drawLayerRef.current!);

      if (rectTempMarkerRef.current) {
        map.removeLayer(rectTempMarkerRef.current);
        rectTempMarkerRef.current = null;
      }
      rectClicksRef.current = [];

      const cb = drawCallbacksRef.current;
      if (cb.rectDone) cb.rectDone(bounds);
    };

    rectClickHandlerRef.current = handler;
    map.on("click", handler);
  }, [cleanupRectMode]);

  const applyDrawMode = useCallback(() => {
    const map = mapRef.current;
    if (!map || !drawLayerRef.current) return;

    cleanupRectMode();

    if (polyHandlerRef.current) {
      try { polyHandlerRef.current.disable(); } catch (_e) { /* ignore */ }
      polyHandlerRef.current = null;
    }
    drawLayerRef.current.clearLayers();
    map.off(L.Draw.Event.CREATED);

    const mode = drawModeRef.current;
    const callbacks = drawCallbacksRef.current;

    if (mode === "none") return;

    if (mode === "rectangle") {
      setupRectClick();
      return;
    }

    if (!callbacks.polyDone) return;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const handler = new (L.Draw.Polygon as any)(map, {
      shapeOptions: {
        color: "#f59e0b",
        weight: 3,
        fillOpacity: 0.15,
        dashArray: "6,4",
      },
      allowIntersection: false,
      showArea: false,
      showLength: false,
    });
    polyHandlerRef.current = handler;
    handler.enable();

    map.once(L.Draw.Event.CREATED, (e: L.LeafletEvent) => {
      const layer = (e as L.DrawEvents.Created).layer;
      if (drawLayerRef.current) {
        drawLayerRef.current.addLayer(layer);
        drawLayerRef.current.removeLayer(layer);
      }
      const cb = drawCallbacksRef.current;
      if (cb.polyDone) cb.polyDone((layer as L.Polygon).getLatLngs()[0] as L.LatLng[]);
    });
  }, [cleanupRectMode, setupRectClick]);

  useImperativeHandle(ref, () => ({
    getMap: () => mapRef.current,
    getZoom: () => mapRef.current?.getZoom() ?? 0,
    getBounds: () => mapRef.current?.getBounds() ?? null,
    setDrawMode: (mode) => {
      drawModeRef.current = mode;
      applyDrawMode();
    },
    setDrawCallbacks: (rectDone, polyDone) => {
      drawCallbacksRef.current = { rectDone, polyDone };
    },
    cancelDraw: () => {
      drawModeRef.current = "none";
      applyDrawMode();
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const gaodeLayer = (L.tileLayer as any).chinaProvider("GaoDe.Normal.Map", { attribution: GAODE_ATTR, maxZoom: 18 });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const gaodeSatLayer = (L.tileLayer as any).chinaProvider("GaoDe.Satellite.Map", { attribution: GAODE_ATTR, maxZoom: 18 });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const geoqLayer = (L.tileLayer as any).chinaProvider("Geoq.Normal.Map", { attribution: GEOQ_ATTR, maxZoom: 18 });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const geoqBlueLayer = (L.tileLayer as any).chinaProvider("Geoq.Normal.PurplishBlue", { attribution: GEOQ_ATTR, maxZoom: 18 });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tdtLayer = (L.tileLayer as any).chinaProvider("TianDiTu.Normal.Map", { attribution: TIANDITU_ATTR, maxZoom: 18 });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tdtSatLayer = (L.tileLayer as any).chinaProvider("TianDiTu.Satellite.Map", { attribution: TIANDITU_ATTR, maxZoom: 18 });

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
      cleanupRectMode();
      map.remove();
      mapRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
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

    if (legendRef.current) {
      map.removeControl(legendRef.current);
      legendRef.current = null;
    }

    if (markers.length === 0 && (!polygons || polygons.length === 0)) return;

    const latLngs: L.LatLngTuple[] = [];

    markers.forEach(m => {
      const fillColor = (m.category && colorMap.get(m.category)) || DEFAULT_MARKER_COLOR;
      L.circleMarker([m.lat, m.lng], {
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
        .on("mouseover", function (this: L.CircleMarker) { this.openPopup(); })
        .on("mouseout", function (this: L.CircleMarker) { this.closePopup(); })
        .addTo(mLayer);

      latLngs.push([m.lat, m.lng]);
    });

    const seenCategories = new Map<string, string>();
    polygons?.forEach((poly) => {
      const color = poly.color || "#E0E0E0";
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
          fillOpacity: 0.35,
          interactive: true,
        })
          .bindPopup(
            `<div style="font-weight:600;margin-bottom:4px">${poly.label}</div>` +
            `<div style="display:flex;align-items:center;gap:6px;margin-bottom:4px;">` +
            `<span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:${color};border:1px solid rgba(0,0,0,0.2);"></span>` +
            `<span style="font-size:11px;color:#555;">${poly.categoryName}</span></div>` +
            `<div style="font-size:11px;color:#666">${tagLines || "OSM 多边形数据"}</div>`,
            { closeButton: false }
          )
          .addTo(pLayer);

        latLngs.push(latLngRing[0] as L.LatLngTuple);
      });
      seenCategories.set(poly.categoryName, color);
    });

    const legendItems: { color: string; label: string }[] = [];
    categoryColors?.forEach(cc => legendItems.push({ color: cc.color, label: cc.category }));
    seenCategories.forEach((color, name) => {
      legendItems.push({ color, label: name });
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

  return (
    <div ref={containerRef} className={className} style={{ width: "100%", height: "100%" }} />
  );
});

GeoMap.displayName = "GeoMap";
