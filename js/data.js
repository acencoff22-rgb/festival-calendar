// ======================================================
// js/data.js
// festivals.json 로드 및 데이터 정규화
// ======================================================

const SOURCE_LABELS = {
  tourapi: "지역축제(TourAPI)",
  culture: "문화축제 표준데이터",
  culturePortal: "문화포털",
  kopis: "공연(KOPIS)",
  mentions: "인기도(언급량)",
};

let festivalData = [];
let dataLoaded = false;
let dataLoadError = false;
let dataSourceStatus = null;

// ------------------------------------------------------
// 문자열 보조
// ------------------------------------------------------

function normalizeText(value) {
  if (value === null || value === undefined) {
    return "";
  }

  return String(value).trim();
}

function normalizeDate(value) {
  const text = normalizeText(value);

  if (!text) {
    return "";
  }

  const match = text.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);

  if (match) {
    const year = match[1];
    const month = match[2].padStart(2, "0");
    const day = match[3].padStart(2, "0");

    return `${year}-${month}-${day}`;
  }

  return text;
}

function normalizeNumber(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const number = Number(value);

  return Number.isFinite(number) ? number : null;
}

// ------------------------------------------------------
// 지역 정규화
// ------------------------------------------------------

function normalizeArea(value) {
  const text = normalizeText(value);

  if (!text) {
    return "";
  }

  const areaMap = [
    ["서울특별시", "서울"],
    ["부산광역시", "부산"],
    ["대구광역시", "대구"],
    ["인천광역시", "인천"],
    ["광주광역시", "광주"],
    ["대전광역시", "대전"],
    ["울산광역시", "울산"],
    ["세종특별자치시", "세종"],
    ["경기도", "경기"],
    ["강원특별자치도", "강원"],
    ["강원도", "강원"],
    ["충청북도", "충북"],
    ["충청남도", "충남"],
    ["전라북도", "전북"],
    ["전북특별자치도", "전북"],
    ["전라남도", "전남"],
    ["경상북도", "경북"],
    ["경상남도", "경남"],
    ["제주특별자치도", "제주"],
  ];

  for (const [from, to] of areaMap) {
    if (text.startsWith(from)) {
      return to;
    }
  }

  return text;
}

// ------------------------------------------------------
// 카테고리 정규화
// ------------------------------------------------------

function normalizeCategory(record) {
  const genre = normalizeText(record.genre);
  const category = normalizeText(record.category);
  const type = normalizeText(record.type);

  const combined = `${genre} ${category} ${type}`.toLowerCase();

  if (
    combined.includes("뮤지컬") ||
    combined.includes("콘서트") ||
    combined.includes("공연") ||
    combined.includes("오페라") ||
    combined.includes("클래식") ||
    combined.includes("페스티벌")
  ) {
    return "공연";
  }

  if (
    combined.includes("축제") ||
    combined.includes("지역행사") ||
    combined.includes("계절행사") ||
    combined.includes("불꽃") ||
    combined.includes("하나비")
  ) {
    return "지역축제";
  }

  return category || genre || type || "기타";
}

// ------------------------------------------------------
// 장소 정규화
// ------------------------------------------------------

function normalizeLocation(record) {
  const location =
    normalizeText(record.location) ||
    normalizeText(record.addr1) ||
    normalizeText(record.address);

  return location;
}

// ------------------------------------------------------
// 제목 정규화
// ------------------------------------------------------

function normalizeTitle(record) {
  return (
    normalizeText(record.title) ||
    normalizeText(record.eventNm) ||
    normalizeText(record.eventName) ||
    normalizeText(record.name) ||
    "제목 없음"
  );
}

// ------------------------------------------------------
// 날짜 정규화
// ------------------------------------------------------

function normalizeStartDate(record) {
  return normalizeDate(
    record.startDate ??
      record.start_date ??
      record.eventStartDate ??
      record.eventStart
  );
}

function normalizeEndDate(record) {
  return normalizeDate(
    record.endDate ??
      record.end_date ??
      record.eventEndDate ??
      record.eventEnd
  );
}

// ------------------------------------------------------
// URL 정규화
// ------------------------------------------------------

function normalizeDetailUrl(record) {
  return (
    normalizeText(record.detailUrl) ||
    normalizeText(record.detail_url) ||
    normalizeText(record.homepage) ||
    normalizeText(record.url) ||
    ""
  );
}

function normalizeThumbnail(record) {
  return (
    normalizeText(record.thumbnail) ||
    normalizeText(record.imageUrl) ||
    normalizeText(record.image) ||
    normalizeText(record.imgUrl) ||
    ""
  );
}

// ------------------------------------------------------
// 하나의 행사 레코드 정규화
// ------------------------------------------------------

function normalizeFestivalRecord(record, index) {
  if (!record || typeof record !== "object") {
    return null;
  }

  const title = normalizeTitle(record);
  const startDate = normalizeStartDate(record);
  const endDate = normalizeEndDate(record);

  const source = normalizeText(record.source);

  const latitude = normalizeNumber(
    record.lat ??
      record.latitude ??
      record.mapy
  );

  const longitude = normalizeNumber(
    record.lon ??
      record.lng ??
      record.longitude ??
      record.mapx
  );

  const item = {
    ...record,

    id:
      normalizeText(record.id) ||
      `${source || "event"}-${index}-${startDate}-${title}`,

    title,

    startDate,

    endDate: endDate || startDate,

    location: normalizeLocation(record),

    area:
      normalizeArea(record.area) ||
      normalizeArea(record.location) ||
      normalizeArea(record.addr1) ||
      "",

    genre: normalizeText(record.genre),

    category: normalizeCategory(record),

    detailUrl: normalizeDetailUrl(record),

    thumbnail: normalizeThumbnail(record),

    lat: latitude,

    lon: longitude,

    source: source || "unknown",

    sourceLabel:
      SOURCE_LABELS[source] ||
      normalizeText(record.sourceLabel) ||
      source ||
      "기타",

    isFavorite: false,

    isReminder: false,

    hidden: false,
  };

  return item;
}

