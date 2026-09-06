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

  const savedBaseTheme =
    loadBaseTheme();

  const prefersDark =
    window.matchMedia &&
    window.matchMedia(
      "(prefers-color-scheme: dark)"
    ).matches;


  /*
   * 테마 우선순위
   *
   * 1. 저장된 현재 테마
   * 2. 저장된 기본 테마
   * 3. 시스템 다크 모드
   * 4. light
   */

  const baseTheme =
    savedBaseTheme ||
    (
      prefersDark
        ? "dark"
        : "light"
    );

  const theme =
    savedTheme ||
    baseTheme;


  applyTheme(theme);


  /*
   * 기본 테마가 아직 저장되어 있지 않다면
   * 현재 결정된 기본 테마를 저장한다.
   */

  if (!savedBaseTheme) {
    saveBaseTheme(
      baseTheme
    );
  }


  /*
   * 현재 테마가 아직 저장되어 있지 않다면
   * 현재 결정된 테마를 저장한다.
   */

  if (!savedTheme) {
    saveTheme(
      theme
    );
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
// UI 초기화
// ------------------------------------------------------

function initializeUI() {
  initializeTheme();

  initializeCompactView();
}