// ======================================================
// js/storage.js
// localStorage 저장 / 불러오기
//
// 원칙
// - localStorage 직접 접근은 이 파일에서만 담당
// - actions.js / render.js에서는 localStorage 직접 접근 금지
// ======================================================


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