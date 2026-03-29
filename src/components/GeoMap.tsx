import { useEffect, useRef, forwardRef, useImperativeHandle } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

export interface MapMarker {
  lat: number;
  lng: number;
  label: string;
}

interface GeoMapProps {
  markers: MapMarker[];
  className?: string;
  autoFitDisabled?: boolean;
  darkMode?: boolean;
}

export interface GeoMapHandle {
  getMap: () => L.Map | null;
}

const OSM_URL = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
const OSM_ATTR = '&copy; <a href="https://openstreetmap.org/copyright">OpenStreetMap</a> contributors';

const SAT_URL = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
const SAT_ATTR = "&copy; Esri &middot; Maxar &middot; Earthstar Geographics";

const DARK_URL = "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png";
const DARK_ATTR = '&copy; <a href="https://openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/">CARTO</a>';

export const GeoMap = forwardRef<GeoMapHandle, GeoMapProps>(({ markers, className, autoFitDisabled, darkMode }, ref) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);
  const rendererRef = useRef<L.Canvas | null>(null);

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

    const osmLayer = L.tileLayer(OSM_URL, { attribution: OSM_ATTR, maxZoom: 19, crossOrigin: "anonymous" });
    const satLayer = L.tileLayer(SAT_URL, { attribution: SAT_ATTR, maxZoom: 19 });

    osmLayer.addTo(map);

    L.control.layers(
      { "🗺️ 标准地图": osmLayer, "🛰️ 卫星图": satLayer },
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

  useEffect(() => {
    const map = mapRef.current;
    const layer = layerRef.current;
    const renderer = rendererRef.current;
    if (!map || !layer || !renderer) return;

    layer.clearLayers();
    if (markers.length === 0) return;

    const latLngs: L.LatLngTuple[] = [];

    markers.forEach(m => {
      const cm = L.circleMarker([m.lat, m.lng], {
        renderer,
        radius: 5,
        fillColor: "#6366f1",
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
  }, [markers, autoFitDisabled]);

  return (
    <div ref={containerRef} className={className} style={{ width: "100%", height: "100%" }} />
  );
});

GeoMap.displayName = "GeoMap";
