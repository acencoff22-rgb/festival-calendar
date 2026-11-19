// ======================================================
// js/ui.js
// UI 초기 상태 및 UI 표시 보조
//
// 담당
// - 초기 테마 적용
// - 초기 컴팩트 뷰 적용
// - 저장된 UI 설정 반영
//
// 원칙
// - 사용자 이벤트 등록 X
// - 데이터 로딩 X
// - 필터 계산 X
// - 화면 HTML 생성 X
// - localStorage 직접 접근 X
// - 저장 / 불러오기는 storage.js 담당
// ======================================================


// ------------------------------------------------------
// 테마 초기 상태
// ------------------------------------------------------

function initializeTheme() {
  const savedTheme =
    loadTheme();

  const prefersDark =
    window.matchMedia &&
    window.matchMedia(
      "(prefers-color-scheme: dark)"
    ).matches;

  /*
   * 테마 우선순위
   *
   * 1. 저장된 테마
   * 2. 시스템 다크 모드
   * 3. light
   */

  const theme =
    savedTheme ||
    (
      prefersDark
        ? "dark"
        : "light"
    );

  applyTheme(theme);

  /*
   * 테마가 아직 저장되어 있지 않다면
   * 현재 결정된 테마를 저장한다.
   */

  if (!savedTheme) {
    saveTheme(theme);
  }
}


// ------------------------------------------------------
// 컴팩트 뷰 초기 상태
// ------------------------------------------------------

function initializeCompactView() {
  const isCompact =
    loadCompactView();

  applyCompactView(
    isCompact
  );
}


// ------------------------------------------------------
// 지역 선택 체크박스
// ------------------------------------------------------

function initializeAreaCheckboxes() {
  const container =
    document.getElementById(
      "areaCheckboxList"
    );

  if (!container) {
    return;
  }

  const fragment =
    document.createDocumentFragment();

  AREA_DISPLAY_ORDER.forEach(
    (area, index) => {
      const label =
        document.createElement("label");

      label.className =
        "area-checkbox-item";

      const checkbox =
        document.createElement("input");

      checkbox.type =
        "checkbox";

      checkbox.id =
        `area-filter-${index}`;

      checkbox.value =
        area;

      checkbox.checked =
        selectedAreas.has(area);

      const text =
        document.createElement("span");

      text.textContent =
        area;

      label.append(
        checkbox,
        text
      );

      fragment.append(
        label
      );
    }
  );

  container.replaceChildren(
    fragment
  );
}


// ------------------------------------------------------
// UI 초기화
// ------------------------------------------------------

function initializeUI() {
  initializeTheme();

  initializeCompactView();

  initializeAreaCheckboxes();
}
