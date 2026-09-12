// ======================================================
// js/logic.js
// 날짜 계산 / 검색 / 필터 / 정렬 / 공통 데이터 로직
//
// 원칙
// - 날짜 계산은 이 파일에서만 담당
// - 필터 계산은 이 파일에서만 담당
// - 정렬은 이 파일에서만 담당
// - 주말 계산은 이 파일에서만 담당
// - render.js에서 동일 함수 재정의 금지
// ======================================================


// ------------------------------------------------------
// 날짜 기본 유틸
// ------------------------------------------------------

function todayIsoString() {
  return formatIsoDate(new Date());
}


function formatIsoDate(date) {
  const d =
    date instanceof Date
      ? date
      : new Date(date);

  if (Number.isNaN(d.getTime())) {
    return "";
  }

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

  return `${yyyy}-${mm}-${dd}`;
}


function startOfDay(date) {
  const d =
    date instanceof Date
      ? new Date(date)
      : new Date(date);

  if (Number.isNaN(d.getTime())) {
    return null;
  }

  d.setHours(
    0,
    0,
    0,
    0
  );

  return d;
}


function parseDate(dateStr) {
  if (!dateStr) {
    return null;
  }

  const date =
    new Date(dateStr);

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return null;
  }

  return startOfDay(date);
}


function daysUntil(dateStr) {
  const today =
    startOfDay(new Date());

  const target =
    parseDate(dateStr);

  if (
    !today ||
    !target
  ) {
    return Infinity;
  }

  return Math.round(
    (
      target.getTime() -
      today.getTime()
    ) /
      86400000
  );
}


// ------------------------------------------------------
// 행사 기간
// ------------------------------------------------------

function getFestivalStartDate(
  festival
) {
  return parseDate(
    festival?.startDate
  );
}


function getFestivalEndDate(
  festival
) {
  return (
    parseDate(
      festival?.endDate
    ) ||
    getFestivalStartDate(
      festival
    )
  );
}


function isFestivalOngoing(
  festival
) {
  const start =
    getFestivalStartDate(
      festival
    );

  const end =
    getFestivalEndDate(
      festival
    );

  const today =
    startOfDay(new Date());

  if (
    !start ||
    !end ||
    !today
  ) {
    return false;
  }

  return (
    start <= today &&
    today <= end
  );
}


function isFestivalEnded(
  festival
) {
  const end =
    getFestivalEndDate(
      festival
    );

  const today =
    startOfDay(new Date());

  if (
    !end ||
    !today
  ) {
    return false;
  }

  return end < today;
}


function isFestivalUpcoming(
  festival
) {
  const start =
    getFestivalStartDate(
      festival
    );

  const today =
    startOfDay(new Date());

  if (
    !start ||
    !today
  ) {
    return false;
  }

  return start >= today;
}


// ------------------------------------------------------
// D-day
// ------------------------------------------------------

function ddayLabel(
  startDate
) {
  const d =
    daysUntil(startDate);

  if (d === Infinity) {
    return {
      text: "",
      cls: "",
    };
  }

  if (d < 0) {
    return {
      text: "진행 중",
      cls: "",
    };
  }

  if (d === 0) {
    return {
      text: "오늘 시작",
      cls: "today",
    };
  }

  return {
    text: `D-${d}`,
    cls:
      d <= 7
        ? "soon"
        : "",
  };
}


function getFestivalDday(
  festival
) {
  if (
    !festival?.startDate
  ) {
    return {
      text: "일정 미정",
      className: "",
    };
  }

  const start =
    getFestivalStartDate(
      festival
    );

  const end =
    getFestivalEndDate(
      festival
    );

  const today =
    startOfDay(new Date());

  if (
    !start ||
    !end ||
    !today
  ) {
    return {
      text: "일정 미정",
      className: "",
    };
  }

  if (
    start <= today &&
    today <= end
  ) {
    return {
      text: "진행중",
      className: "today",
    };
  }

  const diff =
    Math.round(
      (
        start.getTime() -
        today.getTime()
      ) /
        86400000
    );

  if (diff === 0) {
    return {
      text: "오늘",
      className: "today",
    };
  }

  if (diff > 0) {
    return {
      text: `D-${diff}`,
      className:
        diff <= 7
          ? "soon"
          : "",
    };
  }

  return {
    text: "종료",
    className: "",
  };
}


