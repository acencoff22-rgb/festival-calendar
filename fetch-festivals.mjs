/**
 * 전국 축제·공연 데이터를 TourAPI, 전국문화축제 표준데이터, KOPIS에서 수집합니다.
 * 일부 소스 실패 또는 0건 수집 시 기존 festivals.json을 유지합니다.
 * 실행: node fetch-festivals.mjs
 * 자체 테스트: node fetch-festivals.mjs --self-test
 * 필수 키: TOUR_API_KEY, CULTURE_API_KEY, KOPIS_API_KEY
 */
import { readFile, writeFile, rename } from "fs/promises";


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
  { retries = 2, delayMs = 1500 } = {}
) {
  const retryableStatuses = new Set([408, 425, 429, 500, 502, 503, 504]);
  let lastError;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const response = await fetch(url);
      if (response.ok || !retryableStatuses.has(response.status) || attempt === retries) {
        return response;
      }
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }

    if (attempt < retries) {
      const waitMs = delayMs * (attempt + 1);
      console.error(`요청 실패(${lastError?.message || lastError}), 재시도 ${attempt + 1}/${retries} (${waitMs}ms 후)`);
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
  }
  throw lastError || new Error("API 요청 실패");
}


// ======================================================
// 환경변수
function normalizeApiKey(value) {
  const key = String(value || "").trim();
  if (/%[0-9a-f]{2}/i.test(key)) {
    try { return decodeURIComponent(key); }
    catch (error) { console.warn("API 키 URL 디코딩 실패: 원문을 사용합니다."); }
  }
  return key;
}

const TOUR_API_KEY = normalizeApiKey(process.env.TOUR_API_KEY);
const CULTURE_API_KEY = normalizeApiKey(process.env.CULTURE_API_KEY);
const KOPIS_API_KEY = normalizeApiKey(process.env.KOPIS_API_KEY);


// ======================================================

