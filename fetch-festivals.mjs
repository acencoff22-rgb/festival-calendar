/**
 * 전국 축제 + 공연 정보를 세 곳에서 가져와 하나의 JSON으로 합칩니다.
 *  1) 한국관광공사 TourAPI (KorService2 / searchFestival2)       → 지역축제 위주
 *  2) 한국문화정보원 전국문화축제 표준데이터 (공공데이터포털)      → 지역축제 위주
 *  3) 예술경영지원센터 KOPIS 공연예술통합전산망 (공연목록조회)     → 공연/뮤지컬/대중음악/축제 카테고리 포함
 *
 * 실행: node scripts/fetch-festivals.mjs
 * 필요 환경변수:
 *   TOUR_API_KEY    - data.go.kr "한국관광공사_국문 관광정보 서비스_GW" 인증키 (Decoding)
 *   CULTURE_API_KEY - data.go.kr "전국문화축제 표준데이터" 인증키 (Decoding)
 *   KOPIS_API_KEY   - kopis.or.kr에서 발급받은 Open API 서비스키
 *
 * 셋 중 일부만 있어도 동작합니다 (없는 소스는 건너뜀).
 */

import { writeFile } from "fs/promises";

const TOUR_API_KEY = process.env.TOUR_API_KEY || "";
const CULTURE_API_KEY = process.env.CULTURE_API_KEY || "";
const KOPIS_API_KEY = process.env.KOPIS_API_KEY || "";

const TOUR_BASE = "https://apis.data.go.kr/B551011/KorService2";
// 표준데이터 개방 API는 기관별로 URL이 다를 수 있어 실제 신청 후 발급되는
// "요청 URL"을 data.go.kr 마이페이지에서 확인해 아래 값을 맞춰주세요.
const CULTURE_BASE =
  "https://api.odcloud.kr/api/15068380/v1/uddi:3a628ee9-3f60-436d-8f5d-748d99d6c5c9";
const KOPIS_BASE = "https://www.kopis.or.kr/openApi/restful/pblprfr";

// 앞으로 몇 개월치 공연을 가져올지 (KOPIS는 날짜 범위 지정이 필수)
const KOPIS_MONTHS_AHEAD = 3;

// TourAPI areacode → 짧은 지역명. KOPIS가 돌려주는 지역명과 표기를 통일하기 위해 사용합니다.
const AREA_NAME_BY_CODE = {
  1: "서울", 2: "인천", 3: "대전", 4: "대구", 5: "광주",
  6: "부산", 7: "울산", 8: "세종", 31: "경기", 32: "강원",
  33: "충북", 34: "충남", 35: "경북", 36: "경남", 37: "전북",
  38: "전남", 39: "제주",
};

// "서울특별시", "경기도" 같은 표기를 위 짧은 지역명으로 통일합니다.
function normalizeAreaName(raw) {
  if (!raw) return null;
  const suffixes = ["특별자치시", "특별자치도", "광역시", "특별시", "자치도", "도"];
  let name = raw.trim();
  for (const s of suffixes) {
    if (name.endsWith(s)) {
      name = name.slice(0, -s.length);
      break;
    }
  }
  return name || raw;
}

