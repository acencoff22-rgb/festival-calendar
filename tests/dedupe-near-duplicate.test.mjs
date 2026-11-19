import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const source = (await readFile(
  new URL("../fetch-festivals.mjs", import.meta.url),
  "utf8"
)).replace(/\r\n/g, "\n");

function sliceBetween(
  startMarker,
  endMarker
) {
  const start = source.indexOf(startMarker);

  if (start < 0) {
    throw new Error(`Missing start marker: ${startMarker}`);
  }

  const end = source.indexOf(
    endMarker,
    start + startMarker.length
  );

  if (end < 0) {
    throw new Error(`Missing end marker: ${endMarker}`);
  }

  return source.slice(start, end);
}

const helpers = [
  sliceBetween(
    "function normalizeTitle(title)",
    "// ======================================================\n// 일반 텍스트 정규화"
  ),
  sliceBetween(
    "const CANONICAL_AREA_MAP =",
    "// sido/sigungu 필드가 비어있는 원본 데이터를 위한 보조 수단."
  ),
  sliceBetween(
    "function hasValidCoordinatePair(",
    "function sourcePriority("
  ),
  sliceBetween(
    "function sourcePriority(",
    "function mergeRecords("
  ),
  sliceBetween(
    "function mergeRecords(",
    "// ======================================================\n// 좌표 간 거리"
  ),
  sliceBetween(
    "function distanceMeters(",
    "// ======================================================\n// 2차 중복 후보 탐지"
  ),
  sliceBetween(
    "function calendarDayDifference(",
    "// ======================================================\n// 중복 제거"
  ),
].join("\n\n");

const context = vm.createContext({ URL });

vm.runInContext(
  helpers +
    "\nglobalThis.__mergeNearDuplicateFestivals = mergeNearDuplicateFestivals;" +
    "\nglobalThis.__isNearDuplicateFestival = isNearDuplicateFestival;" +
    "\nglobalThis.__dataRichness = dataRichness;",
  context
);

const mergeNearDuplicates =
  context.__mergeNearDuplicateFestivals;

function festival(overrides = {}) {
  return {
    source: "culture",
    type: "festival",
    id: "festival-1",
    title: "검증 축제",
    startDate: "2026-06-01",
    endDate: "2026-06-03",
    area: "경북",
    location: "축제장",
    lat: 36.0,
    lon: 128.0,
    detailUrl: "https://example.com",
    ...overrides,
  };
}

test(
  "포항국제불빛축제는 우선 출처(TourAPI)의 공식 날짜를 유지한다",
  () => {
    const tourApi = festival({
      source: "tourapi",
      id: "tour-588175",
      title: "포항국제불빛축제",
      startDate: "2026-11-19",
      endDate: "2026-11-21",
      location: "경상북도 포항시 북구 해안로 48",
      lat: 36.0530051077,
      lon: 129.3775942753,
      detailUrl: null,
    });

    const culture = festival({
      source: "culture",
      id: "culture-pohang",
      title: "포항국제불빛축제",
      startDate: "2026-11-20",
      endDate: "2026-11-22",
      location: "영일대해수욕장 (또는) 형산강체육공원",
      lat: 36.05729023,
      lon: 129.378069,
      detailUrl: "http://www.phcf.or.kr",
    });

    const result =
      mergeNearDuplicates([
        tourApi,
        culture,
      ]);

    assert.equal(result.records.length, 1);
    assert.equal(result.mergedCount, 1);
    assert.equal(result.records[0].source, "tourapi");
    assert.equal(result.records[0].startDate, "2026-11-19");
    assert.equal(result.records[0].endDate, "2026-11-21");
    assert.equal(result.records[0].detailUrl, "http://www.phcf.or.kr");
  }
);

