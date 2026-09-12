// ======================================================
// js/storage.js
// localStorage 저장 / 불러오기
//
// 원칙
// - localStorage 직접 접근은 이 파일에서만 담당
// - actions.js / render.js에서는 localStorage 직접 접근 금지
// ======================================================


// ------------------------------------------------------
// 제외 키워드 기본값
// ------------------------------------------------------
//
// 제목에 이 단어가 포함된 행사·공연은 기본적으로 목록에서
// 제외된다. 예전에는 이 중 상당수를 서버(fetch-festivals.mjs)
// 에서 아예 걸러냈지만, 사용자가 앱에서 직접 켜고 끄거나
// 새로 추가할 수 있도록 클라이언트로 옮겼다.

const DEFAULT_EXCLUDE_KEYWORDS = [
  // 클래식/국악 (2026-09 추가)
  "연주회",
  "판소리",
  "합창",
  "독주회",
  "피아노",
  "피아니스트",
  "오케스트라",
  "클래식",
  "국악",
  "리사이틀",
  "앙상블",
  "바이올린",
  "동화",
  "창극",
  "첼로",

  // 연주/공연 형식
  "정기연주회",
  "발표회",
  "합창제",
  "콩쿠르",
  "콩쿨",
  "워크숍",
  "졸업연주",

  // 어린이 대상
  "어린이",
  "아동",
  "유아",
  "키즈",
  "가족뮤지컬",
  "인형극",

  // 캐릭터
  "뽀로로",
  "핑크퐁",
  "타요",
  "코코몽",
  "베이비샤크",
  "캐치! 티니핑",
  "브레드이발소",
  "슈퍼윙스",

  // 동화 원작
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


function loadExcludeKeywords() {
  const fallback = () =>
    DEFAULT_EXCLUDE_KEYWORDS.map(
      (word) => ({
        word,
        enabled: true,
      })
    );

  try {
    const raw =
      localStorage.getItem(
        "excludeKeywords"
      );

    if (!raw) {
      return fallback();
    }

    const parsed =
      JSON.parse(raw);

    if (
      !Array.isArray(parsed)
    ) {
      return fallback();
    }

    return parsed
      .filter(
        (entry) =>
          entry &&
          typeof entry.word ===
            "string"
      )
      .map((entry) => ({
        word: entry.word,
        enabled:
          entry.enabled !==
          false,
      }));
  } catch {
    return fallback();
  }
}


function saveExcludeKeywords() {
  safeStorageSet(
    "excludeKeywords",
    JSON.stringify(
      excludeKeywords
    )
  );
}


// ------------------------------------------------------
// 안전한 localStorage 저장
// ------------------------------------------------------
// 브라우저의 저장 공간 부족, 사생활 보호 모드,
// 저장소 접근 차단 등의 경우에도 앱 전체가 죽지 않도록 한다.

function safeStorageSet(key, value) {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}


// ------------------------------------------------------
// 숨긴 항목
// ------------------------------------------------------

function loadHiddenIds() {
  try {
    return new Set(
      JSON.parse(
        localStorage.getItem(
          "hiddenIds"
        ) || "[]"
      ).map(String)
    );
  } catch {
    return new Set();
  }
}


function saveHiddenIds() {
  safeStorageSet(
    "hiddenIds",
    JSON.stringify([
      ...hiddenIds,
    ])
  );
}


// ------------------------------------------------------
// 찜 목록 알림
// ------------------------------------------------------

function loadReminders() {
  try {
    const parsed = JSON.parse(
      localStorage.getItem("festivalReminders") || "{}"
    );

    reminders =
      parsed &&
      typeof parsed === "object" &&
      !Array.isArray(parsed)
        ? parsed
        : {};
  } catch {
    reminders = {};
  }
}


function saveReminders() {
  safeStorageSet(
    "festivalReminders",
    JSON.stringify(reminders)
  );
}


function reconcileReminders(validIds) {
  const ids = new Set(
    [...validIds].map(String)
  );

  const next = {};

  Object.entries(reminders || {}).forEach(
    ([id, date]) => {
      if (
        ids.has(String(id)) &&
        /^\d{4}-\d{2}-\d{2}$/.test(String(date))
      ) {
        next[String(id)] = String(date);
      }
    }
  );

  reminders = next;
  saveReminders();
}


// ------------------------------------------------------
// 찜 목록 순서
// ------------------------------------------------------

function loadFavoritesOrder() {
  try {
    const parsed =
      JSON.parse(
        localStorage.getItem(
          "favoritesOrder"
        ) || "[]"
      );

    if (
      !Array.isArray(parsed)
    ) {
      return [];
    }

    return parsed.map(String);
  } catch {
    return [];
  }
}


function saveFavoritesOrder() {
  safeStorageSet(
    "favoritesOrder",
    JSON.stringify(
      favoritesOrder
    )
  );
}


function addToFavoritesOrder(
  id
) {
  id = String(id);

  if (
    !favoritesOrder.includes(id)
  ) {
    favoritesOrder.push(id);

    saveFavoritesOrder();
  }
}


function removeFromFavoritesOrder(
  id
) {
  id = String(id);

  favoritesOrder =
    favoritesOrder.filter(
      (x) =>
        String(x) !== id
    );

  saveFavoritesOrder();
}



// ------------------------------------------------------
// 지역 선택
// ------------------------------------------------------
// 지역 선택
// ------------------------------------------------------

function loadSelectedAreas() {
  try {
    const parsed =
      JSON.parse(
        localStorage.getItem(
          "selectedAreas"
        ) || "[]"
      );

    if (
      !Array.isArray(parsed)
    ) {
      return new Set();
    }

    return new Set(
      parsed.map(String)
    );
  } catch {
    return new Set();
  }
}


function saveSelectedAreas() {
  safeStorageSet(
    "selectedAreas",
    JSON.stringify([
      ...selectedAreas,
    ])
  );
}


// ------------------------------------------------------
// 테마
// ------------------------------------------------------
//
// theme
// - 현재 적용된 테마
// - light / dark / contrast
//
// baseTheme
// - contrast 해제 시 돌아갈 기본 테마
// - light / dark
// ------------------------------------------------------

function loadTheme() {
  try {
    return (
      localStorage.getItem(
        "theme"
      ) || ""
    );
  } catch {
    return "";
  }
}


function saveTheme(
  theme
) {
  safeStorageSet(
    "theme",
    theme
  );
}


function loadBaseTheme() {
  try {
    return (
      localStorage.getItem(
        "baseTheme"
      ) || ""
    );
  } catch {
    return "";
  }
}


function saveBaseTheme(
  theme
) {
  safeStorageSet(
    "baseTheme",
    theme
  );
}


// ------------------------------------------------------
// 컴팩트 뷰
// ------------------------------------------------------

function loadCompactView() {
  try {
    return (
      localStorage.getItem(
        "compactView"
      ) === "1"
    );
  } catch {
    return false;
  }
}


function saveCompactView(
  isCompact
) {
  safeStorageSet(
    "compactView",
    isCompact
      ? "1"
      : "0"
  );
}


// ------------------------------------------------------
// 날짜 필터
// ------------------------------------------------------

function saveDateFilterState() {
  safeStorageSet(
    "dateFilterMode",
    dateFilterMode || ""
  );

  safeStorageSet(
    "customDateStart",
    customDateStart || ""
  );

  safeStorageSet(
    "customDateEnd",
    customDateEnd || ""
  );

  safeStorageSet(
    "selectedMonth",
    selectedMonth || ""
  );
}


// ------------------------------------------------------
// 현재 데이터와 저장 상태 정합성 정리
// ------------------------------------------------------
//
// festivals.json이 갱신되면서 이미 사라진 행사 ID가
// localStorage에 남아 있을 수 있다.
// 데이터가 완전하게 로드된 경우에만 호출한다.

function reconcileStoredState(validIds) {
  const ids = new Set(
    [...validIds].map(String)
  );

  const nextHiddenIds = new Set(
    [...hiddenIds].filter((id) =>
      ids.has(String(id))
    )
  );

  if (
    nextHiddenIds.size !== hiddenIds.size
  ) {
    hiddenIds = nextHiddenIds;
    saveHiddenIds();
  }

  const nextFavoritesOrder =
    favoritesOrder.filter((id) =>
      ids.has(String(id))
    );

  if (
    nextFavoritesOrder.length !==
    favoritesOrder.length
  ) {
    favoritesOrder = nextFavoritesOrder;
    saveFavoritesOrder();
  }
}


// ------------------------------------------------------
// 초기 상태 로드
// ------------------------------------------------------

function loadStoredState() {
  hiddenIds =
    loadHiddenIds();
  favoritesOrder =
    loadFavoritesOrder();
  selectedAreas =
    loadSelectedAreas();
  excludeKeywords =
    loadExcludeKeywords();

  try {
    dateFilterMode =
      localStorage.getItem(
        "dateFilterMode"
      ) || "";

    customDateStart =
      localStorage.getItem(
        "customDateStart"
      ) || "";

    customDateEnd =
      localStorage.getItem(
        "customDateEnd"
      ) || "";

    selectedMonth =
      localStorage.getItem(
        "selectedMonth"
      ) || "";
  } catch {
    dateFilterMode = "";
    customDateStart = "";
    customDateEnd = "";
    selectedMonth = "";
  }
}
