#!/usr/bin/env node
// Test both Amap geocoding API vs POI search API for landmark queries

const KEY = process.argv[2] || process.env.AMAP_KEY;
if (!KEY) {
  console.error("Usage: node test_amap.js <YOUR_AMAP_KEY>  OR  AMAP_KEY=xxx node test_amap.js");
  process.exit(1);
}

const TEST_CASES = [
  "北京故宫",
  "上海东方明珠",
  "天安门",
  "北京市",
  "北京大学",
];

async function testGeocodeAPI(address) {
  const url = `https://restapi.amap.com/v3/geocode/geo?key=${KEY}&address=${encodeURIComponent(address)}&output=json`;
  const res = await fetch(url);
  const data = await res.json();
  return data;
}

async function testPOISearchAPI(keyword) {
  const url = new URL("https://restapi.amap.com/v3/place/text");
  url.searchParams.set("keywords", keyword);
  url.searchParams.set("key", KEY);
  url.searchParams.set("offset", "5");
  url.searchParams.set("extensions", "all");
  const res = await fetch(url.toString());
  const data = await res.json();
  return data;
}

async function main() {
  console.log("=".repeat(70));
  console.log("AMap API 对比测试: 地理编码API vs POI搜索API");
  console.log("=".repeat(70));

  for (const addr of TEST_CASES) {
    console.log(`\n${"=".repeat(70)}`);
    console.log(`地址: "${addr}"`);
    console.log("=".repeat(70));

    // Test 1: Geocoding API
    try {
      const geo = await testGeocodeAPI(addr);
      console.log(`\n[地理编码 API] status=${geo.status}, count=${geo.count}`);
      if (geo.geocodes?.length) {
        geo.geocodes.forEach((g, i) => {
          console.log(`  结果${i+1}: level=${g.level}, formatted_address="${g.formatted_address}", location=${g.location}, city=${g.city}, district=${g.district || ""}`);
        });
      } else {
        console.log(`  (无结果) info=${geo.info}`);
      }
    } catch(e) {
      console.log(`  [地理编码 API] 异常: ${e.message}`);
    }

    // Test 2: POI Search API
    try {
      const poi = await testPOISearchAPI(addr);
      console.log(`\n[POI搜索 API] status=${poi.status}, count=${poi.count}`);
      if (poi.pois?.length) {
        poi.pois.forEach((p, i) => {
          console.log(`  结果${i+1}: name="${p.name}", location=${p.location}, address="${p.address}", type="${p.type}"`);
        });
      } else {
        console.log(`  (无POI结果)`);
        if (poi.suggestion) {
          console.log(`  建议城市: ${JSON.stringify(poi.suggestion)}`);
        }
      }
    } catch(e) {
      console.log(`  [POI搜索 API] 异常: ${e.message}`);
    }
  }

  console.log("\n" + "=".repeat(70));
  console.log("测试完成");
}

main().catch(console.error);
