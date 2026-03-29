import type { GeocodeItem } from "./geocoding";

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
