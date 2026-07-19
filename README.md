# 전국 축제 알리미

동호회원들이 필요할 때 열어보는 정적 축제 정보 페이지입니다.
서버, 로그인, 알림 없이 매일 자동 갱신되는 GitHub Pages 사이트 하나로 동작합니다.

## 동작 방식

1. `.github/workflows/update-festivals.yml`이 매일 자동으로
   `fetch-festivals.mjs`를 실행해 `festivals.json`을 최신 축제 정보로 갱신하고 커밋합니다.
2. `index.html`은 `festivals.json`을 읽어 D-day 순으로 정렬된 목록을 보여줍니다.
3. GitHub Pages로 배포하면 링크 하나로 동호회원 누구나 접속 가능합니다.

폴더 구조는 최대한 평평하게 만들어뒀어요. 폰으로 GitHub 웹사이트에서
파일을 하나씩 "새로 만들기"만 반복하면 되도록요. (`.github/workflows/` 하나만 예외)

## 처음 설정하는 방법

### 1) API 키 발급받기 (최대 3개)

#### TourAPI, 문화축제 표준데이터 — data.go.kr

- **TourAPI (지역축제, 권장)**
  1. https://www.data.go.kr 접속 → 검색창에 "한국관광공사 국문 관광정보 서비스" 검색
  2. 상세 페이지에서 [활용신청] 클릭 → 활용 목적 간단히 작성 후 신청
  3. 마이페이지 → 데이터활용 → OpenAPI 이용현황에서 **일반 인증키 (Decoding)** 복사

- **전국문화축제 표준데이터 (지역축제, 선택)**
  1. https://www.data.go.kr 에서 "전국문화축제 표준데이터" 검색 → 활용신청
  2. 승인 후 인증키 복사
  3. ⚠️ 이 데이터셋은 제공 기관에 따라 요청 URL/응답 필드명이 다를 수 있습니다.
     발급 후 Swagger 문서에서 실제 "요청 URL"과 필드명을 확인하고
     `fetch-festivals.mjs`의 `CULTURE_BASE` 상수와
     `fetchCultureStandardFestivals()` 안의 필드 매핑(`row["축제명"]` 등)을 맞춰주세요.

#### KOPIS (공연·뮤지컬·대중음악·축제 카테고리) — kopis.or.kr

1. https://www.kopis.or.kr 접속 → 상단 메뉴에서 "오픈API" 검색 또는
   https://www.kopis.or.kr/por/cs/openapi/openApiList.do 로 바로 이동
2. 회원가입 후 [인증키 신청] → 서비스명/활용목적 간단히 작성
3. 승인 후 마이페이지에서 서비스키 확인 (보통 즉시 또는 당일 승인)
4. 이 서비스는 **공연 카테고리 안에 "축제"도 포함**되어 있어서,
   대형 뮤직 페스티벌이나 공연형 행사를 함께 가져올 수 있습니다.

세 개 중 일부만 있어도 동작합니다 (없는 소스는 자동으로 건너뜁니다).
TourAPI + 문화축제 표준데이터 = 지역축제 위주, KOPIS = 공연/축제 카테고리 위주라
셋을 다 등록하면 "지역축제 + 공연" 양쪽을 가장 폭넓게 커버합니다.

#### 네이버 검색 API (인기도/언급량 배지, 선택)

1. https://developers.naver.com 접속 → 로그인 → **Application → 애플리케이션 등록**
2. 사용 API에서 **검색** 체크 → 비로그인 오픈 API 서비스 환경에 아무 URL이나 입력(예: `https://acencoff22-rgb.github.io`) → 등록
3. 등록 완료 후 나오는 **Client ID / Client Secret** 둘 다 복사
4. 이 값으로 축제/공연 제목을 블로그에서 검색했을 때 나오는 총 검색결과 수를 인기도 추정치로 사용해요.
   상위 15개에만 조용히 "🔥 인기" 배지가 붙고, 숫자 자체는 화면에 안 보여줘요.

### 2) GitHub에 폰으로 올리기 (계정 없다면 먼저 가입)

1. 폰 브라우저(사파리/크롬)로 https://github.com/signup 접속 → 이메일/비밀번호/아이디로 가입
2. 로그인 후 오른쪽 위 `+` 버튼(또는 "New") 탭 → **New repository**
3. Repository name에 `festival-calendar` 입력 → **Public** 선택 → **Create repository**
4. 저장소가 만들어지면 화면에 "Add file" 버튼이 보여요. 그걸 탭 → **Create new file** 선택
5. 아래 5개 파일을 하나씩, 이 순서로 반복합니다.
   - 맨 위 "Name your file..." 칸에 **파일 경로**를 그대로 입력 (아래 목록 참고)
   - 그 아래 큰 입력창에 **파일 내용**을 붙여넣기
   - 화면 맨 아래로 스크롤 → **Commit changes** 탭

   | 파일 경로 (입력창에 그대로 타이핑) | 내용 |
   |---|---|
   | `index.html` | 이 저장소의 `index.html` 내용 |
   | `README.md` | 이 저장소의 `README.md` 내용 |
   | `fetch-festivals.mjs` | 이 저장소의 `fetch-festivals.mjs` 내용 |
   | `festivals.json` | 이 저장소의 `festivals.json` 내용 |
   | `.github/workflows/update-festivals.yml` | 이 저장소의 워크플로우 내용 (경로에 슬래시를 입력하면 GitHub가 자동으로 폴더를 만들어줘요) |

   💡 파일 내용은 대화창에서 복사해서 붙여넣으시면 됩니다. 텍스트가 길어도
   길게 누르기 → 전체 선택 → 복사로 한 번에 가능해요.

6. 5개 파일을 모두 커밋하면 저장소 완성입니다.

### 3) API 키를 저장소 Secret으로 등록

저장소 → Settings → Secrets and variables → Actions → New repository secret

- `TOUR_API_KEY` : 위에서 발급받은 TourAPI 인증키
- `CULTURE_API_KEY` : 문화축제 표준데이터 인증키 (없으면 생략 가능)
- `KOPIS_API_KEY` : KOPIS 서비스키 (없으면 생략 가능, 이 경우 공연/대형 페스티벌 정보는 빠짐)
- `NAVER_CLIENT_ID`, `NAVER_CLIENT_SECRET` : developers.naver.com에서 발급받은 값 (없으면 생략 가능, 이 경우 🔥 인기 배지가 안 붙음)

### 4) GitHub Pages 켜기

저장소 → Settings → Pages → Source를 "Deploy from a branch" → `main` / `/ (root)` 선택

### 5) 첫 데이터 채우기

저장소 → Actions 탭 → "Update Festival Data" 워크플로우 선택 → **Run workflow** 클릭
(이후로는 매일 자동 실행됩니다.)

완료되면 `https://<GitHub아이디>.github.io/<저장소이름>/` 주소를 동호회에 공유하면 됩니다.

## 페이지 기능

- 오늘 기준 D-day 자동 계산, 7일 이내 임박 일정은 강조 표시
- 월별 그룹핑
- 이름/지역/장소 검색, 지역 필터, **지역축제 / 공연 유형 필터**
- 데이터는 매일 자동 갱신 (알림 없음 — 필요할 때 열어보는 방식)

## 참고: 데이터 소스별 성격 차이

- **TourAPI, 문화축제 표준데이터** → 지자체·관광공사가 등록한 지역 축제, 전통행사 위주
- **KOPIS** → 티켓 예매가 이루어진 공연 위주 (뮤지컬, 콘서트, 대중음악, 축제 카테고리 포함)
- 워터밤·EDM페스티벌처럼 티켓 플랫폼 예매 없이 별도 판매되는 초대형 상업 페스티벌은
  세 소스 모두에서 빠질 수 있습니다. 동호회가 매년 챙기는 행사가 있다면
  `festivals.json`에 수동으로 항목을 추가하는 방식을 추천합니다.
