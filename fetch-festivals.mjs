/**
 * 전국 축제 + 공연 정보를 네 곳에서 가져와 하나의 JSON으로 합칩니다.
 *
 *  1) 한국관광공사 TourAPI (KorService2 / searchFestival2)
 *     → 지역축제 위주
 *
 *  2) 한국문화정보원 전국문화축제 표준데이터 (공공데이터포털)
 *     → 지역축제 위주
 *
 *  3) 한국문화정보원 한눈에보는문화정보조회서비스 (문화포털)
 *     → 공연/전시/행사 등 문화정보
 *
 *  4) 예술경영지원센터 KOPIS 공연예술통합전산망 (공연목록조회)
 *     → 공연/뮤지컬/대중음악/축제 카테고리 포함
 *
 * 실행:
 *   node fetch-festivals.mjs
 *
 * 필요 환경변수:
 *   TOUR_API_KEY
 *     - data.go.kr "한국관광공사_국문 관광정보 서비스_GW" 인증키
 *
 *   CULTURE_API_KEY
 *     - data.go.kr "전국문화축제 표준데이터" 인증키
 *
 *   CULTURE_PORTAL_API_KEY
 *     - data.go.kr "한국문화정보원_한눈에보는문화정보조회서비스" 인증키
 *
 *   KOPIS_API_KEY
 *     - kopis.or.kr에서 발급받은 Open API 서비스키
 *
 * 넷 중 일부만 있어도 동작합니다.
 * 키가 없는 소스는 건너뜁니다.
 */

import { writeFile } from "fs/promises";

const TOUR_API_KEY = process.env.TOUR_API_KEY || "";
const CULTURE_API_KEY = process.env.CULTURE_API_KEY || "";
const CULTURE_PORTAL_API_KEY = process.env.CULTURE_PORTAL_API_KEY || "";
const KOPIS_API_KEY = process.env.KOPIS_API_KEY || "";

// 각 소스가 이번 실행에서 정상적으로 갱신됐는지 기록.
// 키가 없어서 건너뛴 경우는 실패로 처리하지 않습니다.
const sourceStatus = {
  tourapi: true,
  culture: true,
  culturePortal: true,
  kopis: true,
};

const TOUR_BASE =
  "https://apis.data.go.kr/B551011/KorService2";

const CULTURE_BASE =
  "https://api.odcloud.kr/api/15068380/v1/uddi:3a628ee9-3f60-436d-8f5d-748d99d6c5c9";

const CULTURE_PORTAL_BASE =
  "https://apis.data.go.kr/B553457/nopenapi/rest/publicperformancedisplays/period";

const KOPIS_BASE =
  "https://www.kopis.or.kr/openApi/restful/pblprfr";

// 앞으로 몇 개월치 공연을 가져올지
const KOPIS_MONTHS_AHEAD = 3;

// 문화포털도 KOPIS와 동일한 조회 기간을 사용
const CULTURE_PORTAL_MONTHS_AHEAD = 3;

// TourAPI areacode → 짧은 지역명
const AREA_NAME_BY_CODE = {
  1: "서울",
  2: "인천",
  3: "대전",
  4: "대구",
  5: "광주",
  6: "부산",
  7: "울산",
  8: "세종",
  31: "경기",
  32: "강원",
  33: "충북",
  34: "충남",
  35: "경북",
  36: "경남",
  37: "전북",
  38: "전남",
  39: "제주",
};

/**
 * 공백/기호/괄호 등을 제거해
 * 서로 다른 API에서 같은 행사를 조금 다르게 표현해도
 * 중복 비교가 가능하도록 제목을 정규화합니다.
 */
function normalizeTitle(title) {
  return (title || "")
    .normalize("NFKC")
    .replace(/\[[^\]]*\]/g, "")
    .replace(/\([^)]*\)/g, "")
    .replace(/[［］【】]/g, "")
    .replace(/\s+/g, "")
    .replace(/[^\p{L}\p{N}]/gu, "")
    .trim()
    .toLowerCase();
}

