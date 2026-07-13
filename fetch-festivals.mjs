/**
 * 전국 축제 + 공연 정보를 세 곳에서 가져와 하나의 JSON으로 합칩니다.
 *  1) 한국관광공사 TourAPI (KorService2 / searchFestival2)       → 지역축제 위주
 *  2) 한국문화정보원 전국문화축제 표준데이터 (공공데이터포털)      → 지역축제 위주
 *  3) 예술경영지원센터 KOPIS 공연예술통합전산망 (공연목록조회)     → 공연/뮤지컬/대중음악/축제 카테고리 포함
 *  4) 기상청 단기예보 (오늘~모레, 지역별 대표 좌표 기준)          → 임박 일정에만 날씨 배지 부착
 *
 * 실행: node scripts/fetch-festivals.mjs
 * 필요 환경변수:
 *   TOUR_API_KEY    - data.go.kr "한국관광공사_국문 관광정보 서비스_GW" 인증키 (Decoding)
 *   CULTURE_API_KEY - data.go.kr "전국문화축제 표준데이터" 인증키 (Decoding)
 *   KOPIS_API_KEY   - kopis.or.kr에서 발급받은 Open API 서비스키
 *   KMA_API_KEY     - data.go.kr "기상청_단기예보 조회서비스" 인증키 (Decoding)
 *
 * 넷 중 일부만 있어도 동작합니다 (없는 소스는 건너뜀).
 */

import { writeFile } from "fs/promises";

const TOUR_API_KEY = process.env.TOUR_API_KEY || "";

// 각 소스가 이번 실행에서 정상적으로 갱신됐는지 기록 (키가 없어서 건너뛴 건 실패로 안 침)
const sourceStatus = { tourapi: true, culture: true, kopis: true, weather: true };
const CULTURE_API_KEY = process.env.CULTURE_API_KEY || "";
const KOPIS_API_KEY = process.env.KOPIS_API_KEY || "";
const KMA_API_KEY = process.env.KMA_API_KEY || "";

const TOUR_BASE = "https://apis.data.go.kr/B551011/KorService2";
// 표준데이터 개방 API는 기관별로 URL이 다를 수 있어 실제 신청 후 발급되는
// "요청 URL"을 data.go.kr 마이페이지에서 확인해 아래 값을 맞춰주세요.
const CULTURE_BASE =
  "https://api.odcloud.kr/api/15068380/v1/uddi:3a628ee9-3f60-436d-8f5d-748d99d6c5c9";
const KOPIS_BASE = "https://www.kopis.or.kr/openApi/restful/pblprfr";
const KMA_BASE = "https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getVilageFcst";

// 앞으로 몇 개월치 공연을 가져올지 (KOPIS는 날짜 범위 지정이 필수)
const KOPIS_MONTHS_AHEAD = 3;

// 날씨는 오늘부터 며칠 뒤까지만 붙일지 (기상청 단기예보 신뢰 구간에 맞춤)
const WEATHER_DAYS_AHEAD = 2; // 오늘, 내일, 모레

// TourAPI areacode → 짧은 지역명. KOPIS가 돌려주는 지역명과 표기를 통일하기 위해 사용합니다.
const AREA_NAME_BY_CODE = {
  1: "서울", 2: "인천", 3: "대전", 4: "대구", 5: "광주",
  6: "부산", 7: "울산", 8: "세종", 31: "경기", 32: "강원",
  33: "충북", 34: "충남", 35: "경북", 36: "경남", 37: "전북",
  38: "전남", 39: "제주",
};

// 지역별 날씨 조회에 사용할 대표 좌표(위도, 경도). 시도 전체를 한 점으로 대표하는 근사치입니다.
// 강원은 도청 소재지(춘천) 대신, 우리 동호회 활동 지역인 강릉 좌표를 사용합니다.
const REGION_COORDS = {
  서울: [37.5665, 126.9780], 부산: [35.1796, 129.0756], 대구: [35.8714, 128.6014],
  인천: [37.4563, 126.7052], 광주: [35.1595, 126.8526], 대전: [36.3504, 127.3845],
  울산: [35.5384, 129.3114], 세종: [36.4801, 127.2890], 경기: [37.2636, 127.0286],
  강원: [37.7519, 128.8761], 충북: [36.6424, 127.4890], 충남: [36.6014, 126.6607],
  전북: [35.8242, 127.1480], 전남: [34.8161, 126.4629], 경북: [36.5684, 128.7294],
  경남: [35.2280, 128.6811], 제주: [33.4996, 126.5312],
};

