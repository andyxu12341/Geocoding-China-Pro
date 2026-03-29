import { useEffect, useRef, forwardRef, useImperativeHandle } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet.chinatmsproviders";

export interface MapMarker {
  lat: number;
  lng: number;
  label: string;
  category?: string;
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
}

export interface GeoMapHandle {
  getMap: () => L.Map | null;
}

const OSM_ATTR = '&copy; <a href="https://openstreetmap.org/copyright">OpenStreetMap</a> contributors';
const SAT_ATTR = "&copy; Esri &middot; Maxar &middot; Earthstar Geographics";
const DARK_ATTR = '&copy; <a href="https://openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/">CARTO</a>';
const TIANDITU_ATTR = '&copy; <a href="https://www.tianditu.gov.cn">天地图</a>';
const GAODE_ATTR = '&copy; <a href="https://www.autonavi.com">高德地图</a>';
const GEOQ_ATTR = '&copy; <a href="https://www.geoq.cn">智图科技</a>';

const DEFAULT_MARKER_COLOR = "#6366f1";

export const GeoMap = forwardRef<GeoMapHandle, GeoMapProps>(({ markers, className, autoFitDisabled, categoryColors }, ref) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);
  const rendererRef = useRef<L.Canvas | null>(null);
  const osmLayerRef = useRef<L.TileLayer | null>(null);
  const darkLayerRef = useRef<L.TileLayer | null>(null);
  const legendRef = useRef<L.Control | null>(null);

  useImperativeHandle(ref, () => ({ getMap: () => mapRef.current }));

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
    layerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);



  // Build color lookup from categoryColors
  const colorMap = new Map<string, string>();
  categoryColors?.forEach(cc => colorMap.set(cc.category, cc.color));

  useEffect(() => {
    const map = mapRef.current;
    const layer = layerRef.current;
    const renderer = rendererRef.current;
    if (!map || !layer || !renderer) return;

    layer.clearLayers();

    // Remove old legend
    if (legendRef.current) {
      map.removeControl(legendRef.current);
      legendRef.current = null;
    }

    if (markers.length === 0) return;

    const latLngs: L.LatLngTuple[] = [];

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
        .addTo(layer);

      cm.on("mouseover", function (this: L.CircleMarker) { this.openPopup(); });
      cm.on("mouseout", function (this: L.CircleMarker) { this.closePopup(); });

      latLngs.push([m.lat, m.lng]);
    });

    // Add legend if categories exist
    if (categoryColors && categoryColors.length > 0) {
      const legend = new L.Control({ position: "bottomright" });
      legend.onAdd = () => {
        const div = L.DomUtil.create("div", "leaflet-legend");
        div.style.cssText = "background:rgba(255,255,255,0.92);backdrop-filter:blur(4px);padding:8px 12px;border-radius:8px;font-size:12px;line-height:20px;box-shadow:0 2px 8px rgba(0,0,0,0.15);max-height:200px;overflow-y:auto;";
        div.innerHTML = categoryColors.map(cc =>
          `<div style="display:flex;align-items:center;gap:6px;"><span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${cc.color};border:1px solid #fff;box-shadow:0 0 2px rgba(0,0,0,0.3);"></span>${cc.category}</div>`
        ).join("");
        return div;
      };
      legend.addTo(map);
      legendRef.current = legend;
    }

    if (!autoFitDisabled) {
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
  }, [markers, autoFitDisabled, categoryColors]);

  return (
    <div ref={containerRef} className={className} style={{ width: "100%", height: "100%" }} />
  );
});

GeoMap.displayName = "GeoMap";
