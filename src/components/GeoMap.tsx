import { useEffect, useRef, forwardRef } from "react";
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
}

const OSM_URL = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
const OSM_ATTR = '&copy; <a href="https://openstreetmap.org/copyright">OpenStreetMap</a> contributors';

const SAT_URL = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
const SAT_ATTR = "&copy; Esri &middot; Maxar &middot; Earthstar Geographics";

const LABELS_URL = "https://{s}.basemaps.cartocdn.com/light_only_labels/{z}/{x}/{y}{r}.png";
const LABELS_ATTR = '&copy; <a href="https://carto.com/">CartoDB</a>';

export const GeoMap = forwardRef<HTMLDivElement, GeoMapProps>(({ markers, className }, ref) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);
  const rendererRef = useRef<L.Canvas | null>(null);
  const rotationRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const hasStoppedRef = useRef(false);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || mapRef.current) return;

    const map = L.map(el, {
      center: [20, 0],
      zoom: 2,
      zoomControl: true,
      attributionControl: true,
    });

    const osmLayer = L.tileLayer(OSM_URL, {
      attribution: OSM_ATTR,
      maxZoom: 19,
      crossOrigin: "anonymous",
    });

    const satLayer = L.tileLayer(SAT_URL, {
      attribution: SAT_ATTR,
      maxZoom: 19,
    });

    const labelsLayer = L.tileLayer(LABELS_URL, {
      attribution: LABELS_ATTR,
      maxZoom: 19,
      crossOrigin: "anonymous",
      pane: "overlayPane",
    });

    osmLayer.addTo(map);

    L.control.layers(
      { "🗺️ 标准地图": osmLayer, "🛰️ 卫星图": satLayer },
      { "🏷️ 标注图层": labelsLayer },
      { position: "topright", collapsed: true }
    ).addTo(map);

    L.control.scale({ imperial: false, position: "bottomleft" }).addTo(map);

    rendererRef.current = L.canvas({ padding: 0.5 });
    layerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;

    rotationRef.current = setInterval(() => {
      if (!hasStoppedRef.current) {
        map.panBy([3, 0], { animate: false });
      }
    }, 60);

    const stopRotation = () => {
      if (rotationRef.current) {
        clearInterval(rotationRef.current);
        rotationRef.current = null;
        hasStoppedRef.current = true;
      }
    };
    map.on("mousedown touchstart dragstart", stopRotation);

    return () => {
      stopRotation();
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

    if (!hasStoppedRef.current) {
      if (rotationRef.current) {
        clearInterval(rotationRef.current);
        rotationRef.current = null;
      }
      hasStoppedRef.current = true;
    }

    const latLngs: L.LatLngTuple[] = [];

    markers.forEach(m => {
      L.circleMarker([m.lat, m.lng], {
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
          `<div style="font-size:12px;color:#666">${m.lat.toFixed(5)}, ${m.lng.toFixed(5)}</div>`
        )
        .addTo(layer);

      latLngs.push([m.lat, m.lng]);
    });

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
  }, [markers]);

  const setRefs = (el: HTMLDivElement | null) => {
    (containerRef as React.MutableRefObject<HTMLDivElement | null>).current = el;
    if (typeof ref === "function") ref(el);
    else if (ref) ref.current = el;
  };

  return (
    <div ref={setRefs} className={className} style={{ width: "100%", height: "100%" }} />
  );
});

GeoMap.displayName = "GeoMap";