// 기상청 단기예보 좌표계(LCC) 변환. 기상청이 공식 배포한 변환식을 그대로 옮긴 것입니다.
function latLonToGrid(lat, lon) {
  const RE = 6371.00877, GRID = 5.0;
  const SLAT1 = (30.0 * Math.PI) / 180.0;
  const SLAT2 = (60.0 * Math.PI) / 180.0;
  const OLON = (126.0 * Math.PI) / 180.0;
  const OLAT = (38.0 * Math.PI) / 180.0;
  const XO = 43, YO = 136;

  const re = RE / GRID;
  let sn = Math.tan(Math.PI * 0.25 + SLAT2 * 0.5) / Math.tan(Math.PI * 0.25 + SLAT1 * 0.5);
  sn = Math.log(Math.cos(SLAT1) / Math.cos(SLAT2)) / Math.log(sn);
  let sf = Math.tan(Math.PI * 0.25 + SLAT1 * 0.5);
  sf = (Math.pow(sf, sn) * Math.cos(SLAT1)) / sn;
  let ro = Math.tan(Math.PI * 0.25 + OLAT * 0.5);
  ro = (re * sf) / Math.pow(ro, sn);

  const rlat = (lat * Math.PI) / 180.0;
  const rlon = (lon * Math.PI) / 180.0;
  let ra = Math.tan(Math.PI * 0.25 + rlat * 0.5);
  ra = (re * sf) / Math.pow(ra, sn);
  let theta = rlon - OLON;
  if (theta > Math.PI) theta -= 2.0 * Math.PI;
  if (theta < -Math.PI) theta += 2.0 * Math.PI;
  theta *= sn;

  return {
    nx: Math.floor(ra * Math.sin(theta) + XO + 0.5),
    ny: Math.floor(ro - ra * Math.cos(theta) + YO + 0.5),
  };
}

// 가장 최근에 발표됐을 단기예보 발표시각 계산 (매일 02,05,08,11,14,17,20,23시 발표, 발표 후 10~15분 뒤 제공)
function getLatestBaseDateTime() {
  const ISSUE_HOURS = [23, 20, 17, 14, 11, 8, 5, 2];
  const kst = new Date(Date.now() + 9 * 60 * 60 * 1000); // UTC → KST 보정
  const h = kst.getUTCHours();
  const min = kst.getUTCMinutes();

  let chosen = ISSUE_HOURS.find((ih) => h > ih || (h === ih && min >= 15));
  const baseDate = new Date(Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth(), kst.getUTCDate()));
  if (chosen === undefined) {
    baseDate.setUTCDate(baseDate.getUTCDate() - 1);
    chosen = 23;
  }
  const yyyy = baseDate.getUTCFullYear();
  const mm = String(baseDate.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(baseDate.getUTCDate()).padStart(2, "0");
  return { base_date: `${yyyy}${mm}${dd}`, base_time: `${String(chosen).padStart(2, "0")}00` };
}

function weatherIcon(sky, pty) {
  const p = Number(pty);
  if ([1, 4, 5].includes(p)) return { icon: "🌧️", label: "비" };
  if ([2, 6].includes(p)) return { icon: "🌨️", label: "비/눈" };
  if ([3, 7].includes(p)) return { icon: "❄️", label: "눈" };
  const s = Number(sky);
  if (s === 1) return { icon: "☀️", label: "맑음" };
  if (s === 3) return { icon: "⛅", label: "구름많음" };
  if (s === 4) return { icon: "☁️", label: "흐림" };
  return { icon: "🌤️", label: "" };
}

