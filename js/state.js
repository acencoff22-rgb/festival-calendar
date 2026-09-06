// ======================================================
// js/state.js
// 전역 상수 및 앱 상태
// ======================================================

/*
 * 전국 지역 표시 순서
 *
 * 지역을 특정 지역으로 고정하지 않는다.
 * 기본 상태는 전국 전체이며,
 * 사용자가 원하는 지역을 하나 또는 여러 개 직접 선택한다.
 */
const AREA_DISPLAY_ORDER = [
  "서울",
  "인천",
  "경기",
  "강원",
  "대전",
  "충남",
  "충북",
  "세종",
  "대구",
  "경북",
  "부산",
  "울산",
  "경남",
  "광주",
  "전북",
  "전남",
  "제주",
];

const WEEKDAYS = [
  "일",
  "월",
  "화",
  "수",
  "목",
  "금",
  "토",
];

/*
 * 지역 필터의 기본 상태
 *
 * 빈 배열 → 전국 전체
 */
const DEFAULT_AREA_FILTER = [];

/*
 * 카카오 디벨로퍼스 JavaScript 키
 */
const KAKAO_JS_KEY =
  "bd1806c2ecb3953f8fe0b07be69f6686";

/*
 * 전체 행사 데이터
 */
let allFestivals = [];

/*
 * 인기 행사 ID
 */
let hotIds = new Set();

/*
 * 숨긴 행사 ID
 */
let hiddenIds = new Set();

/*
 * 찜 목록 표시 순서
 */
let favoritesOrder = [];

/* 찜 목록 알림: 행사 ID -> YYYY-MM-DD */
let reminders = {};

/*
 * 찜 여부
 *
 * 찜 상태의 단일 기준은 favoritesOrder이다.
 * 기존 favoriteIds 같은 별도 상태를 사용하지 않는다.
 */
function isFavoriteId(id) {
  return favoritesOrder.includes(String(id));
}

/*
 * 현재 화면
 *
 * "urgent" | "list"
 */
let currentView = "urgent";

/*
 * 선택 지역
 *
 * 빈 Set = 전국 전체
 */
let selectedAreas = new Set();

/*
 * 선택 월
 *
 * "" = 전체 기간
 * "YYYY-MM"
 */
let selectedMonth = "";

/*
 * 빠른 날짜 필터
 *
 * "" / "all" = 전체
 * "today" = 오늘
 * "tomorrow" = 내일
 * "this-week" = 이번 주
 * "weekend" = 이번 주말
 * "next-week" = 다음 주
 * "custom" = 사용자 지정 기간
 */
let dateFilterMode = "";

let customDateStart = "";
let customDateEnd = "";

/*
 * 주말 보기
 *
 * "" = 전체
 * "YYYY-MM-DD" = 선택한 주말의 토요일
 */
let weekendMode = "";

/*
 * 포스터 확대 상태
 */
let zoomScale = 1;
let zoomX = 0;
let zoomY = 0;

const zoomPointers = new Map();

/*
 * 카드 스와이프 상태
 *
 * pointer 이벤트가 시작되기 전에는 null이다.
 */
let swipeState = null;

/*
 * 스와이프 직후 발생하는 click을 한 번 무시한다.
 */
let suppressNextClick = false;

let pinchStartDist = 0;
let pinchStartScale = 1;
let panLast = null;