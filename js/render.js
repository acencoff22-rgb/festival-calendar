// ======================================================
// js/render.js
// 화면 HTML 생성 / 렌더링 전담
//
// 담당
// - 긴급 일정 화면
// - 월별 목록
// - 행사 카드
// - 주말 칩
// - 숨긴 항목 목록
// - 찜 목록
//
// 원칙
// - 사용자 동작은 actions.js
// - localStorage 처리는 storage.js
// - 상태값은 state.js
// - 데이터 로딩은 data.js
// - 날짜 / 필터 / 정렬 계산은 logic.js
// - 이 파일에서는 화면을 만든다.
//
// 중요
// - logic.js와 날짜/정렬 함수를 중복 정의하지 않는다.
// - render.js에서 localStorage에 직접 접근하지 않는다.
// - 인기도/mentions/hotIds 기능은 사용하지 않는다.
// - 복사 기능은 사용하지 않는다.
// ======================================================


// ------------------------------------------------------
// 현재 화면 렌더링
// ------------------------------------------------------

function renderCurrentView() {
  if (currentView === "urgent") {
    renderUrgentView();
  } else {
    renderListView();
  }

  renderWeekendFilterChips();
  updateFilterSummary();
}


function updateFilterSummary() {
  const textEl =
    document.getElementById(
      "filterSummaryText"
    );

  const resetBtn =
    document.getElementById(
      "filterResetBtn"
    );

  if (!textEl || !resetBtn) {
    return;
  }

  const search =
    document
      .getElementById("search")
      ?.value
      .trim() || "";

  const type =
    document
      .getElementById("typeFilter")
      ?.value || "";

  const month =
    document
      .getElementById("monthFilter")
      ?.value || "";

  const parts = [];

  if (search) {
    parts.push(
      `검색: ${search}`
    );
  }

  if (selectedAreas.size) {
    parts.push(
      `지역: ${getAreaLabel().replace(/^📍\s*/, "")}`
    );
  }

  if (type === "festival") {
    parts.push("지역축제");
  }

  if (type === "performance") {
    parts.push("공연");
  }

  if (dateFilterMode) {
    parts.push(
      `날짜: ${getDateFilterLabel()}`
    );
  } else if (month) {
    parts.push(
      `월: ${month}`
    );
  }

  const count =
    getFiltered().length;

  textEl.textContent =
    parts.length
      ? `${parts.join(" · ")} · ${count}건`
      : `전체 행사 · ${count}건`;

  resetBtn.classList.toggle(
    "hidden",
    parts.length === 0
  );

  if (
    typeof updateFilterHandleState ===
    "function"
  ) {
    updateFilterHandleState();
  }
}


// ------------------------------------------------------
// 긴급 일정 화면
//
// 기준
// - 이미 종료된 행사는 제외
// - 오늘부터 30일 이내에 시작하는 행사 포함
// - 현재 진행 중인 행사도 포함
// - 정렬은 "오늘 기준 실제로 가까운 일정" 순
//
// 예:
// 7월 시작 ~ 10월 종료 → 현재 진행 중이면 오늘 위치
// 9월 10일 시작 → 9월 10일 위치
//
// 주의
// - "이번 주말 일정"에 표시된 행사는
//   아래 "다가오는 일정"에서 다시 표시하지 않는다.
// ------------------------------------------------------

// ------------------------------------------------------
// 카드 목록 점진적 렌더링 (무한 스크롤)
// ------------------------------------------------------
//
// festivals.json이 수천 건이라 필터링 결과가 클 때 한 번에
// 전부 DOM에 그리면 저사양 모바일에서 버벅일 수 있다.
// 그룹(주말/다가오는 일정, 또는 월별) 구조는 유지한 채
// 카드 단위로 나눠서, 스크롤로 하단 sentinel이 보일 때마다
// 다음 묶음을 이어서 그린다.

const CARDS_PER_PAGE = 60;

// 같은 컨테이너를 다시 그릴 때 이전 옵저버가 계속 남아있으면
// 중복으로 더 불러오는 문제가 생기므로, 컨테이너별로 추적해서 끊는다.
const activeLoadMoreObservers =
  new WeakMap();

