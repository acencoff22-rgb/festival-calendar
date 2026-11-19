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
      └─ update-festivals.yml
```

## 지역 필터 및 행정구역
- 지역 선택 모달은 `AREA_DISPLAY_ORDER`를 기준으로 체크박스를 생성합니다.
- 2026년 7월 1일 시행된 전남광주통합특별시 설치에 맞춰 기존 광주광역시·전라남도 데이터를 앱의 현재 지역 필터 값인 `광주특별시`로 통합합니다.
- 기존 브라우저에 저장된 `광주` 또는 `전남` 선택도 `광주특별시`로 자동 변환합니다.
- `해외` 및 `전국` 행사도 별도 지역 필터로 선택할 수 있습니다.

## 자동 데이터 갱신

GitHub Actions의 `Update Festival Data` 워크플로가 매일 한국시간 오전 6시에 실행됩니다. 수동 실행도 지원하며, 수집 서버의 시간대도 `Asia/Seoul`로 고정해 날짜 기준 API 요청이 한국 날짜를 따르도록 합니다.

Pull Request가 `main`을 대상으로 열리거나 갱신되면 실제 데이터 수집 없이 JavaScript 구문 검사와 수집기 재시도 단위 테스트를 실행합니다. 실제 데이터 갱신은 예약 실행 또는 수동 실행에서만 수행합니다.

실제 API 수집을 PR 브랜치에서 시험하려면 GitHub의 **Actions → Update Festival Data → Run workflow**에서 브랜치 `maintenance/2026-11-19-data-safety`를 선택해 실행합니다. 네 가지 저장소 Secret이 모두 등록되어 있어야 합니다. 이 방식은 선택한 브랜치에 결과를 저장하며 `main`을 직접 갱신하지 않습니다.

KOPIS 공연 목록 API는 조회 기간 최대 31일 제한에 맞춰 전체 수집 범위를 여러 구간으로 나눕니다. 각 구간은 하루도 빠지거나 겹치지 않도록 연결하고, 구간마다 페이지 번호를 처음부터 시작합니다. KOPIS의 `04`는 조회 결과 없음으로, 그 외 오류 코드나 응답 구조 이상은 수집 실패로 처리합니다.

행사 홈페이지 링크는 `https://`가 누락된 도메인이나 `https:/`처럼 슬래시가 하나 빠진 주소를 보정합니다. `javascript:` 등 HTTP(S)가 아닌 스킴, 사용자 정보가 포함된 URL, 비정상 호스트·포트와 상대 경로는 거부하며, 사용할 수 없는 행사 링크는 제목 검색으로 대체합니다.

네트워크 예외와 HTTP 408·425·429·500·502·503·504는 최대 2회 재시도합니다. 응답 헤더뿐 아니라 JSON/XML 본문을 읽는 중 타임아웃이나 연결 오류가 발생한 경우도 재시도합니다. 서버가 `Retry-After`를 제공하면 해당 값을 따르며, 한 번의 대기는 최대 30초로 제한합니다.

GitHub Actions에서 자동 갱신하려면 다음 네 가지 저장소 Secret을 모두 설정해야 합니다.

- `TOUR_API_KEY`
- `CULTURE_API_KEY`
- `CULTURE_PORTAL_API_KEY`
- `KOPIS_API_KEY`

GitHub Actions에서 하나라도 빠지면 갱신을 중단하고 기존 `festivals.json`을 보존합니다. 로컬에서 직접 실행할 때는 API 키가 없는 소스만 건너뛰며, 해당 출처를 `skipped`로 표시해 앱에서 부분 데이터임을 알립니다. 부분 데이터 또는 브라우저에 전달된 행사 데이터가 0건인 경우 숨김·찜 순서·알림 정보를 자동 정리하지 않습니다. 전체 수집 결과가 0건이면 역시 기존 파일을 덮어쓰지 않습니다. 데이터 파일은 임시 파일을 완성한 후 교체합니다. 데이터 수집 스크립트와 브라우저 JavaScript 파일은 Node.js 구문 검사를 통과해야 하며, `tests/*.test.mjs`의 단위 테스트도 자동 실행됩니다.
