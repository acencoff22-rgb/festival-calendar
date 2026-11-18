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


## 자동 데이터 갱신

GitHub Actions의 `Update Festival Data` 워크플로가 매일 한국시간 오전 6시에 실행됩니다. 수동 실행도 지원합니다.

GitHub Actions에서 자동 갱신하려면 다음 네 가지 저장소 Secret을 모두 설정해야 합니다.

- `TOUR_API_KEY`
- `CULTURE_API_KEY`
- `CULTURE_PORTAL_API_KEY`
- `KOPIS_API_KEY`

GitHub Actions에서 하나라도 빠지면 갱신을 중단하고 기존 `festivals.json`을 보존합니다. 로컬에서 직접 실행할 때는 API 키가 없는 소스만 건너뛰며, 전체 수집 결과가 0건이면 역시 기존 파일을 덮어쓰지 않습니다. 데이터 수집 스크립트와 브라우저 JavaScript 파일은 갱신 전에 Node.js 구문 검사를 통과해야 합니다.
