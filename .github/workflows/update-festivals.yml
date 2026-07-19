/**
 * 전국 축제 + 공연 정보를 세 곳에서 가져와 하나의 JSON으로 합칩니다.
 *  1) 한국관광공사 TourAPI (KorService2 / searchFestival2)       → 지역축제 위주
 *  2) 한국문화정보원 전국문화축제 표준데이터 (공공데이터포털)      → 지역축제 위주
 *  3) 예술경영지원센터 KOPIS 공연예술통합전산망 (공연목록조회)     → 공연/뮤지컬/대중음악/축제 카테고리 포함
 *  4) 네이버 블로그 검색 (총 검색결과 수)                        → 인기도(언급량) 추정, 상위 항목에 🔥 배지
 *
 * 실행: node scripts/fetch-festivals.mjs
 * 필요 환경변수:
 *   TOUR_API_KEY      - data.go.kr "한국관광공사_국문 관광정보 서비스_GW" 인증키 (Decoding)
 *   CULTURE_API_KEY   - data.go.kr "전국문화축제 표준데이터" 인증키 (Decoding)
 *   KOPIS_API_KEY     - kopis.or.kr에서 발급받은 Open API 서비스키
 *   NAVER_CLIENT_ID   - developers.naver.com에서 발급받은 애플리케이션 Client ID
 *   NAVER_CLIENT_SECRET - 위와 짝을 이루는 Client Secret
 *
 * 넷 중 일부만 있어도 동작합니다 (없는 소스는 건너뜀).
 */

import { writeFile } from "fs/promises";

const TOUR_API_KEY = process.env.TOUR_API_KEY || "";
const CULTURE_API_KEY = process.env.CULTURE_API_KEY || "";
const KOPIS_API_KEY = process.env.KOPIS_API_KEY || "";
const NAVER_CLIENT_ID = process.env.NAVER_CLIENT_ID || "";
const NAVER_CLIENT_SECRET = process.env.NAVER_CLIENT_SECRET || "";

// 각 소스가 이번 실행에서 정상적으로 갱신됐는지 기록 (키가 없어서 건너뛴 건 실패로 안 침)
const sourceStatus = { tourapi: true, culture: true, kopis: true, mentions: true };

const TOUR_BASE = "https://apis.data.go.kr/B551011/KorService2";
// 표준데이터 개방 API는 기관별로 URL이 다를 수 있어 실제 신청 후 발급되는
// "요청 URL"을 data.go.kr 마이페이지에서 확인해 아래 값을 맞춰주세요.
const CULTURE_BASE =
  "https://api.odcloud.kr/api/15068380/v1/uddi:3a628ee9-3f60-436d-8f5d-748d99d6c5c9";
const KOPIS_BASE = "https://www.kopis.or.kr/openApi/restful/pblprfr";
const NAVER_SEARCH_BASE = "https://openapi.naver.com/v1/search/blog.json";

// 앞으로 몇 개월치 공연을 가져올지 (KOPIS는 날짜 범위 지정이 필수)
const KOPIS_MONTHS_AHEAD = 3;

// TourAPI areacode → 짧은 지역명. KOPIS가 돌려주는 지역명과 표기를 통일하기 위해 사용합니다.
const AREA_NAME_BY_CODE = {
  1: "서울", 2: "인천", 3: "대전", 4: "대구", 5: "광주",
  6: "부산", 7: "울산", 8: "세종", 31: "경기", 32: "강원",
  33: "충북", 34: "충남", 35: "경북", 36: "경남", 37: "전북",
  38: "전남", 39: "제주",
};

// 도시/공연장 태그, 괄호 부가설명을 떼어내서 같은 축제/공연이 여러 지역에 있어도
// 하나의 검색어로 합쳐지도록 정리합니다. (예: "라이온킹 [부산]" → "라이온킹")
function cleanTitleForMention(title) {
  return (title || "")
    .replace(/\[[^\]]*\]/g, "")
    .replace(/\([^)]*\)/g, "")
    .trim();
}