test(
  "안동국제탈춤페스티벌은 더 구체적인 공식 상세 페이지의 날짜를 유지한다",
  () => {
    const lessSpecific = festival({
      id: "andong-generic",
      title: "안동국제탈춤페스티벌",
      startDate: "2026-09-25",
      endDate: "2026-10-04",
      location: "중앙선1942안동역+탈춤공원+원도심 일원+하회마을 외",
      lat: 36.5627376,
      lon: 128.732934,
      detailUrl: "www.maskdance.com",
    });

    const officialDetail = festival({
      id: "andong-detail",
      title: "안동국제탈춤페스티벌",
      startDate: "2026-09-24",
      endDate: "2026-10-04",
      location: "중앙선1942 안동역+탈춤공원+원도심 일원",
      lat: 36.5605065,
      lon: 128.730633,
      detailUrl: "https://www.maskdance.com/2024/intro.asp",
    });

    assert.ok(
      context.__dataRichness(officialDetail) >
        context.__dataRichness(lessSpecific)
    );

    const result =
      mergeNearDuplicates([
        lessSpecific,
        officialDetail,
      ]);

    assert.equal(result.records.length, 1);
    assert.equal(result.mergedCount, 1);
    assert.equal(result.records[0].id, "andong-detail");
    assert.equal(result.records[0].startDate, "2026-09-24");
    assert.equal(result.records[0].endDate, "2026-10-04");
  }
);

test(
  "함평나비대축제는 행사별 상세 페이지의 종료일과 보조 지역을 유지한다",
  () => {
    const generic = festival({
      id: "hampyeong-home",
      title: "함평 나비대축제",
      startDate: "2026-04-24",
      endDate: "2026-05-04",
      area: "광주특별시",
      location: "함평엑스포공원",
      lat: 35.05813923,
      lon: 126.5226056,
      detailUrl: "https://www.hpftf.or.kr",
    });

    const detailed = festival({
      id: "hampyeong-detail",
      title: "함평나비대축제",
      startDate: "2026-04-24",
      endDate: "2026-05-05",
      area: null,
      location: "함평 엑스포공원 일원",
      lat: 35.05813923,
      lon: 126.5226056,
      detailUrl: "https://www.hpftf.or.kr/contentsView.do?pageId=www142",
    });

    const result =
      mergeNearDuplicates([
        generic,
        detailed,
      ]);

    assert.equal(result.records.length, 1);
    assert.equal(result.mergedCount, 1);
    assert.equal(result.records[0].id, "hampyeong-detail");
    assert.equal(result.records[0].startDate, "2026-04-24");
    assert.equal(result.records[0].endDate, "2026-05-05");
    assert.equal(result.records[0].area, "광주특별시");
    assert.equal(
      result.records[0].detailUrl,
      "https://www.hpftf.or.kr/contentsView.do?pageId=www142"
    );
  }
);

test(
  "서로 다른 공연·장소·기간·좌표 정보는 자동 병합하지 않는다",
  () => {
    const base = festival({
      id: "same-event",
      title: "중복 후보",
      startDate: "2026-07-01",
      endDate: "2026-07-10",
      lat: 36.0,
      lon: 128.0,
    });

    const differentType = festival({
      id: "performance",
      title: "중복 후보",
      type: "performance",
      startDate: "2026-07-02",
      endDate: "2026-07-10",
      lat: 36.0001,
      lon: 128.0001,
    });

    const distantVenue = festival({
      id: "distant",
      title: "중복 후보",
      startDate: "2026-07-02",
      endDate: "2026-07-10",
      lat: 36.008,
      lon: 128.0,
    });

    const dateDrift = festival({
      id: "date-drift",
      title: "중복 후보",
      startDate: "2026-07-03",
      endDate: "2026-07-10",
      lat: 36.0001,
      lon: 128.0001,
    });

    const differentArea = festival({
      id: "different-area",
      title: "중복 후보",
      startDate: "2026-07-02",
      endDate: "2026-07-10",
      area: "서울",
      lat: 36.0001,
      lon: 128.0001,
    });

    const result =
      mergeNearDuplicates([
        base,
        differentType,
        distantVenue,
        dateDrift,
        differentArea,
      ]);

    assert.equal(result.records.length, 5);
    assert.equal(result.mergedCount, 0);
  }
);
