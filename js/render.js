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
    parts.push(`월: ${month}`);
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
}


// ------------------------------------------------------
// 긴급 일정 화면
// ------------------------------------------------------

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
      '<div class="empty">조건에 맞는 축제·공연이 없어요.</div>';

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
  // 긴급 일정
  //
  // 포함
  // 1. 현재 진행 중인 행사
  // 2. 오늘부터 30일 이내에 시작하는 행사
  //
  // 이미 종료된 행사는 제외한다.
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

        // 현재 진행 중인 행사
        if (
          start <= today &&
          today <= end
        ) {
          return true;
        }

        // 앞으로 30일 이내 시작하는 행사
        return (
          start >= today &&
          start <= soonLimit
        );
      })
      .sort((a, b) => {
        const aStart =
          getFestivalStartDate(a);

        const bStart =
          getFestivalStartDate(b);

        const aEnd =
          getFestivalEndDate(a);

        const bEnd =
          getFestivalEndDate(b);

        const aOngoing =
          aStart &&
          aEnd &&
          aStart <= today &&
          today <= aEnd;

        const bOngoing =
          bStart &&
          bEnd &&
          bStart <= today &&
          today <= bEnd;

        // 진행 중인 행사를 먼저
        if (
          aOngoing &&
          !bOngoing
        ) {
          return -1;
        }

        if (
          !aOngoing &&
          bOngoing
        ) {
          return 1;
        }

        return compareFestivalStart(
          a,
          b
        );
      });

  if (!upcoming.length) {
    container.innerHTML =
      '<div class="empty">다가오는 일정이 없어요.<br>월별 목록에서 전체 일정을 확인해보세요.</div>';

    return;
  }

  let html = "";

  html += renderWeekendChips();

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
              festivalOverlapsRange(
                festival,
                weekend
              )
          )
        : [];

    html += `
      <section>
        <div class="urgent-section-title hot">
          이번 주말 일정
        </div>

        ${
          weekendFiltered.length
            ? weekendFiltered
                .map(
                  renderFestivalCard
                )
                .join("")
            : `
              <div
                class="empty"
                style="padding:30px 10px"
              >
                선택한 주말에 일정이 없어요.
              </div>
            `
        }
      </section>
    `;

    container.innerHTML =
      html;

    return;
  }

  // ----------------------------------------------------
  // 전체 보기
  // ----------------------------------------------------

  const weekend =
    getWeekendFestivals(
      upcoming
    );

  // ----------------------------------------------------
  // 이번 주말 일정
  // ----------------------------------------------------

  if (weekend.length) {
    html += `
      <section>
        <div class="urgent-section-title">
          이번 주말 일정
        </div>

        ${weekend
          .map(
            renderFestivalCard
          )
          .join("")}
      </section>
    `;
  }

  // ----------------------------------------------------
  // 다가오는 일정
  // ----------------------------------------------------

  if (upcoming.length) {
    html += `
      <section>
        <div class="urgent-section-title">
          📅 다가오는 일정
        </div>

        ${upcoming
          .map(
            renderFestivalCard
          )
          .join("")}
      </section>
    `;
  }

  container.innerHTML =
    html;

  renderLoadMoreSentinel(
    container
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
      '<div class="empty">조건에 맞는 축제·공연이 없어요.</div>';

    return;
  }

  const groups =
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

    if (!groups.has(key)) {
      groups.set(
        key,
        []
      );
    }

    groups
      .get(key)
      .push(festival);
  }

  let html = "";

  for (const [
    monthKey,
    items,
  ] of groups) {
    const [
      year,
      month,
    ] = monthKey.split("-");

    html += `
      <section class="month-group">
        <h2 class="month-title">
          ${escapeHtml(
            `${year}년 ${Number(month)}월`
          )}
        </h2>

        ${items
          .map(
            renderFestivalCard
          )
          .join("")}
      </section>
    `;
  }

  container.innerHTML =
    html;

  renderLoadMoreSentinel(
    container
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

  const copyText =
    buildCopyText(
      festival
    );

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

      <button
        class="hide-btn"
        type="button"
        data-hide-id="${escapeAttr(id)}"
        aria-label="숨기기"
        title="숨기기"
      >
        ✕
      </button>

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

            ${
              festival?.type
                ? `
                  <span>
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

        <!-- 관심 행사 -->
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

        <!-- 카카오톡 공유 -->
        <button
          class="share-btn"
          type="button"
          data-title="${escapeAttr(title)}"
          data-date="${escapeAttr(dateText)}"
          data-location="${escapeAttr(location)}"
          data-link="${escapeAttr(link)}"
          data-thumbnail="${escapeAttr(thumbnail)}"
        >
          카톡
        </button>

        ${
          videoUrl
            ? `
              <a
                class="yt-btn"
                href="${escapeAttr(videoUrl)}"
                target="_blank"
                rel="noopener"
              >
                ▶ 영상
              </a>
            `
            : ""
        }

        <!-- 복사 -->
        <button
          class="copy-btn"
          type="button"
          data-copy="${escapeAttr(copyText)}"
        >
          복사
        </button>

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
// 복사 문구
// ------------------------------------------------------

function buildCopyText(
  festival
) {
  const title =
    festival?.title ||
    "";

  const date =
    formatFestivalDate(
      festival
    );

  const location =
    getFestivalLocation(
      festival
    );

  const link =
    festival?.link ||
    festival?.url ||
    festival?.detailUrl ||
    eventLink(festival);

  return [
    `🏮 ${title}`,
    `📅 ${date}`,
    location
      ? `📍 ${location}`
      : "",
    link
      ? `🔗 ${link}`
      : "",
  ]
    .filter(Boolean)
    .join("\n");
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
// ------------------------------------------------------

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
// logic.js의 festivalOverlapsRange()
// 현재 구조는 { start, end } 객체를 받는다.
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
// 무한 스크롤 표시
// ------------------------------------------------------

function renderLoadMoreSentinel(
  container
) {
  if (!container) {
    return;
  }

  const old =
    container.querySelector(
      ".load-more-sentinel"
    );

  if (old) {
    old.remove();
  }

  const sentinel =
    document.createElement(
      "div"
    );

  sentinel.className =
    "load-more-sentinel";

  sentinel.textContent =
    "전체 일정은 위에서 확인할 수 있어요.";

  container.appendChild(
    sentinel
  );
}


// ------------------------------------------------------
// HTML escape
//
// 렌더링 전용 안전 처리
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
