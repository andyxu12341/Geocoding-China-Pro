import gcoord from "gcoord";

export function gcj02towgs84(lng: number, lat: number): [number, number] {
  const [wgsLng, wgsLat] = gcoord.GCJ02ToWGS84([lng, lat]);
  return [wgsLng, wgsLat];
}

export function wgs84togcj02(lng: number, lat: number): [number, number] {
  const [gcjLng, gcjLat] = gcoord.WGS84ToGCJ02([lng, lat]);
  return [gcjLng, gcjLat];
}

export function bd09togcj02(lng: number, lat: number): [number, number] {
  const [gcjLng, gcjLat] = gcoord.BD09ToGCJ02([lng, lat]);
  return [gcjLng, gcjLat];
}

export function bd09towgs84(lng: number, lat: number): [number, number] {
  const [gcjLng, gcjLat] = gcoord.BD09ToGCJ02([lng, lat]);
  const [wgsLng, wgsLat] = gcoord.GCJ02ToWGS84([gcjLng, gcjLat]);
  return [wgsLng, wgsLat];
}

export function wgs84tobd09(lng: number, lat: number): [number, number] {
  const [gcjLng, gcjLat] = gcoord.WGS84ToGCJ02([lng, lat]);
  const [bdLng, bdLat] = gcoord.GCJ02ToBD09([gcjLng, gcjLat]);
  return [bdLng, bdLat];
}

export function gcj02tobd09(lng: number, lat: number): [number, number] {
  const [bdLng, bdLat] = gcoord.GCJ02ToBD09([lng, lat]);
  return [bdLng, bdLat];
}

export function transformBbox(
  bbox: [number, number, number, number],
  transformFn: (lng: number, lat: number) => [number, number]
): [number, number, number, number] {
  const [south, west, north, east] = bbox;
  const sw = transformFn(west, south);
  const ne = transformFn(east, north);
  return [sw[1], sw[0], ne[1], ne[0]];
}
