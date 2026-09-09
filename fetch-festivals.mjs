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
 * API 키가 없는 소스는 건너뜁니다.
 */


import { writeFile } from "fs/promises";


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
    .replace(/\s+/g, "")
    .replace(/[^\p{L}\p{N}]/gu, "")
    .trim()
    .toLowerCase();
}


// ======================================================
// 지역명 정규화
// ======================================================

function normalizeAreaName(raw) {
  if (!raw) {
    return null;
  }

  let name =
    String(raw).trim();

  const suffixes = [
    "특별자치시",
    "특별자치도",
    "광역시",
    "특별시",
    "자치도",
    "도",
  ];

  for (const suffix of suffixes) {
    if (name.endsWith(suffix)) {
      name =
        name.slice(
          0,
          -suffix.length
        );

      break;
    }
  }

  return (
    name ||
    String(raw).trim()
  );
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
        await fetch(
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
          ] || null,

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
        await fetch(
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
      String(
        header.resultCode ??
        "00"
      );


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
        ymdToIso(
          row?.fstvlEndDate ??
          row?.["축제종료일자"] ??
          ""
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
          `culture-${normalizeTitle(title)}-${start}`,

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
// End Point:
//   https://apis.data.go.kr/B553457/cultureinfo
//
// 기간별 문화정보목록조회:
//   GET /period2
//
// serviceTp:
//   A = 공연/전시
//   B = 행사/축제
//   C = 교육/체험
//
// 현재 앱에서는 A/B만 수집
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
        await fetch(
          url
        );
    } catch (error) {
      console.error(
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
      console.error(
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
      console.error(
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
      console.error(
        `문화포털 ${serviceTp}: 서비스 없음/폐기`
      );

      console.error(
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
      console.error(
        `문화포털 ${serviceTp}: 인증/호출 오류`
      );

      console.error(
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
      // 정상적인 0건 응답일 가능성이 있으므로
      // resultCode가 정상이라면 해당 서비스만 종료
      const totalCount =
        xmlTotalCount(
          xml
        );


      if (
        totalCount === 0
      ) {
        break;
      }


      console.error(
        `문화포털 ${serviceTp}: XML 반복 데이터 블록을 찾지 못했습니다.`
      );

      console.error(
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
        ymdToIso(
          endRaw
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


      // A = 공연/전시
      // B = 행사/축제
      const type =
        serviceTp === "B"
          ? "festival"
          : "performance";


      const finalArea =
        areaRaw ||
        sigungu ||
        "";


      results.push({
        source:
          "culturePortal",

        type,

        id:
          seq
            ? `culture-portal-${seq}`
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
      `문화포털 ${serviceTp} ${pageNo}페이지 처리: ${pageItemCount}건`
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


async function fetchCulturePortalPerformances() {
  if (!CULTURE_PORTAL_API_KEY) {
    console.log(
      "CULTURE_PORTAL_API_KEY 없음 → 문화포털 건너뜀"
    );

    return [];
  }


  const results = [];


  // A = 공연/전시
  const performances =
    await fetchCulturePortalByServiceType(
      "A"
    );


  // B = 행사/축제
  const festivals =
    sourceStatus.culturePortal
      ? await fetchCulturePortalByServiceType(
          "B"
        )
      : [];


  results.push(
    ...performances
  );

  results.push(
    ...festivals
  );


  console.log(
    `문화포털에서 ${results.length}건 수집`
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
  "서양음악(클래식)",
  "한국음악(국악)",
  "서커스/마술",
  "무용(서양/한국무용)",
  "대중무용",
];


// ======================================================
// KOPIS 제외 제목
// ======================================================

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
  "황금거위",
  "아기양",
  "잠자는숲속의공주",
  "잠자는 숲속의 공주",
];


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


function isVenueWhitelisted(
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

  let cpage = 1;

  const rows = 100;


  const stdate =
    dateToYYYYMMDD(
      new Date()
    );


  const eddate =
    dateToYYYYMMDD(
      addMonths(
        new Date(),
        KOPIS_MONTHS_AHEAD
      )
    );


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
        await fetch(
          url
        );
    } catch (error) {
      console.error(
        "KOPIS 요청 예외:",
        error
      );

      sourceStatus.kopis =
        false;

      break;
    }


    if (!res.ok) {
      console.error(
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

      break;
    }


    const xml =
      await res.text();


    if (
      xml.includes(
        "SERVICE KEY IS NOT REGISTERED"
      )
    ) {
      console.error(
        "KOPIS 인증키가 등록되지 않았습니다."
      );

      sourceStatus.kopis =
        false;

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
        EXCLUDED_TITLE_KEYWORDS.some(
          (keyword) =>
            item.prfnm?.includes(
              keyword
            )
        )
      ) {
        continue;
      }


      if (
        item.genrenm ===
          "뮤지컬" &&
        !isVenueWhitelisted(
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
        kopisDateToIso(
          item.prfpdto
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


  console.log(
    `KOPIS에서 ${results.length}건 수집`
  );

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
      `${titleKey}__${item.startDate}`;


    if (
      !groups.has(key)
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


        if (
          itemPriority >
            existingPriority ||
          (
            itemPriority ===
              existingPriority &&
            itemRichness >
              existingRichness
          )
        ) {
          kept[i] =
            item;
        }


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
// 메인
// ======================================================

async function main() {
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


  printSourceStats(
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
    console.error(
      error
    );

    process.exit(
      1
    );
  }
);