function normalizeAreaName(raw) {
  if (!raw) return null;

  const suffixes = [
    "특별자치시",
    "특별자치도",
    "광역시",
    "특별시",
    "자치도",
    "도",
  ];

  let name = String(raw).trim();

  for (const suffix of suffixes) {
    if (name.endsWith(suffix)) {
      name = name.slice(0, -suffix.length);
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
  if (!ymd) return null;

  const value = String(ymd).replace(/[^\d]/g, "");

  if (value.length !== 8) return null;

  return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
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
  if (!ymd) return null;

  const text = String(ymd).trim();

  const m = text.match(/(\d{4})\.(\d{2})\.(\d{2})/);

  if (!m) return null;

  return `${m[1]}-${m[2]}-${m[3]}`;
}

function daysBetween(start, end) {
  if (!start || !end) return null;

  const startDate = new Date(start);
  const endDate = new Date(end);

  if (
    Number.isNaN(startDate.getTime()) ||
    Number.isNaN(endDate.getTime())
  ) {
    return null;
  }

  return (endDate - startDate) / 86400000;
}

function isOver90Days(start, end) {
  const days = daysBetween(start, end);
  return days !== null && days > 90;
}

/**
 * XML 엔티티를 최소한으로 복원합니다.
 */
function decodeXml(text) {
  return String(text || "")
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .trim();
}

/**
 * 특정 XML 블록 안에서 태그 값을 가져옵니다.
 */
function xmlField(block, tags) {
  for (const tag of tags) {
    const escapedTag = tag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

    const regex = new RegExp(
      `<${escapedTag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${escapedTag}>`,
      "i"
    );

    const match = block.match(regex);

    if (match) {
      return decodeXml(match[1]);
    }
  }

  return "";
}

/**
 * XML 안에서 item/db/list 형태의 반복 블록을 찾아냅니다.
 *
 * 문화포털 API의 실제 응답 구조가 변경되더라도
 * 대표적인 반복 요소를 우선 찾도록 작성했습니다.
 */
function extractXmlBlocks(xml) {
  const blockPatterns = [
    /<item\b[^>]*>[\s\S]*?<\/item>/gi,
    /<db\b[^>]*>[\s\S]*?<\/db>/gi,
    /<list\b[^>]*>[\s\S]*?<\/list>/gi,
  ];

  for (const pattern of blockPatterns) {
    const blocks = xml.match(pattern);

    if (blocks && blocks.length > 0) {
      return blocks;
    }
  }

  return [];
}

/**
 * 1) 한국관광공사 TourAPI
 */
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
    url.searchParams.set("arrange", "A");
    url.searchParams.set("eventStartDate", todayYYYYMMDD());
    url.searchParams.set("numOfRows", String(numOfRows));
    url.searchParams.set("pageNo", String(pageNo));

    const res = await fetch(url);

    if (!res.ok) {
      console.error(
        "TourAPI 요청 실패:",
        res.status,
        await res.text()
      );

      sourceStatus.tourapi = false;
      break;
    }

    const json = await res.json();
    const body = json?.response?.body;

    if (!body) {
      console.error(
        "TourAPI 응답 형식 이상:",
        JSON.stringify(json).slice(0, 500)
      );

      sourceStatus.tourapi = false;
      break;
    }

    const items = body.items?.item;
    const list = Array.isArray(items)
      ? items
      : items
        ? [items]
        : [];

    for (const it of list) {
      const start = ymdToIso(it.eventstartdate);
      const end = ymdToIso(it.eventenddate);

      if (isOver90Days(start, end)) {
        continue;
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
        detailUrl: null,
      });
    }

    const totalCount = Number(body.totalCount || 0);

    if (
      pageNo * numOfRows >= totalCount ||
      list.length === 0
    ) {
      break;
    }

    pageNo += 1;
  }

  console.log(`TourAPI에서 ${results.length}건 수집`);

  return results;
}

/**
 * 2) 문화축제 표준데이터
 */
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
      console.error(
        "문화축제 표준데이터 요청 실패:",
        res.status,
        await res.text()
      );

      sourceStatus.culture = false;
      break;
    }

    const json = await res.json();
    const rows = Array.isArray(json?.data)
      ? json.data
      : [];

    for (const row of rows) {
      const start = ymdToIso(row["축제시작일자"]);
      const end = ymdToIso(row["축제종료일자"]);

      if (isOver90Days(start, end)) {
        continue;
      }

      const title = row["축제명"] || "";

      if (!title) {
        continue;
      }

      results.push({
        source: "culture",
        type: "festival",
        id: `culture-${title}-${start || "unknown"}`,
        title,
        startDate: start,
        endDate: end,
        location:
          row["개최장소"] ||
          row["소재지도로명주소"] ||
          row["소재지지번주소"] ||
          "",
        area: normalizeAreaName(
          row["시도명"] ||
          row["시군구명"] ||
          ""
        ),
        lat: row["위도"]
          ? Number(row["위도"])
          : null,
        lon: row["경도"]
          ? Number(row["경도"])
          : null,
        thumbnail: null,
        detailUrl: null,
      });
    }

    if (rows.length < perPage) {
      break;
    }

    page += 1;
  }

  console.log(
    `문화축제 표준데이터에서 ${results.length}건 수집`
  );

  return results;
}

/**
 * 3) 문화포털 "한눈에보는문화정보조회서비스"
 *
 * 공식 기간별 조회 API:
 *   /publicperformancedisplays/period
 *
 * 공식 가이드에서 확인되는 파라미터:
 *   from, to, cPage, rows,
 *   place, gpsxfrom, gpsyfrom, gpsxto, gpsyto,
 *   keyword, sortStdr, serviceKey
 */
async function fetchCulturePortalPerformances() {
  if (!CULTURE_PORTAL_API_KEY) {
    console.log(
      "CULTURE_PORTAL_API_KEY 없음 → 문화포털 건너뜀"
    );

    return [];
  }

  const results = [];

  let cPage = 1;
  const rows = 100;

  const fromDate = dateToYYYYMMDD(new Date());
  const toDate = dateToYYYYMMDD(
    addMonths(new Date(), CULTURE_PORTAL_MONTHS_AHEAD)
  );

  while (true) {
    const url = new URL(CULTURE_PORTAL_BASE);

    url.searchParams.set("from", fromDate);
    url.searchParams.set("to", toDate);
    url.searchParams.set("cPage", String(cPage));
    url.searchParams.set("rows", String(rows));

    // 전체 지역/장소 조회
    url.searchParams.set("place", "");

    // 좌표 범위 제한 없음
    url.searchParams.set("gpsxfrom", "");
    url.searchParams.set("gpsyfrom", "");
    url.searchParams.set("gpsxto", "");
    url.searchParams.set("gpsyto", "");

    // 검색어 제한 없음
    url.searchParams.set("keyword", "");

    // 기본 정렬
    url.searchParams.set("sortStdr", "1");

    url.searchParams.set(
      "serviceKey",
      CULTURE_PORTAL_API_KEY
    );

    const res = await fetch(url);

    if (!res.ok) {
      const text = await res.text();

      console.error(
        "문화포털 API 요청 실패:",
        res.status,
        text.slice(0, 1000)
      );

      sourceStatus.culturePortal = false;
      break;
    }

    const xml = await res.text();

    // 공공데이터 API의 대표적인 오류 코드 확인
    if (
      xml.includes("SERVICE_KEY_IS_NOT_REGISTERED_ERROR") ||
      xml.includes("SERVICE_ACCESS_DENIED_ERROR") ||
      xml.includes("LIMITED_NUMBER_OF_SERVICE_REQUESTS_EXCEEDS_ERROR") ||
      xml.includes("DEADLINE_HAS_EXPIRED_ERROR") ||
      xml.includes("<errorMsg>")
    ) {
      console.error(
        "문화포털 API 응답 오류:",
        xml.slice(0, 1000)
      );

      sourceStatus.culturePortal = false;
      break;
    }

    const blocks = extractXmlBlocks(xml);

    if (blocks.length === 0) {
      console.error(
        "문화포털 API에서 반복 데이터 블록을 찾지 못했습니다."
      );
      console.error(
        "응답 앞부분:",
        xml.slice(0, 1500)
      );

      sourceStatus.culturePortal = false;
      break;
    }

    let pageItemCount = 0;

    for (const block of blocks) {
      /**
       * 문화포털 API 버전/응답 구조에 따라
       * 표기명이 일부 다를 가능성을 고려해 alias를 사용합니다.
       */
      const seq = xmlField(block, [
        "seq",
        "SEQ",
        "contentid",
        "contentId",
      ]);

      const title = xmlField(block, [
        "title",
        "TITLE",
        "prfnm",
        "subject",
        "name",
      ]);

      const startRaw = xmlField(block, [
        "startDate",
        "startdate",
        "STARTDATE",
        "prfpdfrom",
        "from",
      ]);

      const endRaw = xmlField(block, [
        "endDate",
        "enddate",
        "ENDDATE",
        "prfpdto",
        "to",
      ]);

      const location = xmlField(block, [
        "place",
        "PLACE",
        "fcltynm",
        "facility",
        "facilityName",
      ]);

      const areaRaw = xmlField(block, [
        "area",
        "AREA",
        "sido",
        "sidoNm",
        "region",
        "regionName",
      ]);

      const realm = xmlField(block, [
        "realmName",
        "realm",
        "REALMNAME",
        "genrenm",
        "category",
      ]);

      const latRaw = xmlField(block, [
        "gpsY",
        "gpsy",
        "GPSY",
        "latitude",
        "lat",
      ]);

      const lonRaw = xmlField(block, [
        "gpsX",
        "gpsx",
        "GPSX",
        "longitude",
        "lon",
      ]);

      const thumbnail = xmlField(block, [
        "imgUrl",
        "imageUrl",
        "thumbnail",
        "poster",
        "firstimage",
        "image",
      ]);

      const detailUrl = xmlField(block, [
        "url",
        "URL",
        "detailUrl",
        "link",
        "homePage",
      ]);

      const start = ymdToIso(startRaw);
      const end = ymdToIso(endRaw);

      // 제목이 없는 블록은 실제 행사 데이터로 취급하지 않음
      if (!title) {
        continue;
      }

      // 시작일이 없으면 현재 앱의 날짜 기반 달력에 사용할 수 없음
      if (!start) {
        continue;
      }

      if (isOver90Days(start, end)) {
        continue;
      }

      const normalizedRealm = String(realm || "").trim();

      const isFestival =
        normalizedRealm.includes("축제") ||
        normalizedRealm.includes("행사");

      const area = normalizeAreaName(areaRaw);

      results.push({
        source: "culturePortal",
        type: isFestival ? "festival" : "performance",
        id:
          seq
            ? `culture-portal-${seq}`
            : `culture-portal-${normalizeTitle(title)}-${start}`,
        title,
        startDate: start,
        endDate: end,
        location,
        area,
        lat: latRaw && !Number.isNaN(Number(latRaw))
          ? Number(latRaw)
          : null,
        lon: lonRaw && !Number.isNaN(Number(lonRaw))
          ? Number(lonRaw)
          : null,
        thumbnail: thumbnail || null,
        detailUrl: detailUrl || null,
        genre: normalizedRealm || null,
      });

      pageItemCount += 1;
    }

    console.log(
      `문화포털 ${cPage}페이지 처리: ${pageItemCount}건`
    );

    // 현재 API 응답에서 페이지당 실제 항목 수가 rows보다 적으면 마지막 페이지로 판단
    if (blocks.length < rows) {
      break;
    }

    cPage += 1;
  }

  console.log(
    `문화포털에서 ${results.length}건 수집`
  );

  return results;
}

/**
 * KOPIS XML 파싱
 */