/** 네이버 블로그 검색의 "총 검색결과 수"를 인기도(언급량) 추정치로 사용 */
async function fetchMentionCount(query) {
  const url = new URL(NAVER_SEARCH_BASE);
  url.searchParams.set("query", query);
  url.searchParams.set("display", "1");

  const res = await fetch(url, {
    headers: {
      "X-Naver-Client-Id": NAVER_CLIENT_ID,
      "X-Naver-Client-Secret": NAVER_CLIENT_SECRET,
    },
  });
  if (!res.ok) {
    console.error("네이버 검색 API 요청 실패:", res.status, await res.text());
    sourceStatus.mentions = false;
    return null;
  }
  const json = await res.json();
  return typeof json.total === "number" ? json.total : null;
}

/** 제목이 같은(정리 후 기준) 항목끼리 검색을 한 번만 호출해 언급량을 붙입니다 */
async function attachMentionCounts(festivals) {
  if (!NAVER_CLIENT_ID || !NAVER_CLIENT_SECRET) {
    console.log("NAVER_CLIENT_ID/NAVER_CLIENT_SECRET 없음 → 인기도 배지 건너뜀");
    return;
  }

  const queries = [...new Set(festivals.map((f) => cleanTitleForMention(f.title)).filter(Boolean))];
  console.log(`인기도(언급량) 조회 대상: ${queries.length}건`);

  const counts = new Map();
  for (const q of queries) {
    const total = await fetchMentionCount(q);
    counts.set(q, total);
    // 네이버 검색 API에 너무 몰아치지 않도록 살짝 텀을 둡니다.
    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  for (const f of festivals) {
    const total = counts.get(cleanTitleForMention(f.title));
    if (typeof total === "number") f.mentions = total;
  }
}


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
      sourceStatus.tourapi = false;
      break;
    }
    const json = await res.json();
    const body = json?.response?.body;
    if (!body) {
      console.error("TourAPI 응답 형식 이상:", JSON.stringify(json).slice(0, 500));
      sourceStatus.tourapi = false;
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
        id: `tour-${it.contentid}`,
        title: it.title,
        startDate: start,
        endDate: end,
        location: it.addr1 || it.eventplace || "",
        area: AREA_NAME_BY_CODE[it.areacode] || null,
        lat: it.mapy ? Number(it.mapy) : null,
        lon: it.mapx ? Number(it.mapx) : null,
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
  // 어린이 뮤지컬/공연 (관람연령 정보는 상세조회 API에만 있어서, 제목 키워드로 대신 걸러냅니다)
  "어린이", "아동", "유아", "키즈", "가족뮤지컬", "인형극",
  "뽀로로", "핑크퐁", "타요", "코코몽", "베이비샤크", "캐치! 티니핑", "브레드이발소", "슈퍼윙스",
  // 성인 뮤지컬은 동화 제목을 잘 안 써서, 동화/전래동화 제목도 어린이 뮤지컬 신호로 같이 걸러냅니다.
  "신데렐라", "백설공주", "인어공주", "라푼젤", "헨젤과그레텔", "헨젤과 그레텔",
  "콩쥐팥쥐", "흥부와놀부", "흥부와 놀부", "심청전", "피노키오", "미녀와야수", "미녀와 야수",
  "피터팬", "이상한나라의앨리스", "이상한 나라의 앨리스", "오즈의마법사", "오즈의 마법사",
  "빨간모자", "아기돼지삼형제", "아기 돼지 삼형제", "브레멘음악대", "브레멘 음악대",
  "성냥팔이소녀", "성냥팔이 소녀", "개미와베짱이", "개미와 베짱이", "토끼와거북이", "토끼와 거북이",
  "여우와두루미", "나무꾼과선녀", "나무꾼과 선녀", "황금거위", "아기양", "잠자는숲속의공주", "잠자는 숲속의 공주",
];

// 뮤지컬은 "이 목록에 있는 공연장만" 남기는 화이트리스트 방식으로 바꿨습니다.
// (예전엔 소규모만 걸러내는 블랙리스트였는데, 그래도 너무 많이 남아서 반대로
// 전환) 아래 목록에 없으면 전부 제외됩니다. 이름은 공연장 표기가 조금씩
// 달라도(부제/구명 병기 등) 잡히도록 핵심 단어만 포함시켰어요.
const VENUE_WHITELIST = [
  // --- 지하철역 빠른길 목록 (2020년 업데이트분 포함) ---
  "정동극장", "디큐브아트센터", "두산연강홀", // 종로5가 = 홍대 대학로아트센터 (아래 목록에 포함)
  "충무아트센터", "상상마당", // 삼성역
  "우란문화재단", "우란2경",
  "LG아트센터", "명동예술극장", "신도림", // 디큐브 중복표기 대비
  "을지로입구", // 명동예술극장 위치 참고용, 실제 필터는 이름 매칭이라 무해
  "샤롯데씨어터", "신한카드FAN스퀘어홀", "신한카드 FAN스퀘어홀",
  "예술의전당", "이해랑예술극장", // 동대입구
  "광림아트센터", "국립중앙박물관 극장 용",
  "세종문화회관", "유니버설아트센터",
  "블루스퀘어", "성남아트센터",
  // --- 동생분이 실제로 다니시는 중형 공연장 (마지노선) ---
  "GS아트센터", "코엑스", "신한카드 아티움", "한전아트센터",
  "홍대대학로아트센터", "홍익대 대학로아트센터", "홍익대학교 대학로아트센터", "대학로아트센터", "NOL씨어터",
  // --- LG아트센터 서울(마곡) ---
  "LG아트센터 서울",
  // --- 그 외 확실한 대형/중대형 공연장 ---
  "충무아트센터 대극장",
  "국립극장", "예스24라이브홀", "예스24 라이브홀",
  "고양아람누리", "경기아트센터", "수원SK아트리움", "부천아트센터",
  "강릉아트센터", "춘천문화예술회관", "원주치악예술관",
  "부산문화회관", "소향씨어터", "드림씨어터", "경남문화예술회관", "성산아트홀",
  "대구콘서트하우스", "대구오페라하우스", "계명아트센터",
  "광주문화예술회관", "김대중컨벤션센터",
  "대전예술의전당", "청주아트홀",
  "제주아트센터",
];

function isVenueWhitelisted(location) {
  if (!location) return false;
  return VENUE_WHITELIST.some((name) => location.includes(name));
}

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
      sourceStatus.kopis = false;
      break;
    }
    const xml = await res.text();
    if (xml.includes("SERVICE KEY IS NOT REGISTERED") || xml.includes("<error>")) {
      console.error("KOPIS 응답 오류:", xml.slice(0, 300));
      sourceStatus.kopis = false;
      break;
    }

    const list = parseKopisXml(xml);
    for (const it of list) {
      if (EXCLUDED_KOPIS_GENRES.some((g) => it.genrenm?.includes(g))) continue;
      if (EXCLUDED_TITLE_KEYWORDS.some((k) => it.prfnm?.includes(k))) continue;
      // 뮤지컬은 화이트리스트에 있는 공연장에서 하는 것만 남깁니다.
      // (콘서트/페스티벌 등은 공연장 규모가 흥행 척도로 안 맞는 경우가 많아 대상 제외)
      if (it.genrenm === "뮤지컬" && !isVenueWhitelisted(it.fcltynm)) continue;

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
      sourceStatus.culture = false;
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

  await attachMentionCounts(merged);

  const payload = {
    updatedAt: new Date().toISOString(),
    count: merged.length,
    sourceStatus,
    festivals: merged,
  };

  await writeFile("festivals.json", JSON.stringify(payload, null, 2), "utf-8");
  console.log(`총 ${merged.length}건 저장 완료 → festivals.json`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
