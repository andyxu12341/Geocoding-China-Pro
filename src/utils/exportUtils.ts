import type { GeocodeItem, AreaResult } from "./geocoding";

function downloadBlob(content: string, filename: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

const ts = () => new Date().toISOString().slice(0, 19).replace(/[:.]/g, "-");

export function exportCSV(results: GeocodeItem[]) {
  const headers = ["原始地址", "经度", "纬度", "格式化地址", "数据源", "类别", "状态", "错误信息"];
  const rows = results.map(r => [
    r.address, r.lng ?? "", r.lat ?? "",
    r.formattedAddress ?? "", r.source ?? "",
    r.category ?? "",
    r.status === "success" ? "成功" : "失败",
    r.error ?? "",
  ]);
  // Prepend category value if present to ensure alignment
  const body = [headers, ...rows]
    .map(row => row.map(v => `"${String(v).replace(/"/g, '""')}"`).join(","))
    .join("\n");
  downloadBlob("\ufeff" + body, `Geocoding_${ts()}.csv`, "text/csv;charset=utf-8;");
}

export function exportGeoJSON(results: GeocodeItem[]) {
  const features = results
    .filter(r => r.status === "success" && r.lat && r.lng)
    .map(r => ({
      type: "Feature" as const,
      geometry: {
        type: "Point" as const,
        coordinates: [parseFloat(r.lng!), parseFloat(r.lat!)],
      },
      properties: {
        address: r.address,
        formattedAddress: r.formattedAddress ?? null,
        source: r.source ?? null,
        category: r.category ?? null,
      },
    }));

  const geojson = { type: "FeatureCollection" as const, features };
  downloadBlob(
    JSON.stringify(geojson, null, 2),
    `Geocoding_${ts()}.geojson`,
    "application/geo+json",
  );
}

export function exportKML(results: GeocodeItem[]) {
  const placemarks = results
    .filter(r => r.status === "success" && r.lat && r.lng)
    .map(r =>
      `  <Placemark>\n    <name>${escapeXml(r.address)}</name>\n    <description>${escapeXml((r.formattedAddress ?? "") + (r.category ? `\nCategory: ${r.category}` : ""))}</description>\n    <Point><coordinates>${r.lng},${r.lat},0</coordinates></Point>\n  </Placemark>`
    )
    .join("\n");

  const kml = `<?xml version="1.0" encoding="UTF-8"?>\n<kml xmlns="http://www.opengis.net/kml/2.2">\n<Document>\n  <name>Geocoding Results ${ts()}</name>\n${placemarks}\n</Document>\n</kml>`;
  downloadBlob(kml, `Geocoding_${ts()}.kml`, "application/vnd.google-earth.kml+xml");
}

export async function exportMapPNG(mapEl: HTMLElement): Promise<void> {
  const { default: html2canvas } = await import("html2canvas");
  const canvas = await html2canvas(mapEl, {
    useCORS: true,
    allowTaint: false,
    logging: false,
    scale: window.devicePixelRatio || 2,
  });
  canvas.toBlob(blob => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `GeoMap_${ts()}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, "image/png");
}

export function exportPolygonCSV(results: AreaResult[]) {
  const headers = ["名称", "OSM ID", "OSM类型", "类别", "中心纬度", "中心经度", "OSM标签"];
  const rows = results.map(r => [
    r.name || "",
    String(r.osmId),
    r.osmType,
    r.categoryName ?? "",
    r.center?.lat != null ? String(r.center.lat) : "",
    r.center?.lng != null ? String(r.center.lng) : "",
    Object.entries(r.tags ?? {}).map(([k, v]) => `${k}=${v}`).join("; "),
  ]);
  const body = [headers, ...rows]
    .map(row => row.map(v => `"${String(v).replace(/"/g, '""')}"`).join(","))
    .join("\n");
  downloadBlob("\ufeff" + body, `Polygons_${ts()}.csv`, "text/csv;charset=utf-8;");
}

export function exportPolygonGeoJSON(results: AreaResult[]) {
  const features = results
    .filter(r => r.polygon && r.polygon.length > 0)
    .map(r => ({
      type: "Feature" as const,
      geometry: {
        type: "Polygon" as const,
        coordinates: r.polygon,
      },
      properties: {
        name: r.name,
        osm_id: r.osmId,
        osm_type: r.osmType,
        category: r.categoryName ?? "",
        tags: r.tags ?? {},
      },
    }));

  const geojson = { type: "FeatureCollection" as const, features };
  downloadBlob(
    JSON.stringify(geojson, null, 2),
    `Polygons_${ts()}.geojson`,
    "application/geo+json",
  );
}

export function exportPolygonKML(results: AreaResult[]) {
  const hexToAbgr = (hex: string) => {
    const h = hex.replace("#", "");
    return h.slice(6, 8) + h.slice(4, 6) + h.slice(2, 4) + h.slice(0, 2);
  };

  const styles = new Map<string, string>();
  let styleIndex = 0;

  const placemarks = results
    .filter(r => r.polygon && r.polygon.length > 0)
    .map(r => {
      const colorKey = r.categoryName;
      if (!styles.has(colorKey)) {
        styles.set(colorKey, `catStyle_${styleIndex++}`);
      }
      const styleUrl = styles.get(colorKey)!;

      const coords = r.polygon[0]
        .map(c => `${c[0]},${c[1]},0`)
        .join(" ");
      const ring = `<LinearRing><coordinates>${coords}</coordinates></LinearRing>`;
      const tagLines = Object.entries(r.tags ?? {})
        .map(([k, v]) => `<SimpleData name="${escapeXml(k)}">${escapeXml(v)}</SimpleData>`)
        .join("");
      return `  <Placemark>
    <name>${escapeXml(r.name)}</name>
    <description>${escapeXml(r.categoryName)}</description>
    <styleUrl>#${styleUrl}</styleUrl>
    <ExtendedData><SchemaData schemaUrl="#polySchema">${tagLines}</SchemaData></ExtendedData>
    <Polygon><outerBoundaryIs>${ring}</outerBoundaryIs></Polygon>
  </Placemark>`;
    })
    .join("\n");

  const styleBlocks = Array.from(styles.entries())
    .map(([name, id]) => {
      const r2 = results.find(r => r.categoryName === name);
      const abgr = hexToAbgr(r2?.color ?? "#E0E0E0");
      return `<Style id="${id}"><PolyStyle><color>${abgr}</color><fill>1</fill></PolyStyle></Style>`;
    })
    .join("\n");

  const schemaFields = Array.from(styles.keys())
    .flatMap(cat => Object.keys(results.find(r => r.categoryName === cat)?.tags ?? {}))
    .filter((v, i, a) => a.indexOf(v) === i)
    .map(f => `<SimpleField name="${escapeXml(f)}" type="string"></SimpleField>`)
    .join("");

  const kml = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
<Document>
  <name>Polygon Extraction ${ts()}</name>
  <Schema name="polySchema" id="polySchema">${schemaFields}</Schema>
 ${styleBlocks}
 ${placemarks}
 </Document>
</kml>`;
  downloadBlob(kml, `Polygons_${ts()}.kml`, "application/vnd.google-earth.kml+xml");
}