function renderGroupedCardsIncrementally(
  container,
  groups
  // groups: [{ key, headerHtml, items: [festival, ...], sectionClassName? }]
) {
  const previousObserver =
    activeLoadMoreObservers.get(
      container
    );

  if (previousObserver) {
    previousObserver.disconnect();
    activeLoadMoreObservers.delete(
      container
    );
  }

  container.innerHTML = "";

  let groupIndex = 0;
  let itemIndex = 0;

  function renderNextPage() {
    let renderedThisPage = 0;

    while (
      renderedThisPage <
        CARDS_PER_PAGE &&
      groupIndex < groups.length
    ) {
      const group =
        groups[groupIndex];

      if (
        itemIndex >=
        group.items.length
      ) {
        groupIndex += 1;
        itemIndex = 0;
        continue;
      }

      let section =
        container.querySelector(
          `section[data-group="${group.key}"]`
        );

      if (!section) {
        section =
          document.createElement(
            "section"
          );

        section.dataset.group =
          group.key;

        if (
          group.sectionClassName
        ) {
          section.className =
            group.sectionClassName;
        }

        section.innerHTML =
          group.headerHtml ||
          "";

        container.appendChild(
          section
        );
      }

      const take =
        Math.min(
          CARDS_PER_PAGE -
            renderedThisPage,
          group.items.length -
            itemIndex
        );

      const sliceEnd =
        itemIndex + take;

      let cardsHtml = "";

      for (
        ;
        itemIndex < sliceEnd;
        itemIndex += 1
      ) {
        cardsHtml +=
          renderFestivalCard(
            group.items[
              itemIndex
            ]
          );
      }

      section.insertAdjacentHTML(
        "beforeend",
        cardsHtml
      );

      renderedThisPage +=
        take;
    }

    return (
      groupIndex < groups.length
    );
  }

  const hasMore =
    renderNextPage();

  if (!hasMore) {
    return;
  }

  if (
    typeof IntersectionObserver !==
    "function"
  ) {
    // 옵저버 미지원 환경 대비 폴백: 나머지를 한 번에 그린다.
    while (renderNextPage()) {
      // 계속 그린다
    }

    return;
  }

  const sentinel =
    document.createElement(
      "div"
    );

  sentinel.className =
    "load-more-sentinel";

  sentinel.textContent =
    "더 불러오는 중…";

  container.appendChild(
    sentinel
  );

  const observer =
    new IntersectionObserver(
      (entries) => {
        if (
          !entries[0]
            .isIntersecting
        ) {
          return;
        }

        const more =
          renderNextPage();

        // sentinel을 다시 맨 아래로 옮긴다.
        container.appendChild(
          sentinel
        );

        if (!more) {
          observer.disconnect();

          activeLoadMoreObservers.delete(
            container
          );

          sentinel.remove();
        }
      }
    );

  observer.observe(
    sentinel
  );

  activeLoadMoreObservers.set(
    container,
    observer
  );
}


function renderUrgentView() {
  const container =
    document.getElementById(
      "urgentView"
    );

  if (!container) {
    return;
  }

  const festivals =
    getFiltered();

  if (!festivals.length) {
    container.innerHTML =
      `<div class="empty">조건에 맞는 축제·공연이 없어요.</div>`;

    return;
  }

  const today =
    startOfDay(
      new Date()
    );

  const soonLimit =
    new Date(today);

  soonLimit.setDate(
    soonLimit.getDate() + 30
  );

  // ----------------------------------------------------
  // 다가오는 일정 후보
  //
  // 포함:
  // 1. 현재 진행 중인 행사
  // 2. 앞으로 30일 이내 시작하는 행사
  //
  // 제외:
  // - 이미 종료된 행사
  // ----------------------------------------------------

  const upcoming =
    festivals
      .filter((festival) => {
        const start =
          getFestivalStartDate(
            festival
          );

        const end =
          getFestivalEndDate(
            festival
          );

        if (!start || !end) {
          return false;
        }

        // 이미 종료된 행사 제외
        if (end < today) {
          return false;
        }

        // 현재 진행 중인 행사
        if (
          start <= today &&
          today <= end
        ) {
          return true;
        }

        // 앞으로 30일 이내 시작하는 행사
        return (
          start > today &&
          start <= soonLimit
        );
      })
      .sort((a, b) => {
        const aStart =
          getFestivalStartDate(
            a
          );

        const bStart =
          getFestivalStartDate(
            b
          );

        if (!aStart || !bStart) {
          return 0;
        }

        const aEnd =
          getFestivalEndDate(
            a
          );

        const bEnd =
          getFestivalEndDate(
            b
          );

        // "다음 마감까지 며칠 남았는가"로 통일해서 비교한다.
        // - 아직 시작 전인 행사: 시작일까지 남은 일수
        //   (며칠 있어야 볼 수 있는지)
        // - 이미 진행 중인 행사: 종료일까지 남은 일수
        //   (며칠 안에 놓치는지)
        //
        // 이렇게 하나의 기준으로 합치면, 동강국제사진제처럼
        // 몇 달째 열려있는 상시 행사는 종료가 한참 남아있어서
        // 자연히 뒤로 밀리고, 반대로 '내일 끝나는' 진행 중 행사는
        // 몇 주 뒤에 시작하는 신규 행사보다 먼저 노출된다.
        const aOngoing =
          aStart <= today;

        const bOngoing =
          bStart <= today;

        const aDeadline =
          aOngoing
            ? aEnd || aStart
            : aStart;

        const bDeadline =
          bOngoing
            ? bEnd || bStart
            : bStart;

        const diff =
          aDeadline - bDeadline;

        if (diff !== 0) {
          return diff;
        }

        // 마감까지 남은 일수가 같다면
        // 이미 진행 중인 쪽을 먼저 보여준다
        // (신규는 아직 기다려야 하지만 진행 중인 건 바로 갈 수 있으므로).
        if (aOngoing !== bOngoing) {
          return aOngoing
            ? -1
            : 1;
        }

        // 그래도 같다면 실제 시작일이 빠른 쪽이 먼저.
        return (
          aStart - bStart
        );
      });

  if (!upcoming.length) {
    container.innerHTML =
      `<div class="empty">다가오는 일정이 없어요.<br>월별 목록에서 전체 일정을 확인해보세요.</div>`;

    return;
  }

  // ----------------------------------------------------
  // 특정 주말 선택
  // ----------------------------------------------------

  if (
    weekendMode &&
    weekendMode !== "all"
  ) {
    const weekend =
      getWeekendByMode(
        weekendMode
      );

    const weekendFiltered =
      weekend
        ? upcoming.filter(
            (festival) =>
              festivalOverlapsRangeForRender(
                festival,
                weekend
              )
          )
        : [];

    if (!weekendFiltered.length) {
      container.innerHTML = `
        <section>
          <div class="urgent-section-title selected">
            이번 주말 일정
          </div>

          <div
            class="empty"
            style="padding:30px 10px"
          >
            선택한 주말에 일정이 없어요.
          </div>
        </section>
      `;

      return;
    }

    renderGroupedCardsIncrementally(
      container,
      [
        {
          key: "weekend-selected",
          headerHtml: `
            <div class="urgent-section-title selected">
              이번 주말 일정
            </div>
          `,
          items:
            weekendFiltered,
        },
      ]
    );

    return;
  }

  // ----------------------------------------------------
  // 이번 주말 일정
  // ----------------------------------------------------

  const weekend =
    getWeekendFestivals(
      upcoming
    );

  // ----------------------------------------------------
  // 중요:
  //
  // 이번 주말에 이미 표시된 행사 ID를 기록하고
  // "다가오는 일정"에서는 제외합니다.
  //
  // 기존 코드에서는 upcoming 전체를 다시 출력해서
  // 같은 카드가 두 섹션에 중복 표시되었습니다.
  // ----------------------------------------------------

  const weekendIds =
    new Set(
      weekend.map(
        (festival) =>
          String(
            festival.id
          )
      )
    );

  const remainingUpcoming =
    upcoming.filter(
      (festival) =>
        !weekendIds.has(
          String(
            festival.id
          )
        )
    );

  // ----------------------------------------------------
  // 다가오는 일정
  // ----------------------------------------------------

  const urgentGroups = [];

  if (weekend.length) {
    urgentGroups.push({
      key: "weekend",
      headerHtml: `
        <div class="urgent-section-title">
          이번 주말 일정
        </div>
      `,
      items: weekend,
    });
  }

  if (
    remainingUpcoming.length
  ) {
    urgentGroups.push({
      key: "upcoming",
      headerHtml: `
        <div class="urgent-section-title">
          📅 다가오는 일정
        </div>
      `,
      items:
        remainingUpcoming,
    });
  }

  renderGroupedCardsIncrementally(
    container,
    urgentGroups
  );
}


// ------------------------------------------------------
// 월별 목록
// ------------------------------------------------------

function renderListView() {
  const container =
    document.getElementById(
      "list"
    );

  if (!container) {
    return;
  }

  const festivals =
    getFiltered()
      .sort(
        compareFestivalStart
      );

  if (!festivals.length) {
    container.innerHTML =
      `<div class="empty">조건에 맞는 축제·공연이 없어요.</div>`;

    return;
  }

  const monthGroups =
    new Map();

  for (const festival of festivals) {
    const start =
      getFestivalStartDate(
        festival
      );

    if (!start) {
      continue;
    }

    const key =
      `${start.getFullYear()}-${String(
        start.getMonth() + 1
      ).padStart(2, "0")}`;

    if (!monthGroups.has(key)) {
      monthGroups.set(
        key,
        []
      );
    }

    monthGroups
      .get(key)
      .push(festival);
  }

  const listGroups = [];

  for (const [
    monthKey,
    items,
  ] of monthGroups) {
    const [
      year,
      month,
    ] =
      monthKey.split("-");

    listGroups.push({
      key: `month-${monthKey}`,
      sectionClassName:
        "month-group",
      headerHtml: `
        <h2 class="month-title">
          ${escapeHtml(
            `${year}년 ${Number(month)}월`
          )}
        </h2>
      `,
      items,
    });
  }

  renderGroupedCardsIncrementally(
    container,
    listGroups
  );
}


// ------------------------------------------------------
// YouTube 검색 링크
// ------------------------------------------------------

function normalizeImageUrl(
  url
) {
  const value =
    String(
      url || ""
    ).trim();

  if (!value) {
    return "";
  }

  return value.startsWith(
    "http://"
  )
    ? `https://${value.slice(7)}`
    : value;
}


function buildYoutubeSearchUrl(
  festival
) {
  const query =
    cleanTitleForSearch(
      festival?.title ||
        festival?.name ||
        ""
    );

  if (!query) {
    return "";
  }

  return (
    "https://www.youtube.com/results?search_query=" +
    encodeURIComponent(query)
  );
}


// ------------------------------------------------------
// 행사 카드
// ------------------------------------------------------

function renderFestivalCard(
  festival
) {
  const id =
    String(
      festival?.id ?? ""
    );

  const title =
    festival?.title ||
    "제목 없음";

  const dateText =
    formatFestivalDate(
      festival
    );

  const location =
    getFestivalLocation(
      festival
    );

  const dday =
    getFestivalDday(
      festival
    );

  const favorite =
    isFavoriteId(id);

  const thumbnail =
    normalizeImageUrl(
      festival?.thumbnail ||
        festival?.image ||
        ""
    );

  const link =
    festival?.link ||
    festival?.url ||
    festival?.detailUrl ||
    eventLink(festival);

  const videoUrl =
    festival?.youtube ||
    festival?.youtubeUrl ||
    buildYoutubeSearchUrl(
      festival
    );

  return `
    <article
      class="card"
      data-id="${escapeAttr(id)}"
    >

      ${
        thumbnail
          ? `
            <img
              src="${escapeAttr(thumbnail)}"
              alt="${escapeAttr(title)} 포스터"
              loading="lazy"
            />
          `
          : `
            <div class="no-img">
              🏮
            </div>
          `
      }

      <div class="card-body">

        <a
          class="card-link"
          href="${escapeAttr(link)}"
          target="_blank"
          rel="noopener"
        >

          <h3 class="card-title">
            ${highlightSearchText(
              title
            )}
          </h3>

          <div class="card-meta">

            <span>
              📅 ${highlightSearchText(
                dateText
              )}
            </span>

            ${
              location
                ? `
                  <span>
                    📍 ${highlightSearchText(
                      location
                    )}
                  </span>
                `
                : ""
            }

          </div>

          <div class="card-bottom">

            ${
              festival?.type
                ? `
                  <span class="card-type">
                    ${
                      festival.type ===
                      "performance"
                        ? "공연"
                        : "축제"
                    }
                  </span>
                `
                : ""
            }

          </div>

        </a>

      </div>

      <div class="card-side">

        <div
          class="
            dday
            ${
              dday?.className
                ? dday.className
                : dday?.cls || ""
            }
          "
        >
          ${escapeHtml(
            dday?.text || ""
          )}
        </div>

        <button
          class="
            favorite-btn
            ${
              favorite
                ? "active"
                : ""
            }
          "
          type="button"
          data-favorite-id="${escapeAttr(id)}"
          aria-label="${
            favorite
              ? "관심 행사에서 삭제"
              : "관심 행사에 추가"
          }"
          aria-pressed="${
            favorite
              ? "true"
              : "false"
          }"
          title="${
            favorite
              ? "관심 행사에서 삭제"
              : "관심 행사에 추가"
          }"
        >
          ${
            favorite
              ? "♥ 관심"
              : "♡ 관심"
          }
        </button>

        <div class="card-menu-wrap">

          <button
            class="card-menu-btn"
            type="button"
            aria-label="행사 메뉴"
            aria-expanded="false"
          >
            ⋯
          </button>

          <div
            class="filter-menu card-menu hidden"
          >

            <button
              class="card-menu-action share-btn"
              type="button"
              data-title="${escapeAttr(title)}"
              data-date="${escapeAttr(dateText)}"
              data-location="${escapeAttr(location)}"
              data-link="${escapeAttr(link)}"
              data-thumbnail="${escapeAttr(thumbnail)}"
            >
              카톡 공유
            </button>

            ${
              videoUrl
                ? `
                  <a
                    class="card-menu-action yt-btn"
                    href="${escapeAttr(videoUrl)}"
                    target="_blank"
                    rel="noopener"
                  >
                    ▶ YouTube
                  </a>
                `
                : ""
            }

            <button
              class="card-menu-action hide-card-action"
              type="button"
              data-hide-id="${escapeAttr(id)}"
            >
              🙈 이 행사 숨기기
            </button>

          </div>

        </div>

      </div>

    </article>
  `;
}


// ------------------------------------------------------
// 장소
// ------------------------------------------------------

function getFestivalLocation(
  festival
) {
  return [
    festival?.area,
    festival?.sigungu,
    festival?.location ||
      festival?.venue,
  ]
    .filter(Boolean)
    .filter(
      (value, index, arr) =>
        arr.indexOf(value) ===
        index
    )
    .join(" · ");
}


// ------------------------------------------------------
// 검색어 강조
// ------------------------------------------------------

function highlightSearchText(
  text
) {
  const value =
    String(
      text ?? ""
    );

  const search =
    document
      .getElementById(
        "search"
      )
      ?.value
      .trim();

  if (!search) {
    return escapeHtml(
      value
    );
  }

  const escapedSearch =
    escapeRegExp(
      search
    );

  return escapeHtml(
    value
  ).replace(
    new RegExp(
      `(${escapedSearch})`,
      "gi"
    ),
    "<mark>$1</mark>"
  );
}


function escapeRegExp(
  value
) {
  return String(
    value
  ).replace(
    /[.*+?^${}()|[\]\\]/g,
    "\\$&"
  );
}


// ------------------------------------------------------
// 주말 칩
//
// 메인 행사 영역이 아니라
// 필터 패널 내부에 표시한다.
// ------------------------------------------------------

function renderWeekendFilterChips() {
  const container =
    document.getElementById(
      "filterWeekendChips"
    );

  if (!container) {
    return;
  }

  container.innerHTML =
    renderWeekendChips();
}


function renderWeekendChips() {
  const weekends =
    getUpcomingWeekends();

  if (!weekends.length) {
    return "";
  }

  return `
    <div class="weekend-chips">

      <button
        class="
          weekend-chip
          ${
            !weekendMode ||
            weekendMode === "all"
              ? "active"
              : ""
          }
        "
        type="button"
        data-mode="all"
      >
        전체
      </button>

      ${weekends
        .map(
          (weekend, index) => {
            const mode =
              weekendModeValue(
                index
              );

            return `
              <button
                class="
                  weekend-chip
                  ${
                    weekendMode === mode
                      ? "active"
                      : ""
                  }
                "
                type="button"
                data-mode="${escapeAttr(
                  mode
                )}"
              >
                ${escapeHtml(
                  formatWeekendLabel(
                    weekend
                  )
                )}
              </button>
            `;
          }
        )
        .join("")}

    </div>
  `;
}


// ------------------------------------------------------
// 주말 모드 값
// ------------------------------------------------------

function weekendModeValue(
  index
) {
  if (index === 0) {
    return "this";
  }

  if (index === 1) {
    return "next";
  }

  return `weekend-${index}`;
}


// ------------------------------------------------------
// 주말 표시명
// ------------------------------------------------------

function formatWeekendLabel(
  weekend
) {
  if (!weekend?.start) {
    return "";
  }

  const start =
    weekend.start;

  return `${
    start.getMonth() + 1
  }/${start.getDate()} 주말`;
}


// ------------------------------------------------------
// 범위 겹침
//
// logic.js의 festivalOverlapsRange()와
// 이름 충돌을 피하기 위해 render 전용 함수 사용
// ------------------------------------------------------

function festivalOverlapsRangeForRender(
  festival,
  range
) {
  if (
    !festival ||
    !range
  ) {
    return false;
  }

  const start =
    getFestivalStartDate(
      festival
    );

  const end =
    getFestivalEndDate(
      festival
    );

  if (!start || !end) {
    return false;
  }

  return (
    start <= range.end &&
    end >= range.start
  );
}


// ------------------------------------------------------
// 숨긴 항목 목록
// ------------------------------------------------------

function renderHiddenList() {
  const container =
    document.getElementById(
      "hiddenList"
    );

  if (!container) {
    return;
  }

  const items =
    [...hiddenIds]
      .map(
        (id) =>
          allFestivals.find(
            (festival) =>
              String(
                festival.id
              ) === String(id)
          )
      )
      .filter(Boolean);

  if (!items.length) {
    container.innerHTML =
      `
        <div
          class="empty"
          style="padding:30px 10px"
        >
          숨긴 항목이 없어요.
        </div>
      `;

    return;
  }

  container.innerHTML =
    `
      <div class="hidden-modal-actions">

        <button
          class="unhide-all-btn"
          type="button"
        >
          모두 다시 표시
        </button>

      </div>
    ` +
    items
      .map(
        (festival) => `
          <div class="hidden-item-row">

            <div>

              <strong>
                ${escapeHtml(
                  festival.title ||
                    "제목 없음"
                )}
              </strong>

              <div
                style="
                  font-size:11.5px;
                  color:var(--ink-soft);
                  margin-top:3px;
                "
              >
                ${escapeHtml(
                  getFestivalLocation(
                    festival
                  )
                )}
              </div>

            </div>

            <button
              class="unhide-btn"
              type="button"
              data-unhide-id="${escapeAttr(
                festival.id
              )}"
            >
              다시 표시
            </button>

          </div>
        `
      )
      .join("");
}


// ------------------------------------------------------
// 제외 키워드 관리
// ------------------------------------------------------

function renderExcludeKeywordList() {
  const container =
    document.getElementById(
      "excludeKeywordList"
    );

  if (!container) {
    return;
  }

  const addRowHtml = `
    <div class="exclude-keyword-add-row">
      <input
        type="text"
        id="excludeKeywordInput"
        class="exclude-keyword-input"
        placeholder="제외할 단어 추가"
        maxlength="30"
      />

      <button
        id="excludeKeywordAddBtn"
        class="exclude-keyword-add-btn"
        type="button"
      >
        추가
      </button>
    </div>

    <div class="exclude-keyword-hint">
      체크된 단어가 제목에 포함된 행사·공연은 목록에서 제외돼요.
    </div>
  `;

  if (!excludeKeywords.length) {
    container.innerHTML =
      addRowHtml +
      `
        <div
          class="empty"
          style="padding:30px 10px"
        >
          등록된 제외 키워드가 없어요.
        </div>
      `;

    return;
  }

  container.innerHTML =
    addRowHtml +
    excludeKeywords
      .map(
        (entry) => `
          <div class="hidden-item-row exclude-keyword-row">

            <label class="exclude-keyword-label">
              <input
                type="checkbox"
                class="exclude-keyword-checkbox"
                data-exclude-word="${escapeAttr(
                  entry.word
                )}"
                ${
                  entry.enabled
                    ? "checked"
                    : ""
                }
              />

              <span
                class="${
                  entry.enabled
                    ? ""
                    : "exclude-keyword-disabled"
                }"
              >
                ${escapeHtml(
                  entry.word
                )}
              </span>
            </label>

            <button
              class="unhide-btn"
              type="button"
              data-exclude-remove="${escapeAttr(
                entry.word
              )}"
              aria-label="${escapeAttr(
                entry.word
              )} 삭제"
            >
              삭제
            </button>

          </div>
        `
      )
      .join("");
}


// ------------------------------------------------------
// 찜 목록
// ------------------------------------------------------

function renderFavoritesList() {
  const container =
    document.getElementById(
      "favoritesList"
    );

  if (!container) {
    return;
  }

  const orderedIds =
    getFavoritesOrderedIds();

  const items =
    orderedIds
      .map(
        (id) =>
          allFestivals.find(
            (festival) =>
              String(
                festival.id
              ) === String(id)
          )
      )
      .filter(Boolean);

  if (!items.length) {
    container.innerHTML =
      `
        <div
          class="empty"
          style="padding:30px 10px"
        >
          관심 행사로 저장한 행사가 없어요.
        </div>
      `;

    return;
  }

  container.innerHTML =
    items
      .map(
        (festival) => {
          const id =
            String(
              festival.id
            );

          const thumbnail =
            normalizeImageUrl(
              festival.thumbnail ||
                festival.image ||
                ""
            );

          return `
            <div
              class="favorite-item"
              data-id="${escapeAttr(id)}"
            >

              ${
                thumbnail
                  ? `
                    <img
                      src="${escapeAttr(
                        thumbnail
                      )}"
                      alt=""
                    />
                  `
                  : `
                    <div class="no-img-mini">
                      🏮
                    </div>
                  `
              }

              <div class="favorite-item-body">

                <div class="favorite-item-title">
                  ${escapeHtml(
                    festival.title ||
                      "제목 없음"
                  )}
                </div>

                <div class="favorite-item-meta">

                  ${escapeHtml(
                    formatFestivalDate(
                      festival
                    )
                  )}

                  ${
                    getFestivalLocation(
                      festival
                    )
                      ? `
                        · ${escapeHtml(
                          getFestivalLocation(
                            festival
                          )
                        )}
                      `
                      : ""
                  }

                </div>

              </div>

              <div class="favorite-item-reminder">

                <label
                  class="favorite-reminder-btn"
                  title="찜한 행사 알림 날짜 설정"
                >
                  <span>⏰</span>

                  <input
                    type="date"
                    class="favorite-reminder-date"
                    data-reminder-id="${escapeAttr(id)}"
                    value="${escapeAttr(
                      reminders?.[id] ||
                        ""
                    )}"
                    aria-label="${escapeAttr(
                      (festival.title ||
                        "행사") +
                      " 알림 날짜"
                    )}"
                  />
                </label>

                ${
                  reminders?.[id]
                    ? `
                      <span class="favorite-reminder">
                        알림 ${escapeHtml(
                          reminders[id]
                        )}
                      </span>
                    `
                    : ""
                }

              </div>

              <span
                class="favorite-drag-handle"
                title="순서 변경"
                aria-label="순서 변경"
              >
                ⠿
              </span>

              <button
                class="favorite-remove-btn"
                type="button"
                data-remove-favorite-id="${escapeAttr(
                  id
                )}"
                aria-label="관심 행사 삭제"
              >
                ✕
              </button>

            </div>
          `;
        }
      )
      .join("");
}


// ------------------------------------------------------
// 찜 순서
// ------------------------------------------------------

function getFavoritesOrderedIds() {
  const validIds =
    new Set(
      allFestivals.map(
        (festival) =>
          String(
            festival.id
          )
      )
    );

  const ordered =
    Array.isArray(
      favoritesOrder
    )
      ? favoritesOrder
          .map(String)
          .filter(
            (id) =>
              validIds.has(id) &&
              isFavoriteId(id)
          )
      : [];

  return ordered;
}


// ------------------------------------------------------
// HTML escape
// ------------------------------------------------------

function escapeHtml(
  value
) {
  return String(
    value ?? ""
  )
    .replace(
      /&/g,
      "&amp;"
    )
    .replace(
      /</g,
      "&lt;"
    )
    .replace(
      />/g,
      "&gt;"
    )
    .replace(
      /"/g,
      "&quot;"
    )
    .replace(
      /'/g,
      "&#39;"
    );
}


// ------------------------------------------------------
// 빈 이미지 DOM 생성
// ------------------------------------------------------

function createNoImageElement() {
  const div =
    document.createElement(
      "div"
    );

  div.className =
    "no-img";

  div.textContent =
    "🏮";

  return div;
}