// ------------------------------------------------------
// 날짜 표시
// ------------------------------------------------------

function monthLabel(
  dateStr
) {
  const d =
    parseDate(dateStr);

  if (!d) {
    return "";
  }

  return `${d.getFullYear()}년 ${
    d.getMonth() + 1
  }월`;
}


function formatFestivalDate(
  festival
) {
  if (
    !festival?.startDate
  ) {
    return "일정 미정";
  }

  const start =
    getFestivalStartDate(
      festival
    );

  const end =
    getFestivalEndDate(
      festival
    );

  if (!start) {
    return "일정 미정";
  }

  const startText =
    formatDateShort(start);

  if (
    !end ||
    sameDate(
      start,
      end
    )
  ) {
    return startText;
  }

  return `${startText} ~ ${formatDateShort(end)}`;
}


function eventDateRange(
  festival
) {
  return formatFestivalDate(
    festival
  );
}


function formatDateShort(
  date
) {
  const d =
    date instanceof Date
      ? date
      : parseDate(date);

  if (!d) {
    return "";
  }

  return `${d.getFullYear()}.${String(
    d.getMonth() + 1
  ).padStart(2, "0")}.${String(
    d.getDate()
  ).padStart(2, "0")}`;
}


function sameDate(
  a,
  b
) {
  const da =
    a instanceof Date
      ? startOfDay(a)
      : parseDate(a);

  const db =
    b instanceof Date
      ? startOfDay(b)
      : parseDate(b);

  if (
    !da ||
    !db
  ) {
    return false;
  }

  return (
    da.getTime() ===
    db.getTime()
  );
}


// ------------------------------------------------------
// 검색용 제목 정리
// ------------------------------------------------------

function cleanTitleForSearch(
  title
) {
  return String(
    title || ""
  )
    .replace(
      /\[[^\]]*\]/g,
      ""
    )
    .replace(
      /\([^)]*\)/g,
      ""
    )
    .trim();
}


// ------------------------------------------------------
// 행사 링크
// ------------------------------------------------------

function eventLink(
  festival
) {
  return (
    festival?.detailUrl ||
    festival?.link ||
    festival?.url ||
    `https://search.naver.com/search.naver?query=${encodeURIComponent(
      cleanTitleForSearch(
        festival?.title
      )
    )}`
  );
}


// ------------------------------------------------------
// 검색어 하이라이트
// ------------------------------------------------------

function highlightMatch(
  text,
  query
) {
  if (
    !text ||
    !query
  ) {
    return text;
  }

  const normalizedText =
    String(text);

  const normalizedQuery =
    String(query).trim();

  if (!normalizedQuery) {
    return normalizedText;
  }

  const idx =
    normalizedText
      .toLowerCase()
      .indexOf(
        normalizedQuery.toLowerCase()
      );

  if (idx === -1) {
    return normalizedText;
  }

  return (
    normalizedText.slice(
      0,
      idx
    ) +
    "<mark>" +
    normalizedText.slice(
      idx,
      idx +
        normalizedQuery.length
    ) +
    "</mark>" +
    normalizedText.slice(
      idx +
        normalizedQuery.length
    )
  );
}


// ------------------------------------------------------
// 검색 대상 텍스트
//
// 검색 대상
// - 제목
// - 지역
// - 시군구
// - 장소
// - 공연장
// - 행사 유형
// - 설명 / 소개
// - 주소
// - 카테고리
// - 태그
//
// 데이터에 해당 필드가 없는 경우 자동으로 제외한다.
// ------------------------------------------------------

