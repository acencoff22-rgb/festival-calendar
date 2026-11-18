/**
 * 전국 축제 + 공연 정보를 여러 공공 데이터 API에서 가져와
 * 하나의 festivals.json으로 합칩니다.
 *
 * 데이터 출처
 * 1) 한국관광공사 TourAPI
 * 2) 전국문화축제 표준데이터
 * 3) 한국문화정보원 한눈에보는문화정보조회서비스
 * 4) KOPIS 공연예술통합전산망
 *
 * 실행:
 *   node fetch-festivals.mjs
 *
 * 필요 환경변수:
 *   TOUR_API_KEY
 *   CULTURE_API_KEY
 *   CULTURE_PORTAL_API_KEY
 *   KOPIS_API_KEY
 *
 * GitHub Actions에서 필수 API 키가 하나라도 없으면 갱신을 중단합니다.
 * 로컬 실행 시에는 API 키가 없는 소스만 건너뜁니다.
 */


import { writeFile } from "fs/promises";


function logSanitizedError(
  ...values
) {
  console.error(
    ...values.map(redactApiSecrets)
  );
}


// ======================================================
// 네트워크 재시도
// ======================================================
//
// apis.data.go.kr / api.data.go.kr는 가끔 일시적으로
// 연결이 지연되거나 타임아웃되는 경우가 있다. 한 번 실패했다고
// 바로 그 소스 전체를 포기하지 않고, 짧은 대기 후 몇 번 더
// 시도해서 이런 일시적인 장애를 흡수한다.

async function fetchWithRetry(
  url,
  {
    retries = 2,
    delayMs = 1500,
    timeoutMs = 60000,
  } = {}
) {
  let lastError;

  for (
    let attempt = 0;
    attempt <= retries;
    attempt += 1
  ) {
    try {
      return await fetch(
        url,
        {
          // 응답 헤더나 본문이 무기한 대기하는 상황을 방지한다.
          // 각 재시도마다 새 timeout signal을 생성한다.
          signal: AbortSignal.timeout(
            timeoutMs
          ),
        }
      );
    } catch (error) {
      lastError = error;

      if (attempt < retries) {
        logSanitizedError(
          `요청 실패, 재시도 ${attempt + 1}/${retries} (${delayMs * (attempt + 1)}ms 후): ${redactApiSecrets(error.message || error)}`
        );

        await new Promise(
          (resolve) =>
            setTimeout(
              resolve,
              delayMs *
                (attempt + 1)
            )
        );
      }
    }
  }

  throw lastError;
}


// ======================================================
// 환경변수
// ======================================================

const TOUR_API_KEY =
  process.env.TOUR_API_KEY || "";

const CULTURE_API_KEY =
  process.env.CULTURE_API_KEY || "";

const CULTURE_PORTAL_API_KEY =
  process.env.CULTURE_PORTAL_API_KEY || "";

const KOPIS_API_KEY =
  process.env.KOPIS_API_KEY || "";


// ======================================================
// API 인증키 로그 마스킹
// ======================================================

const API_SECRET_VALUES = [
  TOUR_API_KEY,
  CULTURE_API_KEY,
  CULTURE_PORTAL_API_KEY,
  KOPIS_API_KEY,
].filter(Boolean);


function redactApiSecrets(
  value
) {
  let text =
    String(value ?? "");

  for (const secret of API_SECRET_VALUES) {
    const variants = [
      secret,
      encodeURIComponent(secret),
      encodeURIComponent(
        encodeURIComponent(secret)
      ),
    ];

    for (const variant of variants) {
      if (variant) {
        text = text.split(variant).join("[REDACTED]");
      }
    }
  }

  return text;
}


// ======================================================
// 소스 상태
// ======================================================

const sourceStatus = {
  tourapi: true,
  culture: true,
  culturePortal: true,
  kopis: true,
};


// ======================================================
// API 기본 URL
// ======================================================

// 한국관광공사 TourAPI
const TOUR_BASE =
  "https://apis.data.go.kr/B551011/KorService2";


// 전국문화축제 표준데이터
const CULTURE_BASE =
  "https://api.data.go.kr/openapi/tn_pubr_public_cltur_fstvl_api";


// 한국문화정보원
// 한눈에보는문화정보조회서비스
const CULTURE_PORTAL_BASE =
  "https://apis.data.go.kr/B553457/cultureinfo";


// KOPIS
const KOPIS_BASE =
  "https://www.kopis.or.kr/openApi/restful/pblprfr";


// ======================================================
// 수집 기간
// ======================================================

const KOPIS_MONTHS_AHEAD = 3;

const CULTURE_PORTAL_MONTHS_AHEAD = 3;


// ======================================================
// TourAPI 지역 코드
// ======================================================

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


// ======================================================
// 제목 정규화
// ======================================================

function normalizeTitle(title) {
  return String(title || "")
    .normalize("NFKC")
    .replace(/\[[^\]]*\]/g, "")
    .replace(/\([^)]*\)/g, "")
    .replace(/[［］【】]/g, "")
    // "제24회", "제 6 회" 등 회차 표기 제거 (문두/문중 모두)
    .replace(/제\s*\d+\s*회\s*/g, "")
    // "행사명 - 부제"처럼 공백으로 둘러싸인 대시 뒤의 부제 제거.
    // ("K-POP"처럼 단어에 바로 붙은 대시는 앞뒤 공백이 없어서 안 건드림)
    .replace(/\s[-–—]\s[\s\S]*$/, "")
    .replace(/\s+/g, "")
    .replace(/[^\p{L}\p{N}]/gu, "")
    .trim()
    .toLowerCase();
}


// ======================================================
// 일반 텍스트 정규화
// ======================================================

function normalizeText(value) {
  return String(value || "")
    .normalize("NFKC")
    .replace(/\s+/g, "")
    .trim()
    .toLowerCase();
}


// ======================================================
// 지역명 정규화
// ======================================================

// 정식 행정구역명 → 필터에서 실제로 쓰는 축약형.
// 접미사만 잘라내면 "경상남도" → "경상남"처럼 어중간하게 남아
// 실제 필터 값인 "경남"과 어긋나는 문제가 있었다.
const CANONICAL_AREA_MAP = {
  "서울특별시": "서울",
  "서울": "서울",
  "부산광역시": "부산",
  "부산": "부산",
  "대구광역시": "대구",
  "대구": "대구",
  "인천광역시": "인천",
  "인천": "인천",
  "광주광역시": "광주",
  "대전광역시": "대전",
  "대전": "대전",
  "울산광역시": "울산",
  "울산": "울산",
  "세종특별자치시": "세종",
  "세종": "세종",
  "경기도": "경기",
  "경기": "경기",
  "강원특별자치도": "강원",
  "강원도": "강원",
  "강원": "강원",
  "충청북도": "충북",
  "충북": "충북",
  "충청남도": "충남",
  "충남": "충남",
  "전북특별자치도": "전북",
  "전라북도": "전북",
  "전북": "전북",
  "전라남도": "전남",
  "전남": "전남",
  "경상북도": "경북",
  "경북": "경북",
  "경상남도": "경남",
  "경남": "경남",
  "제주특별자치도": "제주",
  "제주도": "제주",
  "제주": "제주",
};

function normalizeAreaName(raw) {
  if (!raw) {
    return null;
  }

  const name =
    String(raw).trim();

  if (CANONICAL_AREA_MAP[name]) {
    return CANONICAL_AREA_MAP[
      name
    ];
  }

  // 매핑에 없는 값(예: "해외", 예상 밖의 표기)은
  // 기존처럼 흔한 접미사만 제거해서 최대한 근접한 형태로 돌려준다.
  let stripped = name;

  const suffixes = [
    "특별자치시",
    "특별자치도",
    "광역시",
    "특별시",
    "자치도",
    "도",
  ];

  for (const suffix of suffixes) {
    if (
      stripped.endsWith(
        suffix
      )
    ) {
      stripped =
        stripped.slice(
          0,
          -suffix.length
        );

      break;
    }
  }

  return (
    stripped ||
    name
  );
}


// sido/sigungu 필드가 비어있는 원본 데이터를 위한 보조 수단.
// 도로명/지번주소는 관례상 정식 시·도명으로 시작하므로,
// 그 안에 포함된 시·도명을 찾아 축약형으로 돌려준다.
// (짧은 축약형이 아니라 정식 명칭만 검사해서, "경기도 광주시"가
//  "광주광역시"로 잘못 매칭되는 식의 오탐을 피한다.)
const FULL_AREA_NAME_KEYWORDS = [
  "서울특별시",
  "부산광역시",
  "대구광역시",
  "인천광역시",
  "광주광역시",
  "대전광역시",
  "울산광역시",
  "세종특별자치시",
  "경기도",
  "강원특별자치도",
  "강원도",
  "충청북도",
  "충청남도",
  "전북특별자치도",
  "전라북도",
  "전라남도",
  "경상북도",
  "경상남도",
  "제주특별자치도",
  "제주도",
];

function deriveAreaFromAddress(
  ...candidates
) {
  for (const candidate of candidates) {
    const text =
      String(
        candidate || ""
      );

    if (!text) {
      continue;
    }

    for (const keyword of FULL_AREA_NAME_KEYWORDS) {
      if (
        text.includes(
          keyword
        )
      ) {
        return normalizeAreaName(
          keyword
        );
      }
    }
  }

  return null;
}


// ======================================================
// 날짜
// ======================================================

function todayYYYYMMDD() {
  const d =
    new Date();

  const yyyy =
    d.getFullYear();

  const mm =
    String(
      d.getMonth() + 1
    ).padStart(2, "0");

  const dd =
    String(
      d.getDate()
    ).padStart(2, "0");

  return `${yyyy}${mm}${dd}`;
}


function dateToYYYYMMDD(
  date
) {
  const yyyy =
    date.getFullYear();

  const mm =
    String(
      date.getMonth() + 1
    ).padStart(2, "0");

  const dd =
    String(
      date.getDate()
    ).padStart(2, "0");

  return `${yyyy}${mm}${dd}`;
}


function addMonths(
  date,
  months
) {
  const d =
    new Date(date);

  const originalDay =
    d.getDate();

  // 1일로 이동한 뒤 월을 변경해 월말 날짜 overflow를 방지한다.
  d.setDate(1);
  d.setMonth(
    d.getMonth() + months
  );

  const lastDayOfTargetMonth =
    new Date(
      d.getFullYear(),
      d.getMonth() + 1,
      0
    ).getDate();

  d.setDate(
    Math.min(
      originalDay,
      lastDayOfTargetMonth
    )
  );

  return d;
}


function isValidCalendarDate(
  year,
  month,
  day
) {
  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    !Number.isInteger(day) ||
    year < 1900 ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31
  ) {
    return false;
  }

  const date =
    new Date(
      Date.UTC(
        year,
        month - 1,
        day
      )
    );

  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}


function ymdToIso(
  value
) {
  if (!value) {
    return null;
  }

  const text =
    String(value)
      .trim()
      .replace(/[^\d]/g, "");

  if (
    text.length !== 8
  ) {
    return null;
  }

  const year = Number(text.slice(0, 4));
  const month = Number(text.slice(4, 6));
  const day = Number(text.slice(6, 8));

  if (
    !isValidCalendarDate(
      year,
      month,
      day
    )
  ) {
    return null;
  }

  return (
    `${text.slice(0, 4)}-` +
    `${text.slice(4, 6)}-` +
    `${text.slice(6, 8)}`
  );
}


function kopisDateToIso(
  value
) {
  if (!value) {
    return null;
  }

  const match =
    String(value)
      .trim()
      .match(
        /(\d{4})\.(\d{2})\.(\d{2})/
      );

  if (!match) {
    return null;
  }

  if (
    !isValidCalendarDate(
      Number(match[1]),
      Number(match[2]),
      Number(match[3])
    )
  ) {
    return null;
  }

  return (
    `${match[1]}-` +
    `${match[2]}-` +
    `${match[3]}`
  );
}


// ======================================================
// 기간
// ======================================================

function daysBetween(
  start,
  end
) {
  if (
    !start ||
    !end
  ) {
    return null;
  }

  const startDate =
    new Date(start);

  const endDate =
    new Date(end);

  if (
    Number.isNaN(
      startDate.getTime()
    ) ||
    Number.isNaN(
      endDate.getTime()
    )
  ) {
    return null;
  }

  return (
    (endDate - startDate) /
    86400000
  );
}


function isOver90Days(
  start,
  end
) {
  const days =
    daysBetween(
      start,
      end
    );

  return (
    days !== null &&
    days > 90
  );
}


// 원본 데이터 자체에 종료일이 시작일보다 빠르게 들어오는 경우
// (예: 연도 오타 등) 종료일을 시작일과 같은 값으로 보정한다.
// 행사를 통째로 버리지 않고, 최소한 시작일 기준으로는 정상 표시되게 한다.
function fixReversedDateRange(
  start,
  end
) {
  if (
    start &&
    end &&
    end < start
  ) {
    return start;
  }

  return end;
}


// ======================================================
// XML 처리
// ======================================================

function decodeXml(
  text
) {
  return String(
    text || ""
  )
    .replace(
      /<!\[CDATA\[([\s\S]*?)\]\]>/g,
      "$1"
    )
    .replace(
      /&amp;/g,
      "&"
    )
    .replace(
      /&lt;/g,
      "<"
    )
    .replace(
      /&gt;/g,
      ">"
    )
    .replace(
      /&quot;/g,
      '"'
    )
    .replace(
      /&apos;/g,
      "'"
    )
    .trim();
}


function xmlField(
  block,
  tags
) {
  for (
    const tag of tags
  ) {
    const escapedTag =
      tag.replace(
        /[.*+?^${}()|[\]\\]/g,
        "\\$&"
      );

    const regex =
      new RegExp(
        `<${escapedTag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${escapedTag}>`,
        "i"
      );

    const match =
      block.match(
        regex
      );

    if (match) {
      return decodeXml(
        match[1]
      );
    }
  }

  return "";
}


function extractXmlBlocks(
  xml
) {
  const patterns = [
    /<item\b[^>]*>[\s\S]*?<\/item>/gi,
    /<db\b[^>]*>[\s\S]*?<\/db>/gi,
    /<perfor\b[^>]*>[\s\S]*?<\/perfor>/gi,
  ];

  for (
    const pattern of patterns
  ) {
    const blocks =
      xml.match(pattern);

    if (
      blocks &&
      blocks.length > 0
    ) {
      return blocks;
    }
  }

  return [];
}


function xmlResultCode(
  xml
) {
  const code =
    xmlField(
      xml,
      [
        "resultCode",
      ]
    );

  return (
    String(code || "")
      .trim()
  );
}


function xmlTotalCount(
  xml
) {
  const value =
    xmlField(
      xml,
      [
        "totalCount",
      ]
    );

  const count =
    Number(value);

  return Number.isFinite(count)
    ? count
    : 0;
}


// ======================================================
// 1. TourAPI
// ======================================================

async function fetchTourApiFestivals() {
  if (!TOUR_API_KEY) {
    console.log(
      "TOUR_API_KEY 없음 → TourAPI 건너뜀"
    );

    return [];
  }

  const results = [];

  let pageNo = 1;

  const numOfRows = 100;


  while (true) {
    const url =
      new URL(
        `${TOUR_BASE}/searchFestival2`
      );

    url.searchParams.set(
      "serviceKey",
      TOUR_API_KEY
    );

    url.searchParams.set(
      "MobileOS",
      "ETC"
    );

    url.searchParams.set(
      "MobileApp",
      "FestivalCalendar"
    );

    url.searchParams.set(
      "_type",
      "json"
    );

    url.searchParams.set(
      "arrange",
      "A"
    );

    url.searchParams.set(
      "eventStartDate",
      todayYYYYMMDD()
    );

    url.searchParams.set(
      "numOfRows",
      String(numOfRows)
    );

    url.searchParams.set(
      "pageNo",
      String(pageNo)
    );


    let res;

    try {
      res =
        await fetchWithRetry(
          url
        );
    } catch (error) {
      logSanitizedError(
        "TourAPI 요청 예외:",
        error
      );

      sourceStatus.tourapi =
        false;

      break;
    }


    if (!res.ok) {
      logSanitizedError(
        "TourAPI 요청 실패:",
        res.status,
        (
          await res.text()
        ).slice(
          0,
          1000
        )
      );

      sourceStatus.tourapi =
        false;

      break;
    }


    let json;

    try {
      json =
        await res.json();
    } catch (error) {
      logSanitizedError(
        "TourAPI JSON 파싱 실패:",
        error
      );

      sourceStatus.tourapi =
        false;

      break;
    }


    const body =
      json?.response?.body;

    if (!body) {
      logSanitizedError(
        "TourAPI 응답 형식 이상:",
        JSON.stringify(
          json
        ).slice(
          0,
          1500
        )
      );

      sourceStatus.tourapi =
        false;

      break;
    }


    const rawItems =
      body?.items?.item;

    const list =
      Array.isArray(
        rawItems
      )
        ? rawItems
        : rawItems
          ? [rawItems]
          : [];


    for (
      const item of list
    ) {
      const start =
        ymdToIso(
          item.eventstartdate
        );

      const end =
        fixReversedDateRange(
          start,
          ymdToIso(
            item.eventenddate
          )
        );


      if (
        !item.title ||
        !start
      ) {
        continue;
      }


      if (
        isOver90Days(
          start,
          end
        )
      ) {
        continue;
      }


      results.push({
        source:
          "tourapi",

        type:
          "festival",

        id:
          `tour-${item.contentid}`,

        title:
          item.title,

        startDate:
          start,

        endDate:
          end,

        location:
          item.addr1 ||
          item.eventplace ||
          "",

        area:
          AREA_NAME_BY_CODE[
            item.areacode
          ] ||
          deriveAreaFromAddress(
            item.addr1,
            item.eventplace
          ),

        lat:
          item.mapy &&
          !Number.isNaN(
            Number(
              item.mapy
            )
          )
            ? Number(
                item.mapy
              )
            : null,

        lon:
          item.mapx &&
          !Number.isNaN(
            Number(
              item.mapx
            )
          )
            ? Number(
                item.mapx
              )
            : null,

        thumbnail:
          item.firstimage ||
          null,

        detailUrl:
          null,
      });
    }


    const totalCount =
      Number(
        body.totalCount ||
        0
      );

    const hasValidTotalCount =
      Number.isFinite(totalCount) &&
      totalCount > 0;

    const reachedReportedEnd =
      hasValidTotalCount &&
      pageNo * numOfRows >= totalCount;

    // totalCount가 없는 응답은 페이지 크기로 끝을 판단한다.
    const reachedUnreportedEnd =
      !hasValidTotalCount &&
      list.length < numOfRows;

    if (
      list.length === 0 ||
      reachedReportedEnd ||
      reachedUnreportedEnd
    ) {
      break;
    }


    pageNo += 1;
  }


  console.log(
    `TourAPI에서 ${results.length}건 수집`
  );

  return results;
}


// ======================================================
// 2. 전국문화축제 표준데이터
// ======================================================

async function fetchCultureStandardFestivals() {
  if (!CULTURE_API_KEY) {
    console.log(
      "CULTURE_API_KEY 없음 → 표준데이터 건너뜀"
    );

    return [];
  }

  const results = [];

  let pageNo = 1;

  const numOfRows = 1000;


  while (true) {
    const url =
      new URL(
        CULTURE_BASE
      );


    url.searchParams.set(
      "serviceKey",
      CULTURE_API_KEY
    );

    url.searchParams.set(
      "type",
      "json"
    );

    url.searchParams.set(
      "pageNo",
      String(pageNo)
    );

    url.searchParams.set(
      "numOfRows",
      String(numOfRows)
    );


    let res;

    try {
      res =
        await fetchWithRetry(
          url
        );
    } catch (error) {
      logSanitizedError(
        "문화축제 표준데이터 요청 예외:",
        error
      );

      sourceStatus.culture =
        false;

      break;
    }


    if (!res.ok) {
      const text =
        await res.text();

      logSanitizedError(
        "문화축제 표준데이터 요청 실패:",
        res.status,
        text.slice(
          0,
          1500
        )
      );

      sourceStatus.culture =
        false;

      break;
    }


    let json;

    try {
      json =
        await res.json();
    } catch (error) {
      logSanitizedError(
        "문화축제 표준데이터 JSON 파싱 실패:",
        error
      );

      sourceStatus.culture =
        false;

      break;
    }


    const response =
      json?.response ||
      json;


    const header =
      response?.header ||
      {};


    const resultCode =
      String(
        header.resultCode ??
        "00"
      );


    if (
      resultCode !== "00" &&
      resultCode !== "0"
    ) {
      logSanitizedError(
        "문화축제 표준데이터 응답 오류:",
        JSON.stringify(
          json
        ).slice(
          0,
          1500
        )
      );

      sourceStatus.culture =
        false;

      break;
    }


    const body =
      response?.body ||
      {};


    const rawItems =
      body?.items;


    const rows =
      Array.isArray(
        rawItems
      )
        ? rawItems
        : Array.isArray(
            rawItems?.item
          )
          ? rawItems.item
          : rawItems?.item
            ? [rawItems.item]
            : [];


    for (
      const row of rows
    ) {
      const title =
        String(
          row?.fstvlNm ??
          row?.["축제명"] ??
          ""
        ).trim();


      if (!title) {
        continue;
      }


      const start =
        ymdToIso(
          row?.fstvlStartDate ??
          row?.["축제시작일자"] ??
          ""
        );


      const end =
        fixReversedDateRange(
          start,
          ymdToIso(
            row?.fstvlEndDate ??
            row?.["축제종료일자"] ??
            ""
          )
        );


      if (!start) {
        continue;
      }


      if (
        isOver90Days(
          start,
          end
        )
      ) {
        continue;
      }


      const location =
        String(
          row?.opar ??
          row?.["개최장소"] ??
          ""
        ).trim();


      const address =
        String(
          row?.rdnmadr ??
          row?.["소재지도로명주소"] ??
          ""
        ).trim();


      const jibunAddress =
        String(
          row?.lnmadr ??
          row?.["소재지지번주소"] ??
          ""
        ).trim();


      const sido =
        String(
          row?.["시도명"] ??
          row?.sidoNm ??
          ""
        ).trim();


      const sigungu =
        String(
          row?.["시군구명"] ??
          row?.sigunguNm ??
          ""
        ).trim();


      const latRaw =
        row?.latitude ??
        row?.["위도"] ??
        "";


      const lonRaw =
        row?.longitude ??
        row?.["경도"] ??
        "";


      const lat =
        latRaw !== "" &&
        !Number.isNaN(
          Number(
            latRaw
          )
        )
          ? Number(
              latRaw
            )
          : null;


      const lon =
        lonRaw !== "" &&
        !Number.isNaN(
          Number(
            lonRaw
          )
        )
          ? Number(
              lonRaw
            )
          : null;


      const homepage =
        String(
          row?.homepageUrl ??
          row?.["홈페이지주소"] ??
          ""
        ).trim();


      results.push({
        source:
          "culture",

        type:
          "festival",

        id:
          `culture-${normalizeTitle(title)}-${start}-${end || "x"}`,

        title,

        startDate:
          start,

        endDate:
          end,

        location:
          location ||
          address ||
          jibunAddress ||
          "",

        area:
          normalizeAreaName(
            sido
          ) ||
          deriveAreaFromAddress(
            address,
            jibunAddress,
            location,
            sigungu
          ),

        lat,

        lon,

        thumbnail:
          null,

        detailUrl:
          homepage ||
          null,
      });
    }


    const totalCount =
      Number(
        body?.totalCount ||
        0
      );


    if (
      rows.length === 0 ||
      rows.length < numOfRows ||
      (
        totalCount > 0 &&
        pageNo *
          numOfRows >=
          totalCount
      )
    ) {
      break;
    }


    pageNo += 1;
  }


  console.log(
    `문화축제 표준데이터에서 ${results.length}건 수집`
  );

  return results;
}


// ======================================================
// 3. 문화포털
//
// serviceTp:
//   A = 공연/전시
//   B = 행사/축제
//   C = 교육/체험
//
// 정책:
//
// A = 공연/전시
//   - 공연 유지
//   - 콘서트 유지
//   - 뮤지컬 유지
//   - 단, 뮤지컬은 대공연장 중심으로 제한
//   - 연극 제외
//   - 전시/기획전/특별전/상설전 제외
//   - 명확한 전시성 항목만 제외
//
// B = 행사/축제
//   - 축제/지역행사/계절행사/페스티벌 유지
//   - 불꽃놀이/하나비 등 유지
//   - 교육/체험/강좌/강연/세미나/워크숍 제외
//   - 전시 제외
//   - 연극/연극제 제외
//   - 단순 상설 프로그램 제외
//
// C = 사용하지 않음
// ======================================================


// ======================================================
// 문화포털 전시 제외 키워드
// ======================================================
//
// A와 B에는 다양한 문화행사가 섞일 수 있으므로
// 명확한 전시성 항목만 제거합니다.
//
// "사진", "미술"처럼 단독으로 넓게 쓰이는 단어를
// realmName만 보고 전시로 판정하지 않습니다.
// 대신 제목의 명확한 전시 표현은 계속 제외합니다.
// ======================================================

const EXCLUDED_CULTURE_PORTAL_EXHIBITION_KEYWORDS = [
  "전시회",
  "전시",
  "기획전",
  "특별전",
  "상설전",
  "미디어전",
  "展",
  "미술전",
  "미술전시",
  "미술전람회",
  "사진전",
  "사진전시",
  "회화전",
  "조각전",
  "작품전",
  "개인전",
  "초대전",
  "기념전",
  "아트페어",
];


// ======================================================
// 문화포털 교육/체험 등 제외 키워드
// ======================================================

const EXCLUDED_CULTURE_PORTAL_PROGRAM_KEYWORDS = [
  // 교육
  "교육",
  "교육프로그램",
  "문화교육",
  "문화예술교육",

  // 체험
  "체험",
  "체험프로그램",
  "체험행사",

  // 강좌
  "강좌",
  "문화강좌",
  "예술강좌",

  // 강연 / 세미나
  "강연",
  "강연회",
  "세미나",
  "포럼",
  "심포지엄",

  // 워크숍
  "워크숍",
  "워크샵",

  // 단순 시설 프로그램
  "상설프로그램",
  "상설문화",
];


// ======================================================
// 문화포털 연극 제외 키워드
// ======================================================

const EXCLUDED_CULTURE_PORTAL_THEATER_KEYWORDS = [
  "연극",
  "연극공연",
  "연극제",
];


// ======================================================
// 문화포털 뮤지컬 판별 키워드
// ======================================================

const MUSICAL_KEYWORDS = [
  "뮤지컬",
  "musical",
];


// ======================================================
// 문화포털 공연 판별 키워드
// ======================================================
//
// 공연이라는 단어가 없는 공연도 존재할 수 있으므로
// 이 목록은 "공연 여부"를 강제하는 용도가 아니라
// 장르 판별 보조용으로만 사용합니다.
// ======================================================

const PERFORMANCE_KEYWORDS = [
  "공연",
  "콘서트",
  "음악회",
  "페스티벌",
  "페스티발",
  "라이브",
  "뮤지컬",
  "musical",
];


// ======================================================
// 문화포털 뮤지컬 공연장 화이트리스트
// ======================================================
//
// KOPIS에서 사용하던 기준을 동일하게 적용합니다.
// ======================================================

const CULTURE_PORTAL_MUSICAL_VENUE_WHITELIST = [
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


function isVenueWhitelisted(
  location
) {
  if (!location) {
    return false;
  }

  return CULTURE_PORTAL_MUSICAL_VENUE_WHITELIST.some(
    (name) =>
      location.includes(
        name
      )
  );
}


// ======================================================
// 문화포털 전시 여부
// ======================================================
//
// 중요한 수정:
// realmName에 단순히 "사진"이나 "미술"이 포함된다고
// 전시로 보지 않습니다.
//
// 대신:
// 1) realmName에 명확하게 "전시"가 포함되거나
// 2) 제목에 명확한 전시 키워드가 있을 때만 제외합니다.
// ======================================================

function isCulturePortalExhibition(
  title,
  realmName
) {
  const titleText =
    normalizeText(
      title
    );

  const realmText =
    normalizeText(
      realmName
    );


  // 분야명이 명확하게 전시인 경우
  if (
    realmText.includes("전시")
  ) {
    return true;
  }


  // 제목에 명확한 전시 키워드가 있는 경우
  return EXCLUDED_CULTURE_PORTAL_EXHIBITION_KEYWORDS.some(
    (keyword) =>
      titleText.includes(
        normalizeText(
          keyword
        )
      )
  );
}


// ======================================================
// 문화포털 연극 여부
// ======================================================

function isCulturePortalTheater(
  title,
  realmName
) {
  const titleText =
    normalizeText(
      title
    );

  const realmText =
    normalizeText(
      realmName
    );


  return EXCLUDED_CULTURE_PORTAL_THEATER_KEYWORDS.some(
    (keyword) =>
      titleText.includes(
        normalizeText(
          keyword
        )
      ) ||
      realmText.includes(
        normalizeText(
          keyword
        )
      )
  );
}


// ======================================================
// 문화포털 뮤지컬 여부
// ======================================================

function isCulturePortalMusical(
  title,
  realmName
) {
  const titleText =
    normalizeText(
      title
    );

  const realmText =
    normalizeText(
      realmName
    );


  return MUSICAL_KEYWORDS.some(
    (keyword) =>
      titleText.includes(
        normalizeText(
          keyword
        )
      ) ||
      realmText.includes(
        normalizeText(
          keyword
        )
      )
  );
}


// ======================================================
// 문화포털 프로그램 제외 여부
// ======================================================

function isCulturePortalProgramExcluded(
  title,
  realmName
) {
  const text =
    normalizeText(
      `${title || ""} ${realmName || ""}`
    );


  if (!text) {
    return false;
  }


  return EXCLUDED_CULTURE_PORTAL_PROGRAM_KEYWORDS.some(
    (keyword) =>
      text.includes(
        normalizeText(
          keyword
        )
      )
  );
}


// ======================================================
// 문화포털 공연 여부
// ======================================================

function isCulturePortalPerformance(
  title,
  realmName
) {
  const titleText =
    normalizeText(
      title
    );

  const realmText =
    normalizeText(
      realmName
    );


  return PERFORMANCE_KEYWORDS.some(
    (keyword) =>
      titleText.includes(
        normalizeText(
          keyword
        )
      ) ||
      realmText.includes(
        normalizeText(
          keyword
        )
      )
  );
}


// ======================================================
// 문화포털 A 필터
// ======================================================
//
// A = 공연/전시
//
// 전시를 제거하고 공연을 유지합니다.
//
// 중요한 점:
// "공연"이라는 단어가 제목에 반드시 들어가야 하는
// 것은 아닙니다.
//
// 따라서 명확한 제외 대상만 제거하고,
// 나머지는 보수적으로 유지합니다.
// 단, 뮤지컬은 별도의 공연장 필터를 적용합니다.
// ======================================================

function shouldKeepCulturePortalA(
  title,
  realmName,
  location
) {
  // 1. 명확한 전시는 제외
  if (
    isCulturePortalExhibition(
      title,
      realmName
    )
  ) {
    return false;
  }


  // 2. 연극은 기존 정책대로 제외
  if (
    isCulturePortalTheater(
      title,
      realmName
    )
  ) {
    return false;
  }


  // 3. 교육/체험/강좌 등은 제외
  if (
    isCulturePortalProgramExcluded(
      title,
      realmName
    )
  ) {
    return false;
  }


  // 4. 뮤지컬은 대공연장 중심으로 제한
  if (
    isCulturePortalMusical(
      title,
      realmName
    )
  ) {
    return isVenueWhitelisted(
      location
    );
  }


  // 5. 명확한 공연/콘서트 등은 유지
  if (
    isCulturePortalPerformance(
      title,
      realmName
    )
  ) {
    return true;
  }


  // 6. A 안에서 위 조건에 해당하지 않는 항목은
  // 전시로 명확히 판정되지 않았다면 유지합니다.
  //
  // A의 데이터 자체가 "공연/전시"로 제한되어 있으므로
  // 여기서 지나치게 엄격한 positive 필터를 걸면
  // 정상적인 공연까지 사라질 수 있습니다.
  return true;
}


// ======================================================
// 문화포털 B 필터
// ======================================================
//
// B = 행사/축제
//
// 관광성이 낮은 교육/체험/강좌/강연/전시 등을
// 제거하고 일반적인 행사/축제는 유지합니다.
//
// 연극은 프로젝트 정책상 제외하므로
// "연극/연극제"도 제거합니다.
//
// 반대로 불꽃놀이/하나비/지역축제/계절행사 등은
// 별도의 positive 키워드가 없어도 B의 행사 영역이라는
// 전제하에 보수적으로 유지합니다.
// ======================================================

function shouldKeepCulturePortalB(
  title,
  realmName
) {
  // 1. 명확한 전시는 제외
  if (
    isCulturePortalExhibition(
      title,
      realmName
    )
  ) {
    return false;
  }


  // 2. 교육/체험/강좌/강연/세미나 등 제외
  if (
    isCulturePortalProgramExcluded(
      title,
      realmName
    )
  ) {
    return false;
  }


  // 3. 연극/연극제 제외
  if (
    isCulturePortalTheater(
      title,
      realmName
    )
  ) {
    return false;
  }


  // 4. 나머지 B 항목은 행사/축제 영역으로 보고 유지
  return true;
}


// ======================================================
// 문화포털 serviceTp별 필터
// ======================================================

function shouldKeepCulturePortalItem(
  serviceTp,
  title,
  realmName,
  location
) {
  if (
    serviceTp === "A"
  ) {
    return shouldKeepCulturePortalA(
      title,
      realmName,
      location
    );
  }


  if (
    serviceTp === "B"
  ) {
    return shouldKeepCulturePortalB(
      title,
      realmName
    );
  }


  // C는 호출하지 않지만 안전상 제외
  return false;
}


// ======================================================
// 문화포털 수집
// ======================================================

async function fetchCulturePortalByServiceType(
  serviceTp
) {
  const results = [];

  let pageNo = 1;

  const numOfRows =
    100;


  const fromDate =
    dateToYYYYMMDD(
      new Date()
    );


  const toDate =
    dateToYYYYMMDD(
      addMonths(
        new Date(),
        CULTURE_PORTAL_MONTHS_AHEAD
      )
    );


  while (true) {
    const url =
      new URL(
        `${CULTURE_PORTAL_BASE}/period2`
      );


    // 공식 파라미터
    url.searchParams.set(
      "serviceKey",
      CULTURE_PORTAL_API_KEY
    );

    url.searchParams.set(
      "PageNo",
      String(pageNo)
    );

    url.searchParams.set(
      "numOfrows",
      String(numOfRows)
    );

    url.searchParams.set(
      "keyword",
      ""
    );

    url.searchParams.set(
      "gpsxfrom",
      ""
    );

    url.searchParams.set(
      "gpsyfrom",
      ""
    );

    url.searchParams.set(
      "gpsxto",
      ""
    );

    url.searchParams.set(
      "gpsyto",
      ""
    );

    url.searchParams.set(
      "serviceTp",
      serviceTp
    );

    url.searchParams.set(
      "from",
      fromDate
    );

    url.searchParams.set(
      "to",
      toDate
    );


    let res;

    try {
      res =
        await fetchWithRetry(
          url
        );
    } catch (error) {
      logSanitizedError(
        `문화포털 ${serviceTp} 요청 예외:`,
        error
      );

      sourceStatus.culturePortal =
        false;

      break;
    }


    const xml =
      await res.text();


    if (!res.ok) {
      logSanitizedError(
        `문화포털 ${serviceTp} API 요청 실패:`,
        res.status,
        xml.slice(
          0,
          2000
        )
      );

      sourceStatus.culturePortal =
        false;

      break;
    }


    // API 자체 오류 응답 처리
    const resultCode =
      xmlResultCode(
        xml
      );


    if (
      resultCode &&
      resultCode !== "00" &&
      resultCode !== "0" &&
      resultCode !== "200"
    ) {
      logSanitizedError(
        `문화포털 ${serviceTp} 응답 오류:`,
        resultCode,
        xml.slice(
          0,
          2000
        )
      );

      sourceStatus.culturePortal =
        false;

      break;
    }


    if (
      xml.includes(
        "NO_OPENAPI_SERVICE_ERROR"
      ) ||
      xml.includes(
        "해당 오픈API 서비스가 없거나 폐기됨"
      )
    ) {
      logSanitizedError(
        `문화포털 ${serviceTp}: 서비스 없음/폐기`
      );

      logSanitizedError(
        xml.slice(
          0,
          2000
        )
      );

      sourceStatus.culturePortal =
        false;

      break;
    }


    if (
      xml.includes(
        "SERVICE_KEY_IS_NOT_REGISTERED_ERROR"
      ) ||
      xml.includes(
        "SERVICE_ACCESS_DENIED_ERROR"
      ) ||
      xml.includes(
        "DEADLINE_HAS_EXPIRED_ERROR"
      ) ||
      xml.includes(
        "LIMITED_NUMBER_OF_SERVICE_REQUESTS_EXCEEDS_ERROR"
      )
    ) {
      logSanitizedError(
        `문화포털 ${serviceTp}: 인증/호출 오류`
      );

      logSanitizedError(
        xml.slice(
          0,
          2000
        )
      );

      sourceStatus.culturePortal =
        false;

      break;
    }


    const blocks =
      extractXmlBlocks(
        xml
      );


    if (
      blocks.length === 0
    ) {
      const totalCount =
        xmlTotalCount(
          xml
        );


      if (
        totalCount === 0
      ) {
        break;
      }


      logSanitizedError(
        `문화포털 ${serviceTp}: XML 반복 데이터 블록을 찾지 못했습니다.`
      );

      logSanitizedError(
        xml.slice(
          0,
          2500
        )
      );

      sourceStatus.culturePortal =
        false;

      break;
    }


    let pageItemCount = 0;

    let filteredCount = 0;


    for (
      const block of blocks
    ) {
      const seq =
        xmlField(
          block,
          [
            "seq",
            "SEQ",
          ]
        );


      const title =
        xmlField(
          block,
          [
            "title",
            "TITLE",
          ]
        );


      const startRaw =
        xmlField(
          block,
          [
            "startDate",
          ]
        );


      const endRaw =
        xmlField(
          block,
          [
            "endDate",
          ]
        );


      const location =
        xmlField(
          block,
          [
            "place",
          ]
        );


      const realmName =
        xmlField(
          block,
          [
            "realmName",
          ]
        );


      const areaRaw =
        xmlField(
          block,
          [
            "area",
          ]
        );


      const sigungu =
        xmlField(
          block,
          [
            "sigungu",
          ]
        );


      const thumbnail =
        xmlField(
          block,
          [
            "thumbnail",
          ]
        );


      const latRaw =
        xmlField(
          block,
          [
            "gpsY",
          ]
        );


      const lonRaw =
        xmlField(
          block,
          [
            "gpsX",
          ]
        );


      const start =
        ymdToIso(
          startRaw
        );


      const end =
        fixReversedDateRange(
          start,
          ymdToIso(
            endRaw
          )
        );


      if (
        !title ||
        !start
      ) {
        continue;
      }


      if (
        isOver90Days(
          start,
          end
        )
      ) {
        continue;
      }


      // --------------------------------------------------
      // serviceTp별 관광성 필터
      // --------------------------------------------------

      if (
        !shouldKeepCulturePortalItem(
          serviceTp,
          title,
          realmName,
          location
        )
      ) {
        filteredCount += 1;

        continue;
      }


      const lat =
        latRaw !== "" &&
        !Number.isNaN(
          Number(
            latRaw
          )
        )
          ? Number(
              latRaw
            )
          : null;


      const lon =
        lonRaw !== "" &&
        !Number.isNaN(
          Number(
            lonRaw
          )
        )
          ? Number(
              lonRaw
            )
          : null;


      // A = 공연/전시 → 공연만 유지
      // B = 행사/축제 → 축제로 저장
      const type =
        serviceTp === "A"
          ? "performance"
          : "festival";


      const finalArea =
        areaRaw ||
        deriveAreaFromAddress(
          location,
          sigungu
        ) ||
        "";


      results.push({
        source:
          "culturePortal",

        type,

        id:
          seq
            ? `culture-portal-${serviceTp}-${seq}`
            : (
                `culture-portal-` +
                `${serviceTp}-` +
                `${normalizeTitle(title)}-` +
                `${start}`
              ),

        title,

        startDate:
          start,

        endDate:
          end,

        location:
          location ||
          "",

        area:
          normalizeAreaName(
            finalArea
          ),

        lat,

        lon,

        thumbnail:
          thumbnail ||
          null,

        detailUrl:
          null,

        genre:
          realmName ||
          null,
      });


      pageItemCount += 1;
    }


    console.log(
      `문화포털 ${serviceTp} ${pageNo}페이지 처리: ` +
      `${pageItemCount}건 유지, ` +
      `${filteredCount}건 제외`
    );


    const totalCount =
      xmlTotalCount(
        xml
      );


    if (
      blocks.length === 0 ||
      blocks.length < numOfRows ||
      (
        totalCount > 0 &&
        pageNo *
          numOfRows >=
          totalCount
      )
    ) {
      break;
    }


    pageNo += 1;
  }


  return results;
}


// ======================================================
// 문화포털 공연 + 행사/축제 수집
// ======================================================

async function fetchCulturePortalPerformances() {
  if (!CULTURE_PORTAL_API_KEY) {
    console.log(
      "CULTURE_PORTAL_API_KEY 없음 → 문화포털 건너뜀"
    );

    return [];
  }


  // ----------------------------------------------------
  // A = 공연/전시
  //
  // 전시를 제거하고 공연을 유지합니다.
  // 뮤지컬은 대공연장 화이트리스트 적용.
  // ----------------------------------------------------

  const performances =
    await fetchCulturePortalByServiceType(
      "A"
    );


  // ----------------------------------------------------
  // B = 행사/축제
  //
  // 축제/지역행사 등을 유지하고
  // 교육/체험/강좌/강연/연극 등은 제거합니다.
  // ----------------------------------------------------

  const festivals =
    await fetchCulturePortalByServiceType(
      "B"
    );


  const results = [
    ...performances,
    ...festivals,
  ];


  console.log(
    `문화포털에서 공연 ${performances.length}건, ` +
    `행사/축제 ${festivals.length}건 수집`
  );


  return results;
}


// ======================================================
// 4. KOPIS XML 파싱
// ======================================================

function parseKopisXml(
  xml
) {
  const items = [];

  const blocks =
    xml.match(
      /<db>[\s\S]*?<\/db>/g
    ) || [];


  for (
    const block of blocks
  ) {
    items.push({
      mt20id:
        xmlField(
          block,
          [
            "mt20id",
          ]
        ),

      prfnm:
        xmlField(
          block,
          [
            "prfnm",
          ]
        ),

      prfpdfrom:
        xmlField(
          block,
          [
            "prfpdfrom",
          ]
        ),

      prfpdto:
        xmlField(
          block,
          [
            "prfpdto",
          ]
        ),

      fcltynm:
        xmlField(
          block,
          [
            "fcltynm",
          ]
        ),

      poster:
        xmlField(
          block,
          [
            "poster",
          ]
        ),

      genrenm:
        xmlField(
          block,
          [
            "genrenm",
          ]
        ),

      area:
        xmlField(
          block,
          [
            "area",
          ]
        ),
    });
  }


  return items;
}


// ======================================================
// KOPIS 제외 장르
// ======================================================

const EXCLUDED_KOPIS_GENRES = [
  "연극",
  "서커스/마술",
  "무용(서양/한국무용)",
  "대중무용",
  // "서양음악(클래식)"과 "한국음악(국악)"은 더 이상 여기서
  // 통째로 제외하지 않는다. 클라이언트의 "제외 키워드" 기능
  // (js/storage.js의 DEFAULT_EXCLUDE_KEYWORDS)에서 기본으로
  // 꺼두되, 사용자가 원하면 다시 켤 수 있게 한다.
];


// ======================================================
// KOPIS 제외 제목
// ======================================================
//
// 예전에는 이 목록으로 서버에서 아예 걸러냈지만,
// 사용자가 앱에서 켜고 끌 수 있는 "제외 키워드" 기능으로
// 옮겨졌다 (js/storage.js의 DEFAULT_EXCLUDE_KEYWORDS 참고).
// 서버는 더 이상 제목 키워드로 걸러내지 않는다.


// ======================================================
// KOPIS 뮤지컬 공연장 화이트리스트
// ======================================================

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


function isKopisVenueWhitelisted(
  location
) {
  if (!location) {
    return false;
  }

  return VENUE_WHITELIST.some(
    (name) =>
      location.includes(
        name
      )
  );
}


// ======================================================
// KOPIS
// ======================================================

async function fetchKopisPerformances() {
  if (!KOPIS_API_KEY) {
    console.log(
      "KOPIS_API_KEY 없음 → KOPIS 건너뜀"
    );

    return [];
  }

  const results = [];
  const rows = 100;

  const overallStart =
    new Date();

  overallStart.setHours(
    0,
    0,
    0,
    0
  );

  const overallEnd =
    addMonths(
      overallStart,
      KOPIS_MONTHS_AHEAD
    );

  overallEnd.setHours(
    0,
    0,
    0,
    0
  );

  // KOPIS 목록 API의 조회 기간 제한은 최대 31일이다.
  // 시작일과 종료일을 모두 포함해 한 번에 최대 31일씩 나눈다.
  let windowStart =
    new Date(overallStart);

  let hasRequestFailure = false;

  while (
    windowStart <= overallEnd &&
    !hasRequestFailure
  ) {
    const windowEnd =
      new Date(windowStart);

    windowEnd.setDate(
      windowEnd.getDate() + 30
    );

    if (
      windowEnd > overallEnd
    ) {
      windowEnd.setTime(
        overallEnd.getTime()
      );
    }

    const stdate =
      dateToYYYYMMDD(
        windowStart
      );

    const eddate =
      dateToYYYYMMDD(
        windowEnd
      );

    console.log(
      `KOPIS 조회 구간: ${stdate} ~ ${eddate}`
    );

    let cpage = 1;

    while (true) {
      const url =
        new URL(
          KOPIS_BASE
        );

      url.searchParams.set(
        "service",
        KOPIS_API_KEY
      );

      url.searchParams.set(
        "stdate",
        stdate
      );

      url.searchParams.set(
        "eddate",
        eddate
      );

      url.searchParams.set(
        "cpage",
        String(cpage)
      );

      url.searchParams.set(
        "rows",
        String(rows)
      );

      let res;

      try {
        res =
          await fetchWithRetry(
            url
          );
      } catch (error) {
        logSanitizedError(
          "KOPIS 요청 예외:",
          error
        );

        sourceStatus.kopis =
          false;

        hasRequestFailure = true;

        break;
      }

      if (!res.ok) {
        logSanitizedError(
          "KOPIS 요청 실패:",
          res.status,
          (
            await res.text()
          ).slice(
            0,
            1000
          )
        );

        sourceStatus.kopis =
          false;

        hasRequestFailure = true;

        break;
      }

      const xml =
        await res.text();

      if (
        xml.includes(
          "SERVICE KEY IS NOT REGISTERED"
        )
      ) {
        logSanitizedError(
          "KOPIS 인증키가 등록되지 않았습니다."
        );

        sourceStatus.kopis =
          false;

        hasRequestFailure = true;

        break;
      }

      const list =
        parseKopisXml(
          xml
        );

      for (
        const item of list
      ) {
        if (
          !item.prfnm
        ) {
          continue;
        }

        if (
          EXCLUDED_KOPIS_GENRES.some(
            (genre) =>
              item.genrenm?.includes(
                genre
              )
          )
        ) {
          continue;
        }

        if (
          item.genrenm ===
            "뮤지컬" &&
          !isKopisVenueWhitelisted(
            item.fcltynm
          )
        ) {
          continue;
        }

        const start =
          kopisDateToIso(
            item.prfpdfrom
          );

        const end =
          fixReversedDateRange(
            start,
            kopisDateToIso(
              item.prfpdto
            )
          );

        if (
          !start
        ) {
          continue;
        }

        if (
          isOver90Days(
            start,
            end
          )
        ) {
          continue;
        }

        results.push({
          source:
            "kopis",

          type:
            item.genrenm?.includes(
              "축제"
            )
              ? "festival"
              : "performance",

          id:
            `kopis-${item.mt20id}`,

          title:
            item.prfnm,

          startDate:
            start,

          endDate:
            end,

          location:
            item.fcltynm ||
            "",

          area:
            normalizeAreaName(
              item.area
            ),

          lat:
            null,

          lon:
            null,

          thumbnail:
            item.poster ||
            null,

          detailUrl:
            item.mt20id
              ? (
                  "https://www.kopis.or.kr/por/db/pblprfr/" +
                  `pblprfrView.do?mt20Id=${item.mt20id}`
                )
              : null,

          genre:
            item.genrenm ||
            null,
        });
      }

      if (
        list.length < rows
      ) {
        break;
      }

      cpage += 1;
    }

    if (hasRequestFailure) {
      break;
    }

    // 다음 조회 구간은 직전 종료일의 다음 날부터 시작한다.
    windowStart =
      new Date(windowEnd);

    windowStart.setDate(
      windowStart.getDate() + 1
    );
  }

  console.log(
    `KOPIS에서 ${results.length}건 수집`
  );

  return results;
}


// ======================================================
// 장소 차이 판별
// ======================================================

function hasValidCoordinatePair(
  item
) {
  if (
    item?.lat === null ||
    item?.lat === undefined ||
    item?.lat === "" ||
    item?.lon === null ||
    item?.lon === undefined ||
    item?.lon === ""
  ) {
    return false;
  }

  const lat = Number(item.lat);
  const lon = Number(item.lon);

  return (
    Number.isFinite(lat) &&
    Number.isFinite(lon) &&
    lat >= -90 &&
    lat <= 90 &&
    lon >= -180 &&
    lon <= 180
  );
}


// ======================================================
// 장소 차이 판별
// ======================================================

function locationsClearlyDifferent(
  a,
  b
) {
  const areaA =
    normalizeAreaName(
      a.area
    );

  const areaB =
    normalizeAreaName(
      b.area
    );

  if (
    areaA &&
    areaB &&
    areaA !== areaB
  ) {
    return true;
  }

  // 좌표가 1.5km 이상 다르면 별도 행사로 보존한다.
  // 잘못된 병합으로 독립 행사가 사라지는 것보다 중복이 안전하다.
  if (
    hasValidCoordinatePair(a) &&
    hasValidCoordinatePair(b)
  ) {
    const distance =
      distanceMeters(
        Number(a.lat),
        Number(a.lon),
        Number(b.lat),
        Number(b.lon)
      );

    if (
      distance !== null &&
      distance > 1500
    ) {
      return true;
    }
  }

  return false;
}


// ======================================================
// 출처 우선순위
// ======================================================

function sourcePriority(
  item
) {
  switch (
    item.source
  ) {
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


// ======================================================
// 데이터 풍부함
// ======================================================

function dataRichness(
  item
) {
  let score = 0;


  if (
    item.location
  ) {
    score += 2;
  }


  if (
    item.area
  ) {
    score += 1;
  }


  if (
    item.endDate
  ) {
    score += 1;
  }


  if (
    item.thumbnail
  ) {
    score += 2;
  }


  if (
    item.detailUrl
  ) {
    score += 1;
  }


  if (
    item.genre
  ) {
    score += 1;
  }


  if (
    hasValidCoordinatePair(item)
  ) {
    score += 2;
  }


  return score;
}


// ======================================================
// 필드 단위 병합
// ======================================================
//
// base: 대표로 남길 레코드
// other: base에 없는 필드만 보충해줄 레코드
//
// 정체성 필드:
// id / title / startDate
// → base 것을 유지
//
// 보완 가능 필드:
// location / area / lat / lon / thumbnail / detailUrl
// genre / endDate
// ======================================================

function mergeRecords(
  base,
  other
) {
  const merged = {
    ...base,
  };

  const fillableFields = [
    "location",
    "area",
    "thumbnail",
    "detailUrl",
    "genre",
    "endDate",
  ];

  for (
    const field of fillableFields
  ) {
    const baseEmpty =
      merged[field] === null ||
      merged[field] === undefined ||
      merged[field] === "";

    if (
      baseEmpty &&
      other[field]
    ) {
      merged[field] =
        other[field];
    }
  }

  // 위도와 경도는 서로 다른 출처에서 한쪽씩 섞지 않고 한 쌍으로 병합한다.
  if (
    !hasValidCoordinatePair(merged) &&
    hasValidCoordinatePair(other)
  ) {
    merged.lat = other.lat;
    merged.lon = other.lon;
  }

  return merged;
}


// ======================================================
// 좌표 간 거리 (m)
// ======================================================

function distanceMeters(
  lat1,
  lon1,
  lat2,
  lon2
) {
  if (
    lat1 === null || lat1 === undefined ||
    lon1 === null || lon1 === undefined ||
    lat2 === null || lat2 === undefined ||
    lon2 === null || lon2 === undefined
  ) {
    return null;
  }

  const R = 6371000;

  const toRad =
    (d) =>
      (d * Math.PI) / 180;

  const dLat =
    toRad(
      lat2 - lat1
    );

  const dLon =
    toRad(
      lon2 - lon1
    );

  const a =
    Math.sin(
      dLat / 2
    ) ** 2 +
    Math.cos(
      toRad(lat1)
    ) *
      Math.cos(
        toRad(lat2)
      ) *
      Math.sin(
        dLon / 2
      ) ** 2;

  const c =
    2 *
    Math.atan2(
      Math.sqrt(a),
      Math.sqrt(1 - a)
    );

  return R * c;
}


// ======================================================
// 날짜 겹침 판별
// ======================================================

function datesOverlap(
  aStart,
  aEnd,
  bStart,
  bEnd
) {
  if (!aStart || !bStart) {
    return false;
  }

  const aEndResolved =
    aEnd || aStart;

  const bEndResolved =
    bEnd || bStart;

  return (
    aStart <= bEndResolved &&
    bStart <= aEndResolved
  );
}


// ======================================================
// 2차 중복 후보 탐지
// ======================================================
//
// 자동 병합하지 않고 로그만 남김
//
// 기준:
//   제목 정규화 동일
//   +
//   날짜 겹침
//   +
//   좌표 500m 이내
//
// 1차(제목+시작일+종료일 완전 일치)에서
// 걸러지지 않은 것들만 대상.
//
// 서로 다른 행사(예: 본행사 vs 전야제/부속행사)를
// 잘못 합치는 것을 막기 위해 여기서는
// 삭제/병합하지 않고 확인용으로만 출력합니다.
// ======================================================

function logDuplicateCandidates(
  list
) {
  const byTitle =
    new Map();


  for (
    const item of list
  ) {
    const titleKey =
      normalizeTitle(
        item.title
      );

    if (!titleKey) {
      continue;
    }

    if (
      !byTitle.has(
        titleKey
      )
    ) {
      byTitle.set(
        titleKey,
        []
      );
    }

    byTitle
      .get(
        titleKey
      )
      .push(
        item
      );
  }


  const candidates = [];


  for (
    const items of
      byTitle.values()
  ) {
    if (
      items.length < 2
    ) {
      continue;
    }


    for (
      let i = 0;
      i < items.length;
      i += 1
    ) {
      for (
        let j = i + 1;
        j < items.length;
        j += 1
      ) {
        const a =
          items[i];

        const b =
          items[j];


        // 이미 1차에서 병합된
        // 완전 일치 쌍은 제외
        if (
          a.startDate ===
            b.startDate &&
          a.endDate ===
            b.endDate
        ) {
          continue;
        }


        if (
          !datesOverlap(
            a.startDate,
            a.endDate,
            b.startDate,
            b.endDate
          )
        ) {
          continue;
        }


        const dist =
          distanceMeters(
            a.lat,
            a.lon,
            b.lat,
            b.lon
          );


        if (
          dist !== null &&
          dist <= 500
        ) {
          candidates.push({
            a,
            b,
            dist,
          });
        }
      }
    }
  }


  if (
    candidates.length > 0
  ) {
    console.log(
      `중복 후보(수동 확인 필요) ${candidates.length}건:`
    );


    for (
      const {
        a,
        b,
        dist,
      } of candidates
    ) {
      console.log(
        `  - "${a.title}" ` +
        `(${a.source}, ${a.startDate}~${a.endDate}) ` +
        `↔ "${b.title}" ` +
        `(${b.source}, ${b.startDate}~${b.endDate}) ` +
        `[${Math.round(dist)}m]`
      );
    }
  }


  return candidates;
}


// ======================================================
// 충돌하는 행사 ID 보정
// ======================================================
// 정상적으로 하나만 존재하는 ID는 그대로 유지해
// 기존 브라우저의 찜/숨김 설정과 호환되게 한다.
// 실제로 서로 다른 행사에 같은 ID가 배정된 경우에만
// 추가 항목에 지역/장소 식별자를 붙인다.

function ensureUniqueIds(
  list
) {
  const usedIds = new Set();

  for (const item of list) {
    const originalId =
      String(item.id || "").trim();

    if (!originalId) {
      continue;
    }

    if (!usedIds.has(originalId)) {
      usedIds.add(originalId);
      continue;
    }

    const locationKey =
      normalizeTitle(
        [
          item.area,
          item.location,
        ]
          .filter(Boolean)
          .join(" ")
      ) ||
      normalizeTitle(item.source || "") ||
      "duplicate";

    const baseCandidate =
      `${originalId}-${locationKey}`;

    let candidate = baseCandidate;
    let suffix = 2;

    while (usedIds.has(candidate)) {
      candidate =
        `${baseCandidate}-${suffix}`;
      suffix += 1;
    }

    item.id = candidate;
    usedIds.add(candidate);
  }

  return list;
}


// ======================================================
// 중복 제거
// ======================================================

function dedupe(
  list
) {
  const groups =
    new Map();


  for (
    const item of list
  ) {
    const titleKey =
      normalizeTitle(
        item.title
      );


    if (
      !titleKey ||
      !item.startDate
    ) {
      continue;
    }


    const key =
      `${titleKey}__${item.startDate}__${item.endDate || ""}`;


    if (
      !groups.has(
        key
      )
    ) {
      groups.set(
        key,
        []
      );
    }


    groups
      .get(key)
      .push(
        item
      );
  }


  const result = [];

  let duplicateRemoved =
    0;


  for (
    const items of
      groups.values()
  ) {
    const kept = [];


    for (
      const item of items
    ) {
      let merged =
        false;


      for (
        let i = 0;
        i < kept.length;
        i += 1
      ) {
        const existing =
          kept[i];


        if (
          locationsClearlyDifferent(
            existing,
            item
          )
        ) {
          continue;
        }


        const existingPriority =
          sourcePriority(
            existing
          );


        const itemPriority =
          sourcePriority(
            item
          );


        const existingRichness =
          dataRichness(
            existing
          );


        const itemRichness =
          dataRichness(
            item
          );


        const itemWins =
          itemPriority >
            existingPriority ||
          (
            itemPriority ===
              existingPriority &&
            itemRichness >
              existingRichness
          );


        // 통째 교체 대신 필드 단위 병합
        kept[i] =
          mergeRecords(
            itemWins
              ? item
              : existing,
            itemWins
              ? existing
              : item
          );


        duplicateRemoved +=
          1;


        merged =
          true;


        break;
      }


      if (!merged) {
        kept.push(
          item
        );
      }
    }


    result.push(
      ...kept
    );
  }


  // 중복 정리 후에도 같은 ID가 남은 별도 행사는 각각 고유 ID를 갖게 한다.
  ensureUniqueIds(result);

  console.log(
    `중복 제거: ${list.length}건 → ${result.length}건 ` +
    `(중복 ${duplicateRemoved}건 제거)`
  );


  // 확정 병합 후 남은 데이터에서
  // "제목 같고 날짜 겹치고 좌표 근접"인 후보를
  // 찾아 로그로만 남긴다.
  logDuplicateCandidates(
    result
  );


  return result;
}


// ======================================================
// 출처별 통계
// ======================================================

function printSourceStats(
  label,
  list
) {
  const counts = {
    tourapi: 0,
    culture: 0,
    culturePortal: 0,
    kopis: 0,
  };


  for (
    const item of list
  ) {
    if (
      counts[item.source] !==
      undefined
    ) {
      counts[item.source] +=
        1;
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


// ======================================================
// 타입별 통계
// ======================================================

function printTypeStats(
  label,
  list
) {
  let festivals = 0;
  let performances = 0;


  for (
    const item of list
  ) {
    if (
      item.type ===
      "festival"
    ) {
      festivals += 1;
    }

    if (
      item.type ===
      "performance"
    ) {
      performances += 1;
    }
  }


  console.log(
    `${label} 유형별:` +
    ` 축제/행사=${festivals},` +
    ` 공연=${performances}`
  );
}


// ======================================================
// 메인
// ======================================================

async function main() {
  const requiredApiKeys = [
    ["TOUR_API_KEY", TOUR_API_KEY],
    ["CULTURE_API_KEY", CULTURE_API_KEY],
    ["CULTURE_PORTAL_API_KEY", CULTURE_PORTAL_API_KEY],
    ["KOPIS_API_KEY", KOPIS_API_KEY],
  ];

  const missingApiKeys = requiredApiKeys
    .filter(([, value]) =>
      !String(value || "").trim()
    )
    .map(([name]) => name);

  if (
    process.env.GITHUB_ACTIONS === "true" &&
    missingApiKeys.length > 0
  ) {
    logSanitizedError(
      `GitHub Actions 필수 API 키 누락: ${missingApiKeys.join(", ")} → 기존 festivals.json을 유지합니다.`
    );
    process.exitCode = 1;
    return;
  }

  const sourceByApiKey = {
    TOUR_API_KEY: "tourapi",
    CULTURE_API_KEY: "culture",
    CULTURE_PORTAL_API_KEY: "culturePortal",
    KOPIS_API_KEY: "kopis",
  };

  // 로컬 수집에서 키가 빠진 출처는 실패가 아니라 미수집으로 표시한다.
  // 앱은 부분 데이터임을 알리고 저장 상태를 자동 정리하지 않는다.
  for (const [apiKeyName] of missingApiKeys) {
    const source = sourceByApiKey[apiKeyName];

    if (source) {
      sourceStatus[source] = "skipped";
    }
  }

  const [
    tourItems,
    cultureItems,
    culturePortalItems,
    kopisItems,
  ] =
    await Promise.all([
      fetchTourApiFestivals(),
      fetchCultureStandardFestivals(),
      fetchCulturePortalPerformances(),
      fetchKopisPerformances(),
    ]);


    // 하나 이상의 핵심 데이터 소스가 실패한 경우
  // 빈 결과로 기존 festivals.json을 덮어쓰지 않습니다.
  // 일시적인 API timeout으로 기존 정상 데이터가 사라지는 것을 방지합니다.
  const failedSources = Object.entries(sourceStatus)
    .filter(([, ok]) => ok === false)
    .map(([source]) => source);

  if (failedSources.length > 0) {
    logSanitizedError(
      `데이터 소스 ${failedSources.join(', ')} 실패 → 기존 festivals.json을 유지합니다.`
    );
    process.exitCode = 1;
    return;
  }

  const allItems = [
    ...tourItems,
    ...cultureItems,
    ...culturePortalItems,
    ...kopisItems,
  ];


  printSourceStats(
    "수집 완료",
    allItems
  );


  printTypeStats(
    "수집 완료",
    allItems
  );


  let merged =
    dedupe(
      allItems
    );


  merged =
    merged
      .filter(
        (item) =>
          item.startDate
      )
      .sort(
        (a, b) =>
          a.startDate.localeCompare(
            b.startDate
          )
      );

  if (merged.length === 0) {
    logSanitizedError(
      "수집 및 정리 결과가 0건입니다. 기존 festivals.json을 유지합니다."
    );
    process.exitCode = 1;
    return;
  }


  printSourceStats(
    "최종 데이터",
    merged
  );


  printTypeStats(
    "최종 데이터",
    merged
  );


  const payload = {
    updatedAt:
      new Date().toISOString(),

    count:
      merged.length,

    sourceStatus,

    festivals:
      merged,
  };


  await writeFile(
    "festivals.json",
    JSON.stringify(
      payload,
      null,
      2
    ),
    "utf-8"
  );


  console.log(
    `총 ${merged.length}건 저장 완료 → festivals.json`
  );
}


// ======================================================
// 실행
// ======================================================

main().catch(
  (error) => {
    logSanitizedError(
      error
    );

    process.exit(
      1
    );
  }
);