/** 격자 좌표(nx,ny) 하나의 단기예보를 가져와 날짜별 대표(정오와 가장 가까운 시각) 값으로 정리 */
async function fetchWeatherForGrid(nx, ny) {
  const { base_date, base_time } = getLatestBaseDateTime();

  const url = new URL(KMA_BASE);
  url.searchParams.set("serviceKey", KMA_API_KEY);
  url.searchParams.set("pageNo", "1");
  url.searchParams.set("numOfRows", "300");
  url.searchParams.set("dataType", "JSON");
  url.searchParams.set("base_date", base_date);
  url.searchParams.set("base_time", base_time);
  url.searchParams.set("nx", String(nx));
  url.searchParams.set("ny", String(ny));

  const res = await fetch(url);
  if (!res.ok) {
    console.error(`기상청 API 요청 실패 (${nx},${ny}):`, res.status, await res.text());
    sourceStatus.weather = false;
    return null;
  }
  const json = await res.json();
  const items = json?.response?.body?.items?.item;
  if (!items) {
    console.error(`기상청 응답 형식 이상 (${nx},${ny}):`, JSON.stringify(json).slice(0, 300));
    sourceStatus.weather = false;
    return null;
  }

  const byDateTime = {};
  for (const it of items) {
    if (!["SKY", "PTY", "TMP"].includes(it.category)) continue;
    byDateTime[it.fcstDate] = byDateTime[it.fcstDate] || {};
    byDateTime[it.fcstDate][it.fcstTime] = byDateTime[it.fcstDate][it.fcstTime] || {};
    byDateTime[it.fcstDate][it.fcstTime][it.category] = it.fcstValue;
  }

  const result = {};
  for (const date of Object.keys(byDateTime)) {
    const times = Object.keys(byDateTime[date]);
    let closest = times[0];
    let minDiff = Infinity;
    for (const t of times) {
      const diff = Math.abs(parseInt(t.slice(0, 2), 10) - 12);
      if (diff < minDiff) {
        minDiff = diff;
        closest = t;
      }
    }
    const v = byDateTime[date][closest];
    if (v.SKY === undefined && v.PTY === undefined) continue;
    const { icon, label } = weatherIcon(v.SKY, v.PTY);
    result[date] = { icon, label, tmp: v.TMP ? Math.round(Number(v.TMP)) : null };
  }
  return result;
}

// 일정 하나의 날씨 조회용 격자좌표 결정: 축제 자체 좌표(TourAPI)가 있으면 그걸 우선 쓰고,
// 없으면(주로 KOPIS 공연) 지역 대표 좌표로 대체합니다.
function resolveGrid(f) {
  if (f.lat && f.lon) return latLonToGrid(f.lat, f.lon);
  if (f.area && REGION_COORDS[f.area]) return latLonToGrid(...REGION_COORDS[f.area]);
  return null;
}

/** 임박 일정(오늘~모레)에 등장하는 위치만 골라 날씨를 가져와 붙입니다 */
async function attachWeather(festivals) {
  if (!KMA_API_KEY) {
    console.log("KMA_API_KEY 없음 → 날씨 배지 건너뜀");
    return;
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const cutoff = new Date(today);
  cutoff.setDate(cutoff.getDate() + WEATHER_DAYS_AHEAD);

  const nearTerm = [];
  for (const f of festivals) {
    if (!f.startDate) continue;
    const start = new Date(f.startDate);
    const end = f.endDate ? new Date(f.endDate) : start;
    if (start > cutoff || end < today) continue;
    const grid = resolveGrid(f);
    if (!grid) continue;
    f._grid = grid;
    nearTerm.push(f);
  }
  if (nearTerm.length === 0) return;

  const gridKeys = [...new Set(nearTerm.map((f) => `${f._grid.nx},${f._grid.ny}`))];
  const weatherByGrid = {};
  for (const key of gridKeys) {
    const [nx, ny] = key.split(",").map(Number);
    weatherByGrid[key] = await fetchWeatherForGrid(nx, ny);
  }
  console.log(`날씨 조회 완료: 좌표 ${gridKeys.length}곳`);

  for (const f of nearTerm) {
    const start = new Date(f.startDate);
    const end = f.endDate ? new Date(f.endDate) : start;
    // 오늘 기준으로 실제로 방문할 법한 날짜(진행 중이면 오늘, 아니면 시작일)를 기준으로 날씨를 붙임
    const targetDate = start < today ? today : start;
    if (targetDate > end) continue;
    const dateKey = `${targetDate.getFullYear()}${String(targetDate.getMonth() + 1).padStart(2, "0")}${String(targetDate.getDate()).padStart(2, "0")}`;
    const key = `${f._grid.nx},${f._grid.ny}`;
    const w = weatherByGrid[key]?.[dateKey];
    if (w) f.weather = w;
    delete f._grid;
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

  await attachWeather(merged);

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