function todayYYYYMMDD() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}${mm}${dd}`;
}

function ymdToIso(ymd) {
  if (!ymd || ymd.length !== 8) return null;
  return `${ymd.slice(0, 4)}-${ymd.slice(4, 6)}-${ymd.slice(6, 8)}`;
}

// --- 지역축제 세부 분류 (공식 분류가 없어 제목 키워드로 추정합니다. 100% 정확하진 않아요) ---
const FESTIVAL_SUBCATEGORY_RULES = [
  { name: "먹거리", keywords: ["푸드", "음식", "맛", "미식", "먹거리", "요리", "맥주", "와인", "커피", "빵"] },
  { name: "체험", keywords: ["체험", "캠프", "워크숍", "만들기"] },
  { name: "전시·예술", keywords: ["전시", "아트", "미술", "조형", "갤러리"] },
  { name: "빛·경관", keywords: ["불꽃", "빛", "라이트", "조명", "야경"] },
  { name: "전통·문화", keywords: ["전통", "민속", "문화재", "역사"] },
];
function classifyFestival(title) {
  for (const rule of FESTIVAL_SUBCATEGORY_RULES) {
    if (rule.keywords.some((k) => title?.includes(k))) return rule.name;
  }
  return "일반축제";
}

// --- 공연 세부 분류: KOPIS 장르를 그대로 활용, 대중음악만 콘서트/페스티벌로 한 번 더 나눔 ---
function classifyPerformance(genre, title) {
  if (genre === "뮤지컬") return "뮤지컬";
  if (genre === "복합") return "복합공연";
  if (genre === "대중음악") {
    const isFestival = /페스티벌|페스타|fest/i.test(title || "");
    return isFestival ? "페스티벌" : "콘서트";
  }
  return genre || "공연";
}


async function fetchTourApiFestivals() {
  if (!TOUR_API_KEY) {
    console.log("TOUR_API_KEY 없음 → TourAPI 건너뜀");
    return [];
  }

  const results = [];
  let pageNo = 1;
  const numOfRows = 100;

  while (true) {
    const url = new URL(`${TOUR_BASE}/searchFestival2`);
    url.searchParams.set("serviceKey", TOUR_API_KEY);
    url.searchParams.set("MobileOS", "ETC");
    url.searchParams.set("MobileApp", "FestivalCalendar");
    url.searchParams.set("_type", "json");
    url.searchParams.set("arrange", "A"); // 제목순 (원하면 C: 수정일순 등으로 변경)
    url.searchParams.set("eventStartDate", todayYYYYMMDD());
    url.searchParams.set("numOfRows", String(numOfRows));
    url.searchParams.set("pageNo", String(pageNo));

    const res = await fetch(url);
    if (!res.ok) {
      console.error("TourAPI 요청 실패:", res.status, await res.text());
      break;
    }
    const json = await res.json();
    const body = json?.response?.body;
    if (!body) {
      console.error("TourAPI 응답 형식 이상:", JSON.stringify(json).slice(0, 500));
      break;
    }

    const items = body.items?.item;
    const list = Array.isArray(items) ? items : items ? [items] : [];

    for (const it of list) {
      const start = ymdToIso(it.eventstartdate);
      const end = ymdToIso(it.eventenddate);

      // "숭례문 파수의식"처럼 연중 상시 진행되는 행사는 진짜 축제라기보다
      // 상설 프로그램에 가까워서 달력을 뒤덮어버려요. 90일 넘으면 제외합니다.
      if (start && end) {
        const days = (new Date(end) - new Date(start)) / 86400000;
        if (days > 90) continue;
      }

      results.push({
        source: "tourapi",
        type: "festival",
        subcategory: classifyFestival(it.title),
        id: `tour-${it.contentid}`,
        title: it.title,
        startDate: start,
        endDate: end,
        location: it.addr1 || it.eventplace || "",
        area: AREA_NAME_BY_CODE[it.areacode] || null,
        thumbnail: it.firstimage || null,
        detailUrl: null, // 관광공사 사이트 개편으로 contentid 기반 링크가 더 이상 유효하지 않아 제거. 화면에서 검색 링크로 대체됨.
      });
    }

    const totalCount = Number(body.totalCount || 0);
    if (pageNo * numOfRows >= totalCount || list.length === 0) break;
    pageNo += 1;
  }

  console.log(`TourAPI에서 ${results.length}건 수집`);
  return results;
}

function addMonths(date, months) {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
}

function dateToYYYYMMDD(date) {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}${mm}${dd}`;
}