function getFestivalSearchText(
  festival
) {
  if (!festival) {
    return "";
  }

  const values = [
    festival.title,

    festival.area,
    festival.sigungu,

    festival.location,
    festival.venue,
    festival.place,
    festival.address,

    festival.type,

    festival.description,
    festival.summary,
    festival.overview,
    festival.content,
    festival.introduction,
    festival.intro,

    festival.category,
    festival.subCategory,

    festival.tags,
    festival.keywords,
  ];

  const textValues = [];

  for (const value of values) {
    if (
      value === null ||
      value === undefined
    ) {
      continue;
    }

    if (
      Array.isArray(value)
    ) {
      textValues.push(
        value
          .filter(
            (item) =>
              item !== null &&
              item !== undefined
          )
          .map(String)
          .join(" ")
      );

      continue;
    }

    if (
      typeof value === "object"
    ) {
      textValues.push(
        Object.values(value)
          .filter(
            (item) =>
              item !== null &&
              item !== undefined
          )
          .map(String)
          .join(" ")
      );

      continue;
    }

    textValues.push(
      String(value)
    );
  }

  return textValues
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}


// ------------------------------------------------------
// 검색어 정규화
//
// 여러 공백은 하나로 통일한다.
// ------------------------------------------------------

function normalizeSearchQuery(
  query
) {
  return String(
    query ?? ""
  )
    .trim()
    .replace(
      /\s+/g,
      " "
    )
    .toLowerCase();
}


// ------------------------------------------------------
// 검색어 일치 여부
//
// 검색어가 여러 단어인 경우
// 각 단어가 모두 행사 정보 안에 존재하면 일치한다.
//
// 예:
// "서울 재즈"
// → "서울"과 "재즈"가 모두 포함된 행사 검색
// ------------------------------------------------------

function matchesFestivalSearch(
  festival,
  query
) {
  const normalizedQuery =
    normalizeSearchQuery(
      query
    );

  if (!normalizedQuery) {
    return true;
  }

  const searchText =
    getFestivalSearchText(
      festival
    );

  const terms =
    normalizedQuery
      .split(" ")
      .filter(Boolean);

  return terms.every(
    (term) =>
      searchText.includes(term)
  );
}


// ------------------------------------------------------
// 월 필터
// ------------------------------------------------------

function getSelectedMonthRange() {
  if (!selectedMonth) {
    return null;
  }

  const [
    year,
    month,
  ] =
    selectedMonth
      .split("-")
      .map(Number);

  if (
    !year ||
    !month ||
    month < 1 ||
    month > 12
  ) {
    return null;
  }

  const start =
    new Date(
      year,
      month - 1,
      1
    );

  start.setHours(
    0,
    0,
    0,
    0
  );

  const end =
    new Date(
      year,
      month,
      0
    );

  end.setHours(
    23,
    59,
    59,
    999
  );

  return {
    start,
    end,
  };
}



// ------------------------------------------------------
// 빠른 날짜 필터
// ------------------------------------------------------

function getWeekRange(offset = 0) {
  const today = startOfDay(new Date());

  if (!today) {
    return null;
  }

  const day = today.getDay();
  const monday = new Date(today);

  const diffToMonday =
    day === 0
      ? -6
      : 1 - day;

  monday.setDate(
    monday.getDate() +
      diffToMonday +
      offset * 7
  );
  monday.setHours(0, 0, 0, 0);

  const sunday = new Date(monday);
  sunday.setDate(
    sunday.getDate() + 6
  );
  sunday.setHours(23, 59, 59, 999);

  return {
    start: monday,
    end: sunday,
  };
}


function getSingleDateRange(offset = 0) {
  const date = startOfDay(new Date());

  if (!date) {
    return null;
  }

  date.setDate(
    date.getDate() + offset
  );

  const end = new Date(date);
  end.setHours(23, 59, 59, 999);

  return {
    start: date,
    end,
  };
}


function getSelectedDateRange() {
  switch (dateFilterMode) {
    case "today":
      return getSingleDateRange(0);

    case "tomorrow":
      return getSingleDateRange(1);

    case "this-week":
      return getWeekRange(0);

    case "weekend":
      return getWeekendRange(0);

    case "next-week":
      return getWeekRange(1);

    case "custom": {
      if (!customDateStart || !customDateEnd) {
        return null;
      }

      const start = parseDate(customDateStart);
      const end = parseDate(customDateEnd);

      if (!start || !end || start > end) {
        return null;
      }

      end.setHours(23, 59, 59, 999);

      return {
        start,
        end,
      };
    }

    default:
      return null;
  }
}


function getDateFilterLabel() {
  const labels = {
    today: "오늘",
    tomorrow: "내일",
    "this-week": "이번 주",
    weekend: "이번 주말",
    "next-week": "다음 주",
    custom: "직접 선택",
  };

  if (
    dateFilterMode === "custom" &&
    customDateStart &&
    customDateEnd
  ) {
    return `${customDateStart} ~ ${customDateEnd}`;
  }

  return labels[dateFilterMode] || "전체 기간";
}


// ------------------------------------------------------
// 행사 기간과 범위 겹침
// ------------------------------------------------------

function festivalOverlapsRange(
  festival,
  range
) {
  if (
    !festival ||
    !range
  ) {
    return false;
  }

  const start =
    getFestivalStartDate(
      festival
    );

  const end =
    getFestivalEndDate(
      festival
    );

  if (
    !start ||
    !end
  ) {
    return false;
  }

  return (
    start <= range.end &&
    end >= range.start
  );
}


function overlapsRange(
  festival,
  range
) {
  return festivalOverlapsRange(
    festival,
    range
  );
}


// ------------------------------------------------------
// 전체 필터
// ------------------------------------------------------

function isExcludedByKeyword(
  festival
) {
  const title =
    String(
      festival?.title || ""
    );

  return excludeKeywords.some(
    (entry) =>
      entry.enabled &&
      title.includes(
        entry.word
      )
  );
}


function getFiltered() {
  const searchInput =
    document.getElementById(
      "search"
    );

  const typeFilter =
    document.getElementById(
      "typeFilter"
    );

  const q =
    searchInput
      ? normalizeSearchQuery(
          searchInput.value
        )
      : "";

  const type =
    typeFilter
      ? typeFilter.value
      : "";

  const monthRange =
    getSelectedMonthRange();

  const dateRange =
    getSelectedDateRange();

  return allFestivals.filter(
    (festival) => {
      if (
        hiddenIds.has(
          String(festival.id)
        )
      ) {
        return false;
      }

      if (
        isExcludedByKeyword(
          festival
        )
      ) {
        return false;
      }

      const matchesQuery =
        matchesFestivalSearch(
          festival,
          q
        );

      // 지역을 선택하지 않은 기본 상태는 전국 전체다.
      // 표시 순서 목록에 없는 정규화 지역도 기본 결과에서 제외하지 않는다.
      const matchesArea =
        selectedAreas.size === 0
          ? true
          : selectedAreas.has(
              String(festival.area || "")
            );

      const matchesType =
        !type ||
        festival.type === type;

      const matchesMonth =
        !monthRange ||
        dateFilterMode !== "" ||
        festivalOverlapsRange(
          festival,
          monthRange
        );

      const matchesDate =
        !dateRange ||
        festivalOverlapsRange(
          festival,
          dateRange
        );

      return (
        matchesQuery &&
        matchesArea &&
        matchesType &&
        matchesMonth &&
        matchesDate
      );
    }
  );
}


// ------------------------------------------------------
// 주말 범위
//
// index
// 0 = 이번 주말
// 1 = 다음 주말
// 2 = 다다음 주말
// ------------------------------------------------------

function getWeekendRange(
  index = 0
) {
  const today =
    startOfDay(new Date());

  if (!today) {
    return null;
  }

  const day =
    today.getDay();

  let saturday =
    new Date(today);

  if (day === 6) {
    // 토요일
  } else if (day === 0) {
    saturday.setDate(
      saturday.getDate() - 1
    );
  } else {
    saturday.setDate(
      saturday.getDate() +
        (6 - day)
    );
  }

  saturday.setDate(
    saturday.getDate() +
      index * 7
  );

  saturday.setHours(
    0,
    0,
    0,
    0
  );

  const sunday =
    new Date(saturday);

  sunday.setDate(
    sunday.getDate() + 1
  );

  sunday.setHours(
    23,
    59,
    59,
    999
  );

  return {
    start: saturday,
    end: sunday,
  };
}


function getUpcomingWeekends(
  count = 6
) {
  return Array.from(
    {
      length: count,
    },
    (_, index) =>
      getWeekendRange(index)
  ).filter(Boolean);
}


// ------------------------------------------------------
// 주말 키
// ------------------------------------------------------

function getWeekendModeKey(
  index
) {
  if (index === 0) {
    return "this";
  }

  if (index === 1) {
    return "next";
  }

  return `weekend-${index}`;
}


function getWeekendByMode(
  mode
) {
  if (
    !mode ||
    mode === "all"
  ) {
    return null;
  }

  const weekends =
    getUpcomingWeekends();

  if (mode === "this") {
    return weekends[0] || null;
  }

  if (mode === "next") {
    return weekends[1] || null;
  }

  const match =
    String(mode).match(
      /^weekend-(\d+)$/
    );

  if (!match) {
    return null;
  }

  const index =
    Number(match[1]);

  return (
    weekends[index] ||
    null
  );
}


// ------------------------------------------------------
// 주말 라벨
// ------------------------------------------------------

function getWeekendLabel(
  range
) {
  if (
    !range?.start
  ) {
    return "";
  }

  return `${
    range.start.getMonth() + 1
  }/${range.start.getDate()} 주말`;
}


// ------------------------------------------------------
// 행사와 주말 겹침
// ------------------------------------------------------

function festivalOverlapsWeekend(
  festival,
  range
) {
  return festivalOverlapsRange(
    festival,
    range
  );
}


function getWeekendFestivals(
  festivals,
  range = null
) {
  const targetRange =
    range ||
    getWeekendRange(0);

  if (!targetRange) {
    return [];
  }

  return festivals.filter(
    (festival) =>
      festivalOverlapsRange(
        festival,
        targetRange
      )
  );
}


function isFestivalInWeekendMode(
  festival,
  mode
) {
  if (
    !mode ||
    mode === "all"
  ) {
    return true;
  }

  const weekend =
    getWeekendByMode(
      mode
    );

  if (!weekend) {
    return false;
  }

  return festivalOverlapsRange(
    festival,
    weekend
  );
}


// ------------------------------------------------------
// 시작일순 정렬
// ------------------------------------------------------

function compareFestivalStart(a, b) {
  const aStart = getFestivalStartDate(a);
  const bStart = getFestivalStartDate(b);

  if (!aStart && !bStart) return 0;
  if (!aStart) return 1;
  if (!bStart) return -1;

  return aStart.getTime() - bStart.getTime();
}


// ------------------------------------------------------
// 임박순 정렬
// ------------------------------------------------------

function urgentSortKey(
  festival
) {
  if (
    isFestivalEnded(
      festival
    )
  ) {
    return Infinity;
  }

  if (
    isFestivalOngoing(
      festival
    )
  ) {
    return -1;
  }

  return daysUntil(
    festival?.startDate
  );
}





function sortByUrgency(
  items
) {
  return items.sort(
    (a, b) =>
      urgentSortKey(a) -
      urgentSortKey(b)
  );
}


// ------------------------------------------------------
// 행사 유형 아이콘
// ------------------------------------------------------

function eventTypeIcon(
  festival
) {
  return (
    festival?.type ===
    "performance"
  )
    ? "🎤"
    : "🎪";
}


// ------------------------------------------------------
// 지역 표시
// ------------------------------------------------------

function getAreaLabel() {
  if (
    selectedAreas.size ===
    0
  ) {
    return "📍 전국 전체 지역";
  }

  if (
    selectedAreas.size <=
    3
  ) {
    return `📍 ${
      [
        ...selectedAreas,
      ].join(", ")
    }`;
  }

  return `📍 ${
    [...selectedAreas][0]
  } 외 ${
    selectedAreas.size - 1
  }곳`;
}


function getWeatherSearchQuery() {
  if (
    selectedAreas.size ===
    0
  ) {
    return "";
  }

  return `${
    [
      ...selectedAreas,
    ].join(" ")
  } 주말 날씨`;
}


// ------------------------------------------------------
// HTML 속성 안전 처리
// ------------------------------------------------------

function escapeAttr(
  str
) {
  return String(
    str ?? ""
  )
    .replace(
      /&/g,
      "&amp;"
    )
    .replace(
      /"/g,
      "&quot;"
    )
    .replace(
      /'/g,
      "&#39;"
    )
    .replace(
      /</g,
      "&lt;"
    )
    .replace(
      />/g,
      "&gt;"
    );
}
