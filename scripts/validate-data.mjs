import { readFile } from "node:fs/promises";

const payload = JSON.parse(
  await readFile(new URL("../festivals.json", import.meta.url), "utf8")
);
const records = Array.isArray(payload) ? payload : payload?.festivals;

if (!Array.isArray(records) || records.length === 0) {
  throw new Error("festivals.json의 festivals 배열이 비어 있거나 없습니다.");
}
if (!Array.isArray(payload) && Number(payload.count) !== records.length) {
  throw new Error(`count 불일치: ${payload.count} != ${records.length}`);
}
if (!Array.isArray(payload) && !Number.isFinite(Date.parse(payload.updatedAt))) {
  throw new Error(`updatedAt 형식 오류: ${payload.updatedAt}`);
}

const allowedSources = new Set(["tourapi", "culture", "kopis", "culturePortal"]);
const allowedTypes = new Set(["festival", "performance"]);
const activeOnly = process.argv.includes("--active-only");

function isValidIsoDate(value) {
  if (typeof value !== "string" || value.length !== 10 || value[4] !== "-" || value[7] !== "-") return false;
  const date = new Date(value + "T00:00:00.000Z");
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
const todayParts = Object.fromEntries(
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date()).map(({ type, value }) => [type, value])
);
const today = todayParts.year + "-" + todayParts.month + "-" + todayParts.day;
const ids = new Set();
const counts = {};

for (const [index, item] of records.entries()) {
  const row = index + 1;
  if (!item || typeof item !== "object" || Array.isArray(item)) throw new Error(`${row}번째 데이터 형식 오류`);
  const id = String(item.id ?? "").trim();
  if (!id || ids.has(id)) throw new Error(`${row}번째 ID 누락/중복: ${item.id}`);
  ids.add(id);
  if (!String(item.title || "").trim()) throw new Error(`${row}번째 제목 누락`);
  if (!isValidIsoDate(item.startDate)) throw new Error(`${row}번째 시작일이 실제 날짜가 아닙니다: ${item.startDate}`);
  if (item.endDate && !isValidIsoDate(item.endDate)) throw new Error(`${row}번째 종료일이 실제 날짜가 아닙니다: ${item.endDate}`);
  if (item.endDate && item.endDate < item.startDate) throw new Error(`${row}번째 종료일이 시작일보다 빠릅니다: ${item.title}`);
  if (!allowedSources.has(item.source)) throw new Error(`${row}번째 출처 오류: ${item.source}`);
  if (item.type && !allowedTypes.has(item.type)) throw new Error(`${row}번째 행사 유형 오류: ${item.type}`);
  if (activeOnly && !allowedTypes.has(item.type)) throw new Error(`${row}번째 행사 유형 누락: ${item.title}`);
  const lat = item.lat ?? null;
  const lon = item.lon ?? null;
  if ((lat === null) !== (lon === null)) throw new Error(`${row}번째 좌표 한쪽만 누락: ${item.title}`);
  if (lat !== null && (!Number.isFinite(Number(lat)) || !Number.isFinite(Number(lon)) || Number(lat) < -90 || Number(lat) > 90 || Number(lon) < -180 || Number(lon) > 180)) throw new Error(`${row}번째 좌표 범위 오류: ${item.title}`);
  if (activeOnly && String(item.endDate || item.startDate) < today) throw new Error(`${row}번째 종료된 행사 포함: ${item.title} (${item.endDate || item.startDate})`);
  counts[item.source] = (counts[item.source] || 0) + 1;
}

if (activeOnly) {
  for (const source of ["tourapi", "culture", "kopis"]) {
    if (counts[source] < 1) throw new Error(`신규 수집 데이터에 ${source} 항목이 없습니다.`);
    if (payload.sourceStatus?.[source] !== true) throw new Error(`${source} 데이터 수집 상태가 정상(true)이 아닙니다.`);
  }
}

console.log(
  `데이터 검증 통과: ${records.length}건 / ${JSON.stringify(counts)}` +
  (activeOnly ? ` / 기준일 ${today} 이후 종료` : "")
);
if (counts.culturePortal) {
  console.warn(`구버전 문화포털 데이터 ${counts.culturePortal}건은 다음 정상 수집 후 제외됩니다.`);
}
