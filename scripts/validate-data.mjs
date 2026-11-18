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

const allowed = new Set(["tourapi", "culture", "kopis", "culturePortal"]);
const ids = new Set();
const counts = {};

for (const [index, item] of records.entries()) {
  const row = index + 1;
  if (!item || typeof item !== "object") throw new Error(`${row}번째 데이터 형식 오류`);
  if (!item.id || ids.has(String(item.id))) throw new Error(`${row}번째 ID 누락/중복: ${item.id}`);
  ids.add(String(item.id));
  if (!String(item.title || "").trim()) throw new Error(`${row}번째 제목 누락`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(item.startDate || ""))) {
    throw new Error(`${row}번째 시작일 형식 오류: ${item.startDate}`);
  }
  if (item.endDate && !/^\d{4}-\d{2}-\d{2}$/.test(String(item.endDate))) {
    throw new Error(`${row}번째 종료일 형식 오류: ${item.endDate}`);
  }
  if (!allowed.has(item.source)) throw new Error(`${row}번째 출처 오류: ${item.source}`);
  counts[item.source] = (counts[item.source] || 0) + 1;
}

console.log(`데이터 검증 통과: ${records.length}건 / ${JSON.stringify(counts)}`);
if (counts.culturePortal) {
  console.warn(`구버전 문화포털 데이터 ${counts.culturePortal}건은 다음 정상 수집 후 제외됩니다.`);
}