function kopisDateToIso(ymd) {
  // KOPIS는 "YYYY.MM.DD" 형식을 씁니다.
  if (!ymd) return null;
  const m = ymd.match(/(\d{4})\.(\d{2})\.(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

/** KOPIS는 XML만 응답합니다. 태그 구조가 단순해서 정규식으로 가볍게 파싱합니다. */
function parseKopisXml(xml) {
  const items = [];
  const dbBlocks = xml.match(/<db>[\s\S]*?<\/db>/g) || [];
  for (const block of dbBlocks) {
    const field = (tag) => {
      const m = block.match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`));
      return m ? m[1].replace(/<!\[CDATA\[|\]\]>/g, "").trim() : "";
    };
    items.push({
      mt20id: field("mt20id"),
      prfnm: field("prfnm"),
      prfpdfrom: field("prfpdfrom"),
      prfpdto: field("prfpdto"),
      fcltynm: field("fcltynm"),
      poster: field("poster"),
      genrenm: field("genrenm"),
      area: field("area"),
    });
  }
  return items;
}

// 소규모 공연이 너무 많이 잡히는 장르는 기본 제외합니다.
// "연극"은 대학로 소극장 공연이, "서양음악(클래식)"/"한국음악(국악)"은
// 개인 리사이틀·학생 정기연주회가 압도적으로 많아 목록을 뒤덮어버려요.
// 더 빼고 싶은 장르가 있으면 이 배열에 추가하세요. (예: "무용", "서커스/마술")
const EXCLUDED_KOPIS_GENRES = [
  "연극",
  "서양음악(클래식)",
  "한국음악(국악)",
  "서커스/마술",
  "무용(서양/한국무용)",
  "대중무용",
];

// 장르와 무관하게, 제목에 이런 단어가 들어간 공연은 대부분
// 개인/학생 발표 성격이라 함께 제외합니다.
const EXCLUDED_TITLE_KEYWORDS = [
  "리사이틀", "독주회", "정기연주회", "발표회", "합창제", "콩쿠르", "콩쿨", "워크숍", "졸업연주",
];

/** 3) KOPIS 공연목록조회 (뮤지컬/대중음악/축제 등 카테고리 포함) */
async function fetchKopisPerformances() {
  if (!KOPIS_API_KEY) {
    console.log("KOPIS_API_KEY 없음 → KOPIS 건너뜀");
    return [];
  }

  const results = [];
  let cpage = 1;
  const rows = 100;
  const stdate = dateToYYYYMMDD(new Date());
  const eddate = dateToYYYYMMDD(addMonths(new Date(), KOPIS_MONTHS_AHEAD));

  while (true) {
    const url = new URL(KOPIS_BASE);
    url.searchParams.set("service", KOPIS_API_KEY);
    url.searchParams.set("stdate", stdate);
    url.searchParams.set("eddate", eddate);
    url.searchParams.set("cpage", String(cpage));
    url.searchParams.set("rows", String(rows));
    // 장르 코드로 좁히고 싶다면 &shcate=CCCD(대중음악) 등을 추가하세요.
    // 정확한 코드표는 https://www.kopis.or.kr/por/cs/openapi/openApiInfo.do 참고

    const res = await fetch(url);
    if (!res.ok) {
      console.error("KOPIS 요청 실패:", res.status, await res.text());
      break;
    }
    const xml = await res.text();
    if (xml.includes("SERVICE KEY IS NOT REGISTERED") || xml.includes("<error>")) {
      console.error("KOPIS 응답 오류:", xml.slice(0, 300));
      break;
    }

    const list = parseKopisXml(xml);
    for (const it of list) {
      if (EXCLUDED_KOPIS_GENRES.some((g) => it.genrenm?.includes(g))) continue;
      if (EXCLUDED_TITLE_KEYWORDS.some((k) => it.prfnm?.includes(k))) continue;

      const start = kopisDateToIso(it.prfpdfrom);
      const end = kopisDateToIso(it.prfpdto);

      // 대학로 오픈런처럼 몇 년씩 도는 상시공연은 "임박 알림" 성격에 안 맞아서 제외
      if (start && end) {
        const days = (new Date(end) - new Date(start)) / 86400000;
        if (days > 90) continue;
      }

      results.push({
        source: "kopis",
        type: it.genrenm?.includes("축제") ? "festival" : "performance",
        subcategory: it.genrenm?.includes("축제")
          ? "음악페스티벌"
          : classifyPerformance(it.genrenm, it.prfnm),
        id: `kopis-${it.mt20id}`,
        title: it.prfnm,
        startDate: start,
        endDate: end,
        location: it.fcltynm || "",
        area: normalizeAreaName(it.area),
        thumbnail: it.poster || null,
        detailUrl: `https://www.kopis.or.kr/por/db/pblprfr/pblprfrView.do?mt20Id=${it.mt20id}`,
        genre: it.genrenm || null,
      });
    }

    if (list.length < rows) break;
    cpage += 1;
  }

  console.log(`KOPIS에서 ${results.length}건 수집`);
  return results;
}

/** 2) 문화축제 표준데이터 가져오기 (odcloud 형식 - 실제 응답 구조는 발급 후 확인 필요) */
async function fetchCultureStandardFestivals() {
  if (!CULTURE_API_KEY) {
    console.log("CULTURE_API_KEY 없음 → 표준데이터 건너뜀");
    return [];
  }

  const results = [];
  let page = 1;
  const perPage = 100;

  while (true) {
    const url = new URL(CULTURE_BASE);
    url.searchParams.set("page", String(page));
    url.searchParams.set("perPage", String(perPage));
    url.searchParams.set("serviceKey", CULTURE_API_KEY);

    const res = await fetch(url);
    if (!res.ok) {
      console.error("문화축제 표준데이터 요청 실패:", res.status, await res.text());
      break;
    }
    const json = await res.json();
    const rows = json?.data || [];

    for (const row of rows) {
      // 실제 필드명은 Swagger에서 확인 후 아래 매핑을 맞춰주세요.
      const start = row["축제시작일자"] || null;
      const end = row["축제종료일자"] || null;
      if (start && end) {
        const days = (new Date(end) - new Date(start)) / 86400000;
        if (days > 90) continue;
      }

      results.push({
        source: "culture",
        type: "festival",
        subcategory: classifyFestival(row["축제명"]),
        id: `culture-${row["축제명"]}-${start}`,
        title: row["축제명"],
        startDate: start,
        endDate: end,
        location: row["개최장소"] || row["소재지도로명주소"] || "",
        area: null,
        thumbnail: null,
        detailUrl: null,
      });
    }

    if (rows.length < perPage) break;
    page += 1;
  }

  console.log(`문화축제 표준데이터에서 ${results.length}건 수집`);
  return results;
}

function dedupe(list) {
  const seen = new Map();
  for (const item of list) {
    // 제목 + 시작일이 같으면 같은 축제로 간주 (TourAPI 우선)
    const key = `${(item.title || "").trim()}__${item.startDate || ""}`;
    if (!seen.has(key) || seen.get(key).source !== "tourapi") {
      seen.set(key, item);
    }
  }
  return [...seen.values()];
}

async function main() {
  const [tourItems, cultureItems, kopisItems] = await Promise.all([
    fetchTourApiFestivals(),
    fetchCultureStandardFestivals(),
    fetchKopisPerformances(),
  ]);

  let merged = dedupe([...tourItems, ...cultureItems, ...kopisItems]);

  // 시작일 없는 항목 제거, 날짜순 정렬
  merged = merged
    .filter((f) => f.startDate)
    .sort((a, b) => a.startDate.localeCompare(b.startDate));

  const payload = {
    updatedAt: new Date().toISOString(),
    count: merged.length,
    festivals: merged,
  };

  await writeFile("festivals.json", JSON.stringify(payload, null, 2), "utf-8");
  console.log(`총 ${merged.length}건 저장 완료 → festivals.json`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
