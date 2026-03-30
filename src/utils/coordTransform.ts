const PI = Math.PI;
const X_PI = (PI * 3000.0) / 180.0;

const Krasovsky = {
  a: 6378245.0,
  f: 1 / 298.3,
  b: 6356863.01877,
  ep: 0.00669342162297,
};

const WGS84 = {
  a: 6378137.0,
  f: 1 / 298.257223563,
  b: 6356752.31424,
  ep: 0.00669437999014,
};

function transformLat(x: number, y: number): number {
  let ret = -100.0 + 2.0 * x + 3.0 * y + 0.2 * y * y + 0.1 * x * y + 0.2 * Math.sqrt(Math.abs(x));
  ret += (20.0 * Math.sin(6.0 * x * PI) + 20.0 * Math.sin(2.0 * x * PI)) * 2.0 / 3.0;
  ret += (20.0 * Math.sin(y * PI) + 40.0 * Math.sin(y / 3.0 * PI)) * 2.0 / 3.0;
  ret += (160.0 * Math.sin(y / 12.0 * PI) + 320.0 * Math.sin(y * PI / 30.0)) * 2.0 / 3.0;
  return ret;
}

function transformLon(x: number, y: number): number {
  let ret = 300.0 + x + 2.0 * y + 0.1 * x * x + 0.1 * x * y + 0.1 * Math.sqrt(Math.abs(x));
  ret += (20.0 * Math.sin(6.0 * x * PI) + 20.0 * Math.sin(2.0 * x * PI)) * 2.0 / 3.0;
  ret += (20.0 * Math.sin(x * PI) + 40.0 * Math.sin(x / 3.0 * PI)) * 2.0 / 3.0;
  ret += (150.0 * Math.sin(x / 12.0 * PI) + 300.0 * Math.sin(x / 30.0 * PI)) * 2.0 / 3.0;
  return ret;
}

function outOfChina(lat: number, lon: number): boolean {
  return lon < 72.004 || lon > 137.8347 || lat < 0.8293 || lat > 55.8271;
}

function delta(lat: number, lon: number): { dLat: number; dLon: number } {
  const { a, ep } = Krasovsky;
  const rawLat = transformLat(lon - 105.0, lat - 35.0);
  const rawLon = transformLon(lon - 105.0, lat - 35.0);
  const radLat = (lat * PI) / 180.0;
  const magic = 1 - ep * Math.sin(radLat) * Math.sin(radLat);
  const sqrtMagic = Math.sqrt(magic);
  const dLat = (rawLat * 180.0) / ((a * (1 - ep)) / (magic * sqrtMagic) * PI);
  const dLon = (rawLon * 180.0) / (a / sqrtMagic * Math.cos(radLat) * PI);
  return { dLat, dLon };
}

export function gcj02towgs84(lng: number, lat: number): [number, number] {
  if (outOfChina(lat, lng)) return [lng, lat];
  const { dLat, dLon } = delta(lat, lng);
  return [lng - dLon, lat - dLat];
}

export function wgs84togcj02(lng: number, lat: number): [number, number] {
  if (outOfChina(lat, lng)) return [lng, lat];
  const { dLat, dLon } = delta(lat, lng);
  return [lng + dLon, lat + dLat];
}

export function bd09togcj02(lng: number, lat: number): [number, number] {
  const x = lng - 0.0065;
  const y = lat - 0.006;
  const z = Math.sqrt(x * x + y * y) - 0.00002 * Math.sin(y * X_PI);
  const theta = Math.atan2(y, x) - 0.000003 * Math.cos(x * X_PI);
  return [z * Math.cos(theta), z * Math.sin(theta)];
}

export function bd09towgs84(lng: number, lat: number): [number, number] {
  const [gcj02Lng, gcj02Lat] = bd09togcj02(lng, lat);
  return gcj02towgs84(gcj02Lng, gcj02Lat);
}

export function wgs84tobd09(lng: number, lat: number): [number, number] {
  const [gcj02Lng, gcj02Lat] = wgs84togcj02(lng, lat);
  const x = gcj02Lng;
  const y = gcj02Lat;
  const z = Math.sqrt(x * x + y * y) + 0.00002 * Math.sin(y * X_PI);
  const theta = Math.atan2(y, x) + 0.000003 * Math.cos(x * X_PI);
  return [z * Math.cos(theta) + 0.0065, z * Math.sin(theta) + 0.006];
}

export function gcj02tobd09(lng: number, lat: number): [number, number] {
  const x = lng;
  const y = lat;
  const z = Math.sqrt(x * x + y * y) + 0.00002 * Math.sin(y * X_PI);
  const theta = Math.atan2(y, x) + 0.000003 * Math.cos(x * X_PI);
  return [z * Math.cos(theta) + 0.0065, z * Math.sin(theta) + 0.006];
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
