import * as adk from "admdongkor";
import { mkdir, writeFile } from "node:fs/promises";

const SHORT_SIDO_BY_CODE = {
  11: "서울",
  26: "부산",
  27: "대구",
  28: "인천",
  29: "광주",
  30: "대전",
  31: "울산",
  36: "세종",
  41: "경기",
  51: "강원",
  43: "충북",
  44: "충남",
  52: "전북",
  46: "전남",
  47: "경북",
  48: "경남",
  50: "제주",
};
const WHOLE_SIDO_CODES = new Set(["11", "26", "27", "28", "29", "30", "31", "36"]);
const ORDER = ["11", "26", "27", "28", "29", "30", "31", "36", "41", "51", "43", "44", "52", "46", "47", "48", "50"];

function walkCoords(coords, out = []) {
  if (!Array.isArray(coords)) return out;
  if (typeof coords[0] === "number" && typeof coords[1] === "number") {
    out.push(coords);
    return out;
  }
  for (const child of coords) walkCoords(child, out);
  return out;
}

function centerOf(feature) {
  const points = walkCoords(feature.geometry?.coordinates || []);
  if (!points.length) return { lat: 36.5, lon: 127.8 };
  let minLon = Infinity;
  let maxLon = -Infinity;
  let minLat = Infinity;
  let maxLat = -Infinity;
  for (const [lon, lat] of points) {
    minLon = Math.min(minLon, lon);
    maxLon = Math.max(maxLon, lon);
    minLat = Math.min(minLat, lat);
    maxLat = Math.max(maxLat, lat);
  }
  return {
    lat: Number(((minLat + maxLat) / 2).toFixed(6)),
    lon: Number(((minLon + maxLon) / 2).toFixed(6)),
  };
}

function sortKo(a, b) {
  return String(a.name || "").localeCompare(String(b.name || ""), "ko");
}

const version = adk.versions().at(-1);
const [sidoFc, sggFc, emdFc] = await Promise.all([
  adk.get(version, "sido"),
  adk.get(version, "sgg"),
  adk.get(version, "emd"),
]);

const sidoCenters = new Map();
for (const feature of sidoFc.features) {
  const sidocd = String(feature.properties.sidocd);
  sidoCenters.set(sidocd, centerOf(feature));
}

const provinces = new Map();
for (const feature of sggFc.features) {
  const p = feature.properties;
  const sidocd = String(p.sidocd);
  const shortName = SHORT_SIDO_BY_CODE[sidocd] || p.sidonm;
  if (!provinces.has(sidocd)) {
    provinces.set(sidocd, {
      key: sidocd,
      name: shortName,
      fullName: p.sidonm,
      selectableWhole: WHOLE_SIDO_CODES.has(sidocd),
      center: sidoCenters.get(sidocd) || centerOf(feature),
      districts: [],
    });
  }
  provinces.get(sidocd).districts.push({
    key: String(p.sggcd),
    name: p.sggnm,
    label: `${shortName} ${p.sggnm}`,
    center: centerOf(feature),
    dongs: [],
  });
}

const districtMap = new Map();
for (const province of provinces.values()) {
  for (const district of province.districts) {
    districtMap.set(district.key, district);
  }
}

for (const feature of emdFc.features) {
  const p = feature.properties;
  const district = districtMap.get(String(p.sggcd));
  if (!district) continue;
  district.dongs.push({
    key: String(p.emdcd || p.emd8 || p.emd7),
    name: p.emdnm,
    label: `${district.label} ${p.emdnm}`,
    center: centerOf(feature),
  });
}

for (const province of provinces.values()) {
  province.districts.sort(sortKo);
  for (const district of province.districts) district.dongs.sort(sortKo);
}

const data = {
  version,
  source: "admdongkor npm 0.2.0 / administrative dong light parquet",
  provinces: [...provinces.values()].sort((a, b) => ORDER.indexOf(a.key) - ORDER.indexOf(b.key)),
};

await mkdir("frontend/assets", { recursive: true });
await writeFile("frontend/assets/korea_admin_regions.json", JSON.stringify(data), "utf8");

console.log(
  `${version} provinces=${data.provinces.length} districts=${data.provinces.reduce((sum, p) => sum + p.districts.length, 0)} dongs=${data.provinces.reduce((sum, p) => sum + p.districts.reduce((inner, d) => inner + d.dongs.length, 0), 0)}`,
);