// ------------------------------------------------------
// JSON 데이터 정규화
// ------------------------------------------------------

function normalizeFestivalData(json) {
  if (!json) {
    return [];
  }

  let rawItems = [];

  if (Array.isArray(json)) {
    rawItems = json;
  } else if (Array.isArray(json.items)) {
    rawItems = json.items;
  } else if (Array.isArray(json.data)) {
    rawItems = json.data;
  } else if (Array.isArray(json.festivals)) {
    rawItems = json.festivals;
  }

  return rawItems
    .map((record, index) =>
      normalizeFestivalRecord(record, index)
    )
    .filter(Boolean);
}

// ------------------------------------------------------
// 소스 상태
// ------------------------------------------------------

function hasSourceFailure(sourceStatus) {
  if (!sourceStatus || typeof sourceStatus !== "object") {
    return false;
  }

  return Object.values(sourceStatus).some(
    (value) => value === false
  );
}

function getFailedSourceLabels(sourceStatus) {
  if (!sourceStatus || typeof sourceStatus !== "object") {
    return [];
  }

  return Object.entries(sourceStatus)
    .filter(([, ok]) => ok === false)
    .map(([source]) => SOURCE_LABELS[source] || source);
}

// ------------------------------------------------------
// 데이터 경고 표시
// ------------------------------------------------------

function showDataWarning(message) {
  const existing =
    document.querySelector(
      "#dataSourceWarning"
    );

  if (existing) {
    existing.remove();
  }

  const warning =
    document.createElement("div");

  warning.id = "dataSourceWarning";

  warning.className =
    "data-source-warning";

  warning.textContent = message;

  const main =
    document.querySelector("main") ||
    document.body;

  main.prepend(warning);
}

// ------------------------------------------------------
// 데이터 로드
// ------------------------------------------------------

async function loadFestivalData() {
  dataLoaded = false;
  dataLoadError = false;
  dataSourceStatus = null;

  try {
    const response =
      await fetch(
        "festivals.json",
        {
          cache: "no-store",
        }
      );

    if (!response.ok) {
      throw new Error(
        `HTTP ${response.status}`
      );
    }

    const json =
      await response.json();

    dataSourceStatus =
      json.sourceStatus ||
      null;

    const sourceFailed =
      hasSourceFailure(
        dataSourceStatus
      );

    const items =
      normalizeFestivalData(json);

    if (sourceFailed) {
      dataLoadError = true;

      const failedLabels =
        getFailedSourceLabels(
          dataSourceStatus
        );

      const failedText =
        failedLabels.length > 0
          ? failedLabels.join(", ")
          : "일부 데이터 소스";

      showDataWarning(
        `⚠️ ${failedText} 갱신에 실패해서 일부 정보가 최신이 아닐 수 있어요.`
      );
    }

    festivalData = items;

    dataLoaded = true;

    // --------------------------------------------------
    // 서버 데이터가 정상적으로 완성된 경우에만
    // 로컬 상태를 데이터와 맞춘다.
    // --------------------------------------------------
    if (!sourceFailed) {
      reconcileStoredState();
    }

    return festivalData;
  } catch (error) {
    console.error(
      "festivals.json 로드 실패:",
      error
    );

    dataLoadError = true;

    festivalData = [];

    showDataWarning(
      "⚠️ 행사 데이터를 불러오지 못했습니다."
    );

    return festivalData;
  }
}

// ------------------------------------------------------
// 로컬 저장 상태와 데이터 연결
// ------------------------------------------------------

function reconcileStoredState() {
  if (!Array.isArray(festivalData)) {
    return;
  }

  const favorites =
    typeof loadFavorites === "function"
      ? loadFavorites()
      : [];

  const reminders =
    typeof loadReminders === "function"
      ? loadReminders()
      : [];

  const hidden =
    typeof loadHiddenItems === "function"
      ? loadHiddenItems()
      : [];

  const favoriteSet =
    new Set(
      Array.isArray(favorites)
        ? favorites
        : []
    );

  const reminderSet =
    new Set(
      Array.isArray(reminders)
        ? reminders
        : []
    );

  const hiddenSet =
    new Set(
      Array.isArray(hidden)
        ? hidden
        : []
    );

  festivalData =
    festivalData.map((item) => ({
      ...item,

      isFavorite:
        favoriteSet.has(item.id),

      isReminder:
        reminderSet.has(item.id),

      hidden:
        hiddenSet.has(item.id),
    }));
}

// ------------------------------------------------------
// 데이터 접근
// ------------------------------------------------------

function getFestivalData() {
  return festivalData;
}

function isDataLoaded() {
  return dataLoaded;
}

function hasDataLoadError() {
  return dataLoadError;
}

function getDataSourceStatus() {
  return dataSourceStatus;
}

// ------------------------------------------------------
// ID로 데이터 검색
// ------------------------------------------------------

function findFestivalById(id) {
  if (!id) {
    return null;
  }

  return (
    festivalData.find(
      (item) => item.id === id
    ) || null
  );
}

// ------------------------------------------------------
// 전체 데이터 갱신
// ------------------------------------------------------

async function reloadFestivalData() {
  return await loadFestivalData();
}
