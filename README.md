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



## 자동 데이터 갱신

GitHub Actions의 `Update Festival Data` 워크플로가 매일 한국시간 오전 6시에 실행됩니다. 수동 실행도 지원하며, 수집 서버의 시간대도 `Asia/Seoul`로 고정해 날짜 기준 API 요청이 한국 날짜를 따르도록 합니다.

Pull Request가 `main`을 대상으로 열리거나 갱신되면 데이터 수집 없이 JavaScript 구문 검사만 실행합니다. 실제 데이터 갱신은 예약 실행 또는 수동 실행에서만 수행합니다.

KOPIS 공연 목록 API는 조회 기간 최대 31일 제한에 맞춰 전체 수집 범위를 여러 구간으로 나눕니다. 각 구간은 하루도 빠지거나 겹치지 않도록 연결하고, 구간마다 페이지 번호를 처음부터 시작합니다.

GitHub Actions에서 자동 갱신하려면 다음 네 가지 저장소 Secret을 모두 설정해야 합니다.

- `TOUR_API_KEY`
- `CULTURE_API_KEY`
- `CULTURE_PORTAL_API_KEY`
- `KOPIS_API_KEY`

GitHub Actions에서 하나라도 빠지면 갱신을 중단하고 기존 `festivals.json`을 보존합니다. 로컬에서 직접 실행할 때는 API 키가 없는 소스만 건너뛰며, 해당 출처를 `skipped`로 표시해 앱에서 부분 데이터임을 알립니다. 부분 데이터 상태에서는 숨김·찜 순서·알림 정보를 자동 정리하지 않습니다. 전체 수집 결과가 0건이면 역시 기존 파일을 덮어쓰지 않습니다. 데이터 수집 스크립트와 브라우저 JavaScript 파일은 갱신 전에 Node.js 구문 검사를 통과해야 합니다.