const sourceStatus = {
  tourapi: false,
  culture: false,
  kopis: false,
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


// KOPIS
const KOPIS_BASE =
  "https://www.kopis.or.kr/openApi/restful/pblprfr";


// ======================================================
// 수집 기간
// ======================================================

const KOPIS_MONTHS_AHEAD = 3;


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

  d.setMonth(
    d.getMonth() + months
  );

  return d;
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
  const todayIso = ymdToIso(todayYYYYMMDD());
  const lookbackStart = new Date();
  lookbackStart.setDate(lookbackStart.getDate() - 90);


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
      dateToYYYYMMDD(lookbackStart)
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
      console.error(
        "TourAPI 요청 예외:",
        error
      );

      sourceStatus.tourapi =
        false;

      break;
    }


    if (!res.ok) {
      console.error(
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
      console.error(
        "TourAPI JSON 파싱 실패:",
        error
      );

      sourceStatus.tourapi =
        false;

      break;
    }


    const resultCode = String(
      json?.response?.header?.resultCode ?? ""
    ).trim();

    if (!["0000", "00", "0"].includes(resultCode)) {
      console.error("TourAPI 응답 코드 오류:", resultCode || "(코드 없음)", JSON.stringify(json).slice(0, 1500));
      sourceStatus.tourapi = false;
      break;
    }

    sourceStatus.tourapi = true;

    const body =
      json?.response?.body;

    if (!body) {
      console.error(
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
        ymdToIso(
          item.eventenddate
        );


      if (
        !item.title ||
        !start
      ) {
        continue;
      }


      if (
        isOver90Days(start, end)
      ) {
        continue;
      }

      if ((end && end < todayIso) || (!end && start < todayIso)) {
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


    if (
      list.length === 0 ||
      pageNo *
        numOfRows >=
        totalCount
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
      console.error(
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

      console.error(
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
      console.error(
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
      String(header.resultCode ?? "").trim();


    if (
      resultCode !== "00" &&
      resultCode !== "0"
    ) {
      console.error(
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


    sourceStatus.culture = true;

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
            sido ||
            sigungu ||
            ""
          ) ||
          deriveAreaFromAddress(
            address,
            jibunAddress,
            location
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
// 3. KOPIS XML 파싱
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

function buildDateWindows(startDate, endDate, maxDateDifferenceDays = 30) {
  if (!(startDate instanceof Date) || !(endDate instanceof Date) ||
      Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime()) ||
      maxDateDifferenceDays < 1) {
    throw new Error("잘못된 KOPIS 날짜 범위입니다.");
  }

  const cursor = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
  const lastDate = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate());
  if (cursor > lastDate) throw new Error("KOPIS 시작일은 종료일보다 늦을 수 없습니다.");

  const windows = [];
  while (cursor <= lastDate) {
    const windowEnd = new Date(cursor);
    windowEnd.setDate(windowEnd.getDate() + maxDateDifferenceDays);
    if (windowEnd > lastDate) windowEnd.setTime(lastDate.getTime());

    windows.push({ stdate: dateToYYYYMMDD(cursor), eddate: dateToYYYYMMDD(windowEnd) });
    cursor.setTime(windowEnd.getTime());
    cursor.setDate(cursor.getDate() + 1);
  }
  return windows;
}


async function fetchKopisPerformances() {
  if (!KOPIS_API_KEY) {
    console.error("KOPIS_API_KEY 없음 → 수집 중단");
    sourceStatus.kopis = false;
    return [];
  }

  const results = [];
  const rows = 100;
  const dateWindows = buildDateWindows(new Date(), addMonths(new Date(), KOPIS_MONTHS_AHEAD), 30);

  for (const window of dateWindows) {
    let cpage = 1;
    while (true) {
      const url = new URL(KOPIS_BASE);
      url.searchParams.set("service", KOPIS_API_KEY);
      url.searchParams.set("stdate", window.stdate);
      url.searchParams.set("eddate", window.eddate);
      url.searchParams.set("cpage", String(cpage));
      url.searchParams.set("rows", String(rows));

      let res;
      try {
        res = await fetchWithRetry(url);
      } catch (error) {
        console.error("KOPIS 요청 예외:", error);
        sourceStatus.kopis = false;
        return [];
      }

      if (!res.ok) {
        console.error("KOPIS 요청 실패:", res.status, (await res.text()).slice(0, 1000));
        sourceStatus.kopis = false;
        return [];
      }

      const xml = await res.text();
      if (!xml.trim() || /<err(?:or)?\b/i.test(xml) ||
          /service key is not registered|service access denied|request limit/i.test(xml) ||
          !/<dbs?\b/i.test(xml)) {
        console.error("KOPIS 응답 형식 또는 인증 오류:", xml.slice(0, 1500));
        sourceStatus.kopis = false;
        return [];
      }

      const list = parseKopisXml(xml);
      for (const item of list) {
        if (!item.prfnm) continue;
        if (EXCLUDED_KOPIS_GENRES.some((genre) => item.genrenm?.includes(genre))) continue;
        if (item.genrenm === "뮤지컬" && !isKopisVenueWhitelisted(item.fcltynm)) continue;

        const startDate = kopisDateToIso(item.prfpdfrom);
        const endDate = kopisDateToIso(item.prfpdto);
        if (!startDate || isOver90Days(startDate, endDate)) continue;

        results.push({
          source: "kopis",
          type: item.genrenm?.includes("축제") ? "festival" : "performance",
          id: `kopis-${item.mt20id}`,
          title: item.prfnm,
          startDate,
          endDate,
          location: item.fcltynm || "",
          area: normalizeAreaName(item.area),
          lat: null,
          lon: null,
          thumbnail: item.poster || null,
          detailUrl: item.mt20id
            ? ("https://www.kopis.or.kr/por/db/pblprfr/" +
              `pblprfrView.do?mt20Id=${item.mt20id}`)
            : null,
          genre: item.genrenm || null,
        });
      }

      if (list.length < rows) break;
      cpage += 1;
    }
  }

  sourceStatus.kopis = true;
  console.log(`KOPIS ${dateWindows.length}개 기간에서 ${results.length}건 수집`);
  return results;
}


// ======================================================
// 장소 차이 판별
// ======================================================

function locationsClearlyDifferent(
  a,
  b
) {
  const locationA =
    String(
      a.location || ""
    ).trim();


  const locationB =
    String(
      b.location || ""
    ).trim();


  if (
    !locationA ||
    !locationB
  ) {
    return false;
  }


  if (
    locationA ===
    locationB
  ) {
    return false;
  }


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
    item.lat !== null &&
    item.lat !== undefined
  ) {
    score += 1;
  }


  if (
    item.lon !== null &&
    item.lon !== undefined
  ) {
    score += 1;
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
    "lat",
    "lon",
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


function runSelfTests() {
  if (normalizeApiKey("abc%2Bdef%3D") !== "abc+def=") throw new Error("API 키 디코딩 실패");
  if (normalizeApiKey("plain+key") !== "plain+key") throw new Error("평문 API 키 처리 실패");

  const windows = buildDateWindows(new Date(2026, 10, 1), new Date(2027, 1, 15), 30);
  if (windows.length < 3) throw new Error("KOPIS 기간 분할 실패");

  for (let i = 0; i < windows.length; i += 1) {
    const toUtc = (value) => Date.UTC(
      Number(value.slice(0, 4)),
      Number(value.slice(4, 6)) - 1,
      Number(value.slice(6, 8))
    );
    const start = toUtc(windows[i].stdate);
    const end = toUtc(windows[i].eddate);
    if ((end - start) / 86400000 > 30) throw new Error("KOPIS 31일 제한 초과");
    if (i > 0 && start - toUtc(windows[i - 1].eddate) !== 86400000) {
      throw new Error("KOPIS 기간 사이 누락 또는 중복");
    }
  }

  const xml = "<dbs><db><mt20id>PF123</mt20id><prfnm>테스트 공연</prfnm><prfpdfrom>2026.11.01</prfpdfrom><prfpdto>2026.11.02</prfpdto><fcltynm>테스트홀</fcltynm><genrenm>복합</genrenm><area>서울</area></db></dbs>";
  const parsed = parseKopisXml(xml);
  if (parsed.length !== 1 || parsed[0].mt20id !== "PF123" || parsed[0].prfnm !== "테스트 공연") {
    throw new Error("KOPIS XML 파싱 실패");
  }
  if (parseKopisXml("<dbs></dbs>").length !== 0) throw new Error("KOPIS 빈 XML 처리 실패");
  if (!/<dbs?\b/i.test("<dbs></dbs>")) {
    throw new Error("KOPIS 응답 루트 태그 검사 실패");
  }
  if (!/<err(?:or)?\b/i.test("<error>invalid</error>")) {
    throw new Error("KOPIS 오류 응답 태그 검사 실패");
  }

  console.log("수집기 자체 테스트 통과");
}


// ======================================================
// 메인
// ======================================================

async function main() {
  const required = [
    ["TOUR_API_KEY", TOUR_API_KEY],
    ["CULTURE_API_KEY", CULTURE_API_KEY],
    ["KOPIS_API_KEY", KOPIS_API_KEY],
  ];
  const missing = required.filter(([, value]) => !value).map(([name]) => name);
  if (missing.length) throw new Error(`필수 API 키 누락: ${missing.join(", ")}. 기존 festivals.json 유지`);

  const [tourItems, cultureItems, kopisItems] = await Promise.all([
    fetchTourApiFestivals(),
    fetchCultureStandardFestivals(),
    fetchKopisPerformances(),
  ]);

  const failed = Object.entries(sourceStatus).filter(([, ok]) => ok !== true).map(([name]) => name);
  if (failed.length) {
    console.error(`소스 실패: ${failed.join(", ")} → 기존 파일 유지`);
    process.exitCode = 1;
    return;
  }

  const empty = [["tourapi", tourItems], ["culture", cultureItems], ["kopis", kopisItems]]
    .filter(([, items]) => !Array.isArray(items) || items.length === 0)
    .map(([name]) => name);
  if (empty.length) {
    console.error(`수집 결과 0건: ${empty.join(", ")} → 기존 파일 유지`);
    process.exitCode = 1;
    return;
  }

  const allItems = [...tourItems, ...cultureItems, ...kopisItems];
  printSourceStats("수집 완료", allItems);
  printTypeStats("수집 완료", allItems);

  let merged = dedupe(allItems);
  merged = merged.filter((item) => item.startDate)
    .sort((a, b) => a.startDate.localeCompare(b.startDate));

  if (!merged.length) {
    console.error("최종 데이터 0건 → 기존 파일 유지");
    process.exitCode = 1;
    return;
  }

  let previousCount = null;
  try {
    const previous = JSON.parse(await readFile("festivals.json", "utf8"));
    const previousRows = Array.isArray(previous) ? previous : previous?.festivals;
    if (!Array.isArray(previousRows) || previousRows.length === 0) {
      throw new Error("기존 festivals.json 데이터 구조 오류. 덮어쓰지 않습니다.");
    }
    previousCount = previousRows.length;
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }

  if (previousCount !== null && merged.length < Math.floor(previousCount * 0.7)) {
    console.error(`기존 ${previousCount}건 대비 신규 ${merged.length}건(70% 미만) → 기존 파일 유지`);
    process.exitCode = 1;
    return;
  }

  printSourceStats("최종 데이터", merged);
  printTypeStats("최종 데이터", merged);

  const payload = {
    updatedAt: new Date().toISOString(),
    count: merged.length,
    sourceStatus,
    festivals: merged,
  };

  const temporaryPath = "festivals.json.tmp";
  await writeFile(temporaryPath, JSON.stringify(payload, null, 2) + "\n", "utf-8");
  await rename(temporaryPath, "festivals.json");
  console.log(`총 ${merged.length}건 저장 완료 → festivals.json`);
}


// ======================================================
// 실행
// ======================================================

if (process.argv.includes("--self-test")) {
  runSelfTests();
} else {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
