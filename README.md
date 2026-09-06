# 전국 축제·공연 알리미

전국의 축제·공연 정보를 검색하고 날짜·지역·행사 유형으로 탐색할 수 있는 정적 웹앱입니다.

## 프로젝트 구조

```text
festival-calendar/
├─ index.html
├─ festivals.json
├─ fetch-festivals.mjs
├─ README.md
├─ js/
│  ├─ state.js
│  ├─ storage.js
│  ├─ logic.js
│  ├─ render.js
│  ├─ actions.js
│  ├─ ui.js
│  ├─ data.js
│  ├─ app.js
│  └─ main.js
└─ .github/
   └─ workflows/
```

## JavaScript 역할

- `state.js` — 앱 상태와 기본값
- `storage.js` — localStorage 저장·복원 및 저장 데이터 정리
- `logic.js` — 검색·지역·날짜·주말 등 데이터 처리와 필터
- `render.js` — 행사 카드와 목록 렌더링
- `actions.js` — 관심·숨김·스와이프 등 사용자 동작
- `ui.js` — 모달·필터 UI·상태 표시 등 화면 제어
- `data.js` — `festivals.json` 로딩 및 데이터 정규화
- `app.js` — 앱 초기화와 모듈 연결
- `main.js` — 브라우저 진입점

## 주요 기능

- 전국 축제·공연 탐색
- 검색
- 지역 및 행사 유형 필터
- 오늘·내일·이번 주·이번 주말·다음 주·사용자 지정 날짜 필터
- 관심 행사 저장 및 관리
- 숨김 행사 관리
- 카드 스와이프
- YouTube 검색 연결
- 행사 데이터 자동 갱신 구조
- GitHub Pages 배포 지원

## 상태 저장

필요한 사용자 상태는 브라우저 `localStorage`에 저장됩니다.

행사 데이터는 `festivals.json`에서 읽습니다.

## 실행

개발 중에는 로컬 HTTP 서버에서 실행하고, 실제 사용 환경에서는 GitHub Pages 같은 정적 웹 호스팅에 배포합니다.

## 배포

`index.html`, `js/`, `festivals.json`을 포함한 프로젝트 구조를 그대로 정적 호스팅에 배포합니다.

## 데이터 자동 갱신

GitHub Actions에서 행사 데이터를 주기적으로 수집합니다. 저장소의 `Settings → Secrets and variables → Actions`에 다음 Secrets를 등록하세요.

- `TOUR_API_KEY`
- `CULTURE_API_KEY`
- `KOPIS_API_KEY`
- `NAVER_CLIENT_ID`
- `NAVER_CLIENT_SECRET`

API 키는 프론트엔드 파일에 직접 입력하지 않습니다. `fetch-festivals.mjs`가 Actions 환경변수로 받아 `festivals.json`을 갱신하고, 웹 앱은 생성된 JSON만 읽습니다.