function parseKopisXml(xml) {
  const items = [];

  const dbBlocks =
    xml.match(/<db>[\s\S]*?<\/db>/g) || [];

  for (const block of dbBlocks) {
    items.push({
      mt20id: xmlField(block, ["mt20id"]),
      prfnm: xmlField(block, ["prfnm"]),
      prfpdfrom: xmlField(block, ["prfpdfrom"]),
      prfpdto: xmlField(block, ["prfpdto"]),
      fcltynm: xmlField(block, ["fcltynm"]),
      poster: xmlField(block, ["poster"]),
      genrenm: xmlField(block, ["genrenm"]),
      area: xmlField(block, ["area"]),
    });
  }

  return items;
}

// KOPIS 소규모 장르 제외
const EXCLUDED_KOPIS_GENRES = [
  "연극",
  "서양음악(클래식)",
  "한국음악(국악)",
  "서커스/마술",
  "무용(서양/한국무용)",
  "대중무용",
];

// KOPIS 개인/학생 발표 성격 및 어린이 공연 제외
const EXCLUDED_TITLE_KEYWORDS = [
  "리사이틀",
  "독주회",
  "정기연주회",
  "발표회",
  "합창제",
  "콩쿠르",
  "콩쿨",
  "워크숍",
  "졸업연주",

  "어린이",
  "아동",
  "유아",
  "키즈",
  "가족뮤지컬",
  "인형극",

  "뽀로로",
  "핑크퐁",
  "타요",
  "코코몽",
  "베이비샤크",
  "캐치! 티니핑",
  "브레드이발소",
  "슈퍼윙스",

  "신데렐라",
  "백설공주",
  "인어공주",
  "라푼젤",
  "헨젤과그레텔",
  "헨젤과 그레텔",
  "콩쥐팥쥐",
  "흥부와놀부",
  "흥부와 놀부",
  "심청전",
  "피노키오",
  "미녀와야수",
  "미녀와 야수",
  "피터팬",
  "이상한나라의앨리스",
  "이상한 나라의 앨리스",
  "오즈의마법사",
  "오즈의 마법사",
  "빨간모자",
  "아기돼지삼형제",
  "아기 돼지 삼형제",
  "브레멘음악대",
  "브레멘 음악대",
  "성냥팔이소녀",
  "성냥팔이 소녀",
  "개미와베짱이",
  "개미와 베짱이",
  "토끼와거북이",
  "토끼와 거북이",
  "여우와두루미",
  "나무꾼과선녀",
  "나무꾼과 선녀",
  "황금거위",
  "아기양",
  "잠자는숲속의공주",
  "잠자는 숲속의 공주",
];

// 뮤지컬 공연장 화이트리스트
const VENUE_WHITELIST = [
  "정동극장",
  "디큐브아트센터",
  "두산연강홀",
  "충무아트센터",
  "상상마당",
  "우란문화재단",
  "우란2경",
  "LG아트센터",
  "명동예술극장",
  "신도림",
  "을지로입구",
  "샤롯데씨어터",
  "신한카드FAN스퀘어홀",
  "신한카드 FAN스퀘어홀",
  "예술의전당",
  "이해랑예술극장",
  "광림아트센터",
  "국립중앙박물관 극장 용",
  "세종문화회관",
  "유니버설아트센터",
  "블루스퀘어",
  "성남아트센터",

  "GS아트센터",
  "코엑스",
  "신한카드 아티움",
  "한전아트센터",
  "홍대대학로아트센터",
  "홍익대 대학로아트센터",
  "홍익대학교 대학로아트센터",
  "대학로아트센터",
  "NOL씨어터",

  "LG아트센터 서울",

  "충무아트센터 대극장",
  "국립극장",
  "예스24라이브홀",
  "예스24 라이브홀",
  "고양아람누리",
  "경기아트센터",
  "수원SK아트리움",
  "부천아트센터",
  "강릉아트센터",
  "춘천문화예술회관",
  "원주치악예술관",
  "부산문화회관",
  "소향씨어터",
  "드림씨어터",
  "경남문화예술회관",
  "성산아트홀",
  "대구콘서트하우스",
  "대구오페라하우스",
  "계명아트센터",
  "광주문화예술회관",
  "김대중컨벤션센터",
  "대전예술의전당",
  "청주아트홀",
  "제주아트센터",
];

function isVenueWhitelisted(location) {
  if (!location) {
    return false;
  }

  return VENUE_WHITELIST.some((name) =>
    location.includes(name)
  );
}

/**
 * 4) KOPIS 공연목록조회
 */
async function fetchKopisPerformances() {
  if (!KOPIS_API_KEY) {
    console.log("KOPIS_API_KEY 없음 → KOPIS 건너뜀");
    return [];
  }

  const results = [];

  let cpage = 1;
  const rows = 100;

  const stdate = dateToYYYYMMDD(new Date());

  const eddate = dateToYYYYMMDD(
    addMonths(new Date(), KOPIS_MONTHS_AHEAD)
  );

  while (true) {
    const url = new URL(KOPIS_BASE);

    url.searchParams.set("service", KOPIS_API_KEY);
    url.searchParams.set("stdate", stdate);
    url.searchParams.set("eddate", eddate);
    url.searchParams.set("cpage", String(cpage));
    url.searchParams.set("rows", String(rows));

    const res = await fetch(url);

    if (!res.ok) {
      console.error(
        "KOPIS 요청 실패:",
        res.status,
        await res.text()
      );

      sourceStatus.kopis = false;
      break;
    }

    const xml = await res.text();

    if (
      xml.includes("SERVICE KEY IS NOT REGISTERED") ||
      xml.includes("<error>")
    ) {
      console.error(
        "KOPIS 응답 오류:",
        xml.slice(0, 500)
      );

      sourceStatus.kopis = false;
      break;
    }

    const list = parseKopisXml(xml);

    for (const it of list) {
      if (
        EXCLUDED_KOPIS_GENRES.some((genre) =>
          it.genrenm?.includes(genre)
        )
      ) {
        continue;
      }

      if (
        EXCLUDED_TITLE_KEYWORDS.some((keyword) =>
          it.prfnm?.includes(keyword)
        )
      ) {
        continue;
      }

      if (
        it.genrenm === "뮤지컬" &&
        !isVenueWhitelisted(it.fcltynm)
      ) {
        continue;
      }

      const start = kopisDateToIso(it.prfpdfrom);
      const end = kopisDateToIso(it.prfpdto);

      if (isOver90Days(start, end)) {
        continue;
      }

      if (!it.prfnm || !start) {
        continue;
      }

      results.push({
        source: "kopis",
        type: it.genrenm?.includes("축제")
          ? "festival"
          : "performance",
        id: `kopis-${it.mt20id}`,
        title: it.prfnm,
        startDate: start,
        endDate: end,
        location: it.fcltynm || "",
        area: normalizeAreaName(it.area),
        thumbnail: it.poster || null,
        detailUrl:
          `https://www.kopis.or.kr/por/db/pblprfr/` +
          `pblprfrView.do?mt20Id=${it.mt20id}`,
        genre: it.genrenm || null,
      });
    }

    if (list.length < rows) {
      break;
    }

    cpage += 1;
  }

  console.log(`KOPIS에서 ${results.length}건 수집`);

  return results;
}

/**
 * 두 장소가 서로 다른 지역/장소인지 판별하기 위한 보수적 비교입니다.
 *
 * 같은 제목 + 같은 시작일이라도
 * 부산/서울처럼 명백하게 장소가 다르면 별도 항목으로 유지합니다.
 */
function locationsClearlyDifferent(a, b) {
  const locationA = String(a.location || "").trim();
  const locationB = String(b.location || "").trim();

  if (!locationA || !locationB) {
    return false;
  }

  if (locationA === locationB) {
    return false;
  }

  const areaA = normalizeAreaName(a.area);
  const areaB = normalizeAreaName(b.area);

  if (areaA && areaB && areaA !== areaB) {
    return true;
  }

  return false;
}

/**
 * 중복 제거 우선순위.
 *
 * 같은 행사라면 TourAPI가 기존 앱의 기준 데이터이므로
 * TourAPI를 우선합니다.
 *
 * 이후에는 데이터가 더 풍부한 항목을 우선합니다.
 */
function sourcePriority(item) {
  switch (item.source) {
    case "tourapi":
      return 4;
    case "culture":
      return 3;
    case "culturePortal":
      return 2;
    case "kopis":
      return 1;
    default:
      return 0;
  }
}

function dataRichness(item) {
  let score = 0;

  if (item.location) score += 2;
  if (item.area) score += 1;
  if (item.endDate) score += 1;
  if (item.thumbnail) score += 2;
  if (item.detailUrl) score += 1;
  if (item.genre) score += 1;
  if (item.lat !== null && item.lat !== undefined) score += 1;
  if (item.lon !== null && item.lon !== undefined) score += 1;

  return score;
}

/**
 * 중복 제거
 *
 * 기본 기준:
 *   제목 정규화 + 시작일
 *
 * 단,
 *   - 같은 제목/시작일
 *   - 지역이 명백하게 다름
 *
 * 이 경우에는 서로 다른 행사의 지역별 개최로 보고 유지합니다.
 */
function dedupe(list) {
  const groups = new Map();

  for (const item of list) {
    const titleKey = normalizeTitle(item.title);

    if (!titleKey || !item.startDate) {
      continue;
    }

    const key = `${titleKey}__${item.startDate}`;

    if (!groups.has(key)) {
      groups.set(key, []);
    }

    groups.get(key).push(item);
  }

  const result = [];

  let duplicateRemoved = 0;

  for (const items of groups.values()) {
    const kept = [];

    for (const item of items) {
      let merged = false;

      for (let i = 0; i < kept.length; i += 1) {
        const existing = kept[i];

        if (locationsClearlyDifferent(existing, item)) {
          continue;
        }

        const existingPriority =
          sourcePriority(existing);

        const itemPriority =
          sourcePriority(item);

        const existingRichness =
          dataRichness(existing);

        const itemRichness =
          dataRichness(item);

        if (
          itemPriority > existingPriority ||
          (
            itemPriority === existingPriority &&
            itemRichness > existingRichness
          )
        ) {
          kept[i] = item;
        }

        duplicateRemoved += 1;
        merged = true;
        break;
      }

      if (!merged) {
        kept.push(item);
      }
    }

    result.push(...kept);
  }

  console.log(
    `중복 제거: ${list.length}건 → ${result.length}건 ` +
    `(중복 ${duplicateRemoved}건 제거)`
  );

  return result;
}

/**
 * 출처별 개수 출력
 */
function printSourceStats(label, list) {
  const counts = {
    tourapi: 0,
    culture: 0,
    culturePortal: 0,
    kopis: 0,
  };

  for (const item of list) {
    if (counts[item.source] !== undefined) {
      counts[item.source] += 1;
    }
  }

  console.log(
    `${label} 출처별:` +
    ` TourAPI=${counts.tourapi},` +
    ` 표준데이터=${counts.culture},` +
    ` 문화포털=${counts.culturePortal},` +
    ` KOPIS=${counts.kopis}`
  );
}

async function main() {
  const [
    tourItems,
    cultureItems,
    culturePortalItems,
    kopisItems,
  ] = await Promise.all([
    fetchTourApiFestivals(),
    fetchCultureStandardFestivals(),
    fetchCulturePortalPerformances(),
    fetchKopisPerformances(),
  ]);

  const allItems = [
    ...tourItems,
    ...cultureItems,
    ...culturePortalItems,
    ...kopisItems,
  ];

  printSourceStats("수집 완료", allItems);

  let merged = dedupe(allItems);

  merged = merged
    .filter((item) => item.startDate)
    .sort((a, b) =>
      a.startDate.localeCompare(b.startDate)
    );

  printSourceStats("최종 데이터", merged);

  const payload = {
    updatedAt: new Date().toISOString(),
    count: merged.length,
    sourceStatus,
    festivals: merged,
  };

  await writeFile(
    "festivals.json",
    JSON.stringify(payload, null, 2),
    "utf-8"
  );

  console.log(
    `총 ${merged.length}건 저장 완료 → festivals.json`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
