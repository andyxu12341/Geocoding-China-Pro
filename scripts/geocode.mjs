import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const API_KEY = 'f9857399c2f924b0bd9266746a20ccd9';
const INPUT_FILE = path.resolve(__dirname, '../attached_assets/济南2026企业_1774622827839.csv');
const OUTPUT_FILE = path.resolve(__dirname, '../最终坐标落位.csv');
const CACHE_FILE = path.resolve(__dirname, '../geocode_cache.json');
const DELAY_MS = 120;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function parseCSV(text) {
  const lines = text.split('\n').filter(line => line.trim() !== '');
  const headers = lines[0].replace(/^\uFEFF/, '').split(',');
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',');
    const row = {};
    headers.forEach((h, idx) => {
      row[h.trim()] = (cols[idx] || '').trim();
    });
    rows.push(row);
  }
  return { headers: headers.map(h => h.trim()), rows };
}

async function geocode(companyName, city) {
  const keyword = encodeURIComponent(companyName);
  const cityParam = encodeURIComponent(city || '济南');
  const url = `https://restapi.amap.com/v3/geocode/geo?address=${keyword}&city=${cityParam}&key=${API_KEY}&output=json`;
  
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) {
      return { lng: '', lat: '', note: `HTTP错误: ${res.status}` };
    }
    const data = await res.json();
    if (data.status === '1' && data.geocodes && data.geocodes.length > 0) {
      const location = data.geocodes[0].location;
      if (location) {
        const [lng, lat] = location.split(',');
        return { lng, lat, note: '' };
      }
    }
    return { lng: '', lat: '', note: '未找到坐标' };
  } catch (e) {
    return { lng: '', lat: '', note: `请求失败: ${e.message}` };
  }
}

async function main() {
  const rawText = fs.readFileSync(INPUT_FILE, 'utf-8');
  const { headers, rows } = parseCSV(rawText);

  let cache = {};
  if (fs.existsSync(CACHE_FILE)) {
    try {
      cache = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf-8'));
      console.log(`从缓存加载了 ${Object.keys(cache).length} 条已有结果\n`);
    } catch {}
  }

  const newHeaders = [...headers, '经度', '纬度', '备注'];
  const results = [];

  console.log(`共 ${rows.length} 条企业数据，开始逐条查询（有缓存则跳过API请求）...\n`);

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const companyName = row['企业名称'];
    const city = row['城市'] || '济南';
    const cacheKey = companyName;

    let result;
    if (cache[cacheKey]) {
      result = cache[cacheKey];
    } else {
      result = await geocode(companyName, city);
      cache[cacheKey] = result;
      if (i % 20 === 0) {
        fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2), 'utf-8');
      }
      await sleep(DELAY_MS);
    }

    const { lng, lat, note } = result;
    const newRow = { ...row, '经度': lng, '纬度': lat, '备注': note };
    results.push(newRow);
    const status = lng ? `✓ ${lng}, ${lat}` : `✗ ${note}`;
    console.log(`[${i + 1}/${rows.length}] ${companyName} → ${status}`);
  }

  fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2), 'utf-8');

  const csvLines = [];
  csvLines.push('\uFEFF' + newHeaders.join(','));
  for (const row of results) {
    const cols = newHeaders.map(h => {
      const val = row[h] || '';
      if (val.includes(',') || val.includes('"') || val.includes('\n')) {
        return `"${val.replace(/"/g, '""')}"`;
      }
      return val;
    });
    csvLines.push(cols.join(','));
  }

  fs.writeFileSync(OUTPUT_FILE, csvLines.join('\n'), 'utf-8');

  const successCount = results.filter(r => r['经度'] !== '').length;
  const failCount = results.length - successCount;

  console.log('\n========================================');
  console.log(`处理完成！`);
  console.log(`成功获取坐标: ${successCount} 条`);
  console.log(`未能获取坐标: ${failCount} 条（已在备注中注明）`);
  console.log(`输出文件: ${OUTPUT_FILE}`);
  console.log('========================================');
}

main().catch(err => {
  console.error('脚本运行出错:', err);
  process.exit(1);
});
