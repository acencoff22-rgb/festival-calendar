// ======================================================
// js/actions.js
// 사용자 동작 / 이벤트 전담
//
// 담당
// - 카드 숨기기
// - 찜
// - 지역 필터 적용
// - 보기 전환
// - 검색 / 필터 변경
// - 주말 칩
// - 숨긴 항목 복구
// - 찜 목록 열기 / 닫기
// - 카드 스와이프
// - 드래그 정렬
// - 검색/필터 패널
// - 테마 / 컴팩트 / TOP
// - 카카오톡 공유
// - 포스터 확대
//
// 원칙
// - 화면 HTML 생성은 render.js
// - localStorage 원본 처리는 storage.js
// - 상태값은 state.js
// - 데이터 로딩은 data.js
// - 날짜 / 필터 계산은 logic.js 및 render.js
// - 여기서는 "사용자가 무엇을 했을 때 무엇을 실행할지"만 담당
// ======================================================


// ------------------------------------------------------
// 필터 패널
// ------------------------------------------------------

let filterDrawerOpen =
  false;

let filterPointerState =
  null;


function openFilterDrawer() {
  const drawer =
    document.getElementById(
      "filterDrawer"
    );

  const backdrop =
    document.getElementById(
      "filterBackdrop"
    );

  const handle =
    document.getElementById(
      "filterHandle"
    );

  if (!drawer) {
    return;
  }

  filterDrawerOpen = true;

  drawer.classList.add(
    "open"
  );

  backdrop?.classList.add(
    "visible"
  );

  handle?.setAttribute(
    "aria-expanded",
    "true"
  );

  document.body.classList.add(
    "filter-drawer-open"
  );
}


function closeFilterDrawer() {
  const drawer =
    document.getElementById(
      "filterDrawer"
    );

  const backdrop =
    document.getElementById(
      "filterBackdrop"
    );

  const handle =
    document.getElementById(
      "filterHandle"
    );

  filterDrawerOpen = false;

  drawer?.classList.remove(
    "open"
  );

  backdrop?.classList.remove(
    "visible"
  );

  handle?.setAttribute(
    "aria-expanded",
    "false"
  );

  document.body.classList.remove(
    "filter-drawer-open"
  );
}


function toggleFilterDrawer() {
  if (filterDrawerOpen) {
    closeFilterDrawer();
  } else {
    openFilterDrawer();
  }
}


function updateFilterHandleState() {
  const handle =
    document.getElementById(
      "filterHandle"
    );

  if (!handle) {
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

  const hasFilter =
    Boolean(
      search ||
      type ||
      month ||
      selectedAreas.size ||
      dateFilterMode
    );

  handle.classList.toggle(
    "has-filter",
    hasFilter
  );
}


function startFilterSwipe(e) {
  filterPointerState = {
    startX: e.clientX,
    startY: e.clientY,
    pointerId: e.pointerId,
    moved: false,
  };
}


function moveFilterSwipe(e) {
  if (
    !filterPointerState ||
    e.pointerId !==
      filterPointerState.pointerId
  ) {
    return;
  }

  const dx =
    e.clientX -
    filterPointerState.startX;

  const dy =
    e.clientY -
    filterPointerState.startY;

  if (
    Math.abs(dx) < 8 &&
    Math.abs(dy) < 8
  ) {
    return;
  }

  if (
    Math.abs(dy) >
    Math.abs(dx)
  ) {
    filterPointerState = null;
    return;
  }

  filterPointerState.moved = true;

  e.preventDefault();

  if (
    !filterDrawerOpen &&
    dx < -45
  ) {
    openFilterDrawer();

    filterPointerState = null;
    return;
  }

  if (
    filterDrawerOpen &&
    dx > 70
  ) {
    closeFilterDrawer();

    filterPointerState = null;
    return;
  }
}


function endFilterSwipe() {
  filterPointerState = null;
}


// ------------------------------------------------------
// 보기 전환
// ------------------------------------------------------

function switchView(view) {
  currentView = view;

  const urgentButton =
    document.getElementById(
      "btnUrgentView"
    );

  const listButton =
    document.getElementById(
      "btnListView"
    );

  const urgentView =
    document.getElementById(
      "urgentView"
    );

  const listView =
    document.getElementById(
      "list"
    );

  urgentButton?.classList.toggle(
    "active",
    view === "urgent"
  );

  listButton?.classList.toggle(
    "active",
    view === "list"
  );

  urgentView?.classList.toggle(
    "hidden",
    view !== "urgent"
  );

  listView?.classList.toggle(
    "hidden",
    view !== "list"
  );

  closeFilterDrawer();

  renderCurrentView();
}


// ------------------------------------------------------
// 날짜 빠른 필터
// ------------------------------------------------------

function updateDateQuickUI() {
  document
    .querySelectorAll(
      "#dateQuickBar .date-quick-btn"
    )
    .forEach((button) => {
      const active =
        button.dataset.mode ===
        (dateFilterMode || "all");

      button.classList.toggle(
        "active",
        active
      );

      button.setAttribute(
        "aria-pressed",
        active ? "true" : "false"
      );
    });

  const customBox =
    document.getElementById(
      "customDateBox"
    );

  if (customBox) {
    customBox.classList.toggle(
      "hidden",
      dateFilterMode !== "custom"
    );
  }

  const startInput =
    document.getElementById(
      "customDateStart"
    );

  const endInput =
    document.getElementById(
      "customDateEnd"
    );

  if (startInput) {
    startInput.value =
      customDateStart || "";
  }

  if (endInput) {
    endInput.value =
      customDateEnd || "";
  }
}


function setDateFilter(mode) {
  dateFilterMode =
    mode === "all"
      ? ""
      : mode;

  if (
    dateFilterMode !== "custom"
  ) {
    customDateStart = "";
    customDateEnd = "";
  }

  if (dateFilterMode) {
    selectedMonth = "";

    const monthFilter =
      document.getElementById(
        "monthFilter"
      );

    if (monthFilter) {
      monthFilter.value = "";
    }
  }

  weekendMode =
    dateFilterMode === "weekend"
      ? "this"
      : "";

  saveDateFilterState();
  updateDateQuickUI();
  renderCurrentView();
  closeFilterDrawer();
}


function applyCustomDateFilter() {
  const start =
    document.getElementById(
      "customDateStart"
    )?.value || "";

  const end =
    document.getElementById(
      "customDateEnd"
    )?.value || "";

  if (!start || !end) {
    alert(
      "시작일과 종료일을 모두 선택해주세요."
    );

    return;
  }

  if (start > end) {
    alert(
      "종료일은 시작일보다 빠를 수 없습니다."
    );

    return;
  }

  customDateStart = start;
  customDateEnd = end;
  dateFilterMode = "custom";
  weekendMode = "";
  selectedMonth = "";

  const monthFilter =
    document.getElementById(
      "monthFilter"
    );

  if (monthFilter) {
    monthFilter.value = "";
  }

  saveDateFilterState();
  updateDateQuickUI();
  renderCurrentView();
  closeFilterDrawer();
}


// ------------------------------------------------------
// 지역 필터
// ------------------------------------------------------

function openAreaModal() {
  document
    .querySelectorAll(
      "#areaCheckboxList input[type=checkbox]"
    )
    .forEach((checkbox) => {
      checkbox.checked =
        selectedAreas.has(
          checkbox.value
        );
    });

  document
    .getElementById("areaModal")
    ?.classList.remove("hidden");
}


function closeAreaModal() {
  document
    .getElementById("areaModal")
    ?.classList.add("hidden");
}


function selectAllAreas() {
  document
    .querySelectorAll(
      "#areaCheckboxList input[type=checkbox]"
    )
    .forEach((checkbox) => {
      checkbox.checked = true;
    });
}


function selectNoAreas() {
  document
    .querySelectorAll(
      "#areaCheckboxList input[type=checkbox]"
    )
    .forEach((checkbox) => {
      checkbox.checked = false;
    });
}


function applyAreaFilter() {
  const checked = [
    ...document.querySelectorAll(
      "#areaCheckboxList input[type=checkbox]:checked"
    ),
  ].map(
    (checkbox) =>
      checkbox.value
  );

  selectedAreas =
    new Set(checked);

  saveSelectedAreas();

  updateAreaButtonLabel();

  closeAreaModal();
  closeFilterDrawer();

  renderCurrentView();
}


// ------------------------------------------------------
// 숨긴 항목
// ------------------------------------------------------

function updateHiddenManageButton() {
  const button =
    document.getElementById(
      "hiddenManageBtn"
    );

  const count =
    document.getElementById(
      "hiddenCount"
    );

  const size =
    hiddenIds instanceof Set
      ? hiddenIds.size
      : 0;

  if (count) {
    count.textContent =
      String(size);
  }

  button?.classList.toggle(
    "hidden",
    size === 0
  );
}


function openHiddenModal() {
  renderHiddenList();

  document
    .getElementById("hiddenModal")
    ?.classList.remove("hidden");

  closeFilterDrawer();
}


function closeHiddenModal() {
  document
    .getElementById("hiddenModal")
    ?.classList.add("hidden");
}


function unhideItem(id) {
  hiddenIds.delete(id);

  saveHiddenIds();

  updateHiddenManageButton();

  renderHiddenList();

  renderCurrentView();
}


function hideItem(id) {
  hiddenIds.add(id);

  saveHiddenIds();

  updateHiddenManageButton();

  renderCurrentView();
}


// ------------------------------------------------------
// 찜 목록
// ------------------------------------------------------

function setFavoriteReminder(id, date) {
  id = String(id);

  if (!isFavoriteId(id)) {
    return;
  }

  if (
    /^\d{4}-\d{2}-\d{2}$/.test(
      String(date || "")
    )
  ) {
    reminders[id] =
      String(date);
  } else {
    delete reminders[id];
  }

  saveReminders();
  renderFavoritesList();
  renderReminderBanner();
}


function clearFavoriteReminder(id) {
  setFavoriteReminder(
    id,
    ""
  );
}


function toggleFavorite(id) {
  id = String(id);

  if (isFavoriteId(id)) {
    removeFromFavoritesOrder(id);
  } else {
    addToFavoritesOrder(id);
  }

  renderFavoritesList();
  renderCurrentView();
}


function openFavoritesModal() {
  renderFavoritesList();

  document
    .getElementById("favoritesModal")
    ?.classList.remove("hidden");

  closeFilterDrawer();
}


function closeFavoritesModal() {
  document
    .getElementById("favoritesModal")
    ?.classList.add("hidden");
}


function removeFavorite(id) {
  id = String(id);

  removeFromFavoritesOrder(id);

  delete reminders[id];

  saveReminders();

  renderFavoritesList();

  renderCurrentView();
}


// ------------------------------------------------------
// 카드 스와이프
//
// 오른쪽 = 찜
// 왼쪽 = 숨기기
// ------------------------------------------------------

function isInteractiveCardElement(
  target
) {
  return !!target.closest(
    "button, input, label, a, select, textarea, [contenteditable='true'], .card-menu"
  );
}


function startCardSwipe(e) {
  if (
    isInteractiveCardElement(
      e.target
    )
  ) {
    return;
  }

  const card =
    e.target.closest(".card");

  if (!card) {
    return;
  }

  swipeState = {
    card,
    id: card.dataset.id,
    startX: e.clientX,
    startY: e.clientY,
    dx: 0,
    dy: 0,
    moved: false,
    pointerId: e.pointerId,
  };

  try {
    card.setPointerCapture(
      e.pointerId
    );
  } catch (_) {}
}


function moveCardSwipe(e) {
  if (
    !swipeState ||
    e.pointerId !==
      swipeState.pointerId
  ) {
    return;
  }

  const dx =
    e.clientX -
    swipeState.startX;

  const dy =
    e.clientY -
    swipeState.startY;

  swipeState.dx = dx;
  swipeState.dy = dy;

  if (!swipeState.moved) {
    const distance =
      Math.hypot(
        dx,
        dy
      );

    if (distance < 10) {
      return;
    }

    if (
      Math.abs(dy) >=
      Math.abs(dx)
    ) {
      swipeState = null;
      return;
    }

    swipeState.moved = true;

    e.preventDefault();

    swipeState.card.classList.add(
      "swiping"
    );
  }

  if (!swipeState.moved) {
    return;
  }

  e.preventDefault();

  swipeState.card.style.transform =
    `translateX(${dx}px) rotate(${dx / 20}deg)`;

  swipeState.card.style.opacity =
    String(
      Math.max(
        1 -
          Math.abs(dx) / 300,
        0.4
      )
    );
}


function endCardSwipe(e) {
  if (
    !swipeState ||
    (
      e &&
      e.pointerId !== undefined &&
      e.pointerId !==
        swipeState.pointerId
    )
  ) {
    return;
  }

  const {
    card,
    id,
    dx,
    moved,
    pointerId,
  } = swipeState;

  card.classList.remove(
    "swiping"
  );

  try {
    if (
      card.hasPointerCapture(
        pointerId
      )
    ) {
      card.releasePointerCapture(
        pointerId
      );
    }
  } catch (_) {}

  if (
    moved &&
    Math.abs(dx) > 80
  ) {
    suppressNextClick = true;

    const isFavorite =
      dx > 0;

    card.style.transition =
      "transform 0.25s ease, opacity 0.25s ease";

    card.style.transform =
      `translateX(${isFavorite ? 700 : -700}px) rotate(${isFavorite ? 25 : -25}deg)`;

    card.style.opacity =
      "0";

    setTimeout(() => {
      if (isFavorite) {
        addToFavoritesOrder(id);
      } else {
        hiddenIds.add(id);

        saveHiddenIds();

        updateHiddenManageButton();
      }

      card.remove();
    }, 220);
  } else if (moved) {
    card.style.transition =
      "transform 0.2s ease, opacity 0.2s ease";

    card.style.transform = "";

    card.style.opacity = "";

    setTimeout(() => {
      if (!card.isConnected) {
        return;
      }

      card.style.transition = "";
      card.style.transform = "";
      card.style.opacity = "";
    }, 220);
  }

  swipeState = null;
}


// ------------------------------------------------------
// 스와이프 후 잘못된 링크 클릭 방지
// ------------------------------------------------------

function suppressSwipeClick(e) {
  if (!suppressNextClick) {
    return;
  }

  e.preventDefault();
  e.stopPropagation();

  suppressNextClick = false;
}


// ------------------------------------------------------
// 카드 메뉴
// ------------------------------------------------------

function closeCardMenus(
  except = null
) {
  document
    .querySelectorAll(
      ".card-menu"
    )
    .forEach((menu) => {
      if (
        except &&
        menu === except
      ) {
        return;
      }

      menu.classList.add(
        "hidden"
      );
    });

  document
    .querySelectorAll(
      ".card-menu-btn"
    )
    .forEach((button) => {
      if (
        except &&
        button.closest(
          ".card-menu-wrap"
        )?.querySelector(
          ".card-menu"
        ) === except
      ) {
        return;
      }

      button.classList.remove(
        "active"
      );

      button.setAttribute(
        "aria-expanded",
        "false"
      );
    });
}


function toggleCardMenu(
  button
) {
  const wrap =
    button.closest(
      ".card-menu-wrap"
    );

  const menu =
    wrap?.querySelector(
      ".card-menu"
    );

  if (!menu) {
    return;
  }

  const shouldOpen =
    menu.classList.contains(
      "hidden"
    );

  closeCardMenus();

  if (shouldOpen) {
    menu.classList.remove(
      "hidden"
    );

    button.classList.add(
      "active"
    );

    button.setAttribute(
      "aria-expanded",
      "true"
    );
  }
}


// ------------------------------------------------------
// 찜 목록 드래그 정렬
// ------------------------------------------------------

function setupFavoritesDragSort() {
  const container =
    document.getElementById(
      "favoritesList"
    );

  if (!container) {
    return;
  }

  let dragEl = null;

  function getDragAfterElement(
    container,
    y
  ) {
    const draggableElements = [
      ...container.querySelectorAll(
        ".favorite-item:not(.dragging)"
      ),
    ];

    return draggableElements.reduce(
      (
        closest,
        child
      ) => {
        const box =
          child.getBoundingClientRect();

        const offset =
          y -
          box.top -
          box.height / 2;

        if (
          offset < 0 &&
          offset >
            closest.offset
        ) {
          return {
            offset,
            element: child,
          };
        }

        return closest;
      },
      {
        offset:
          Number.NEGATIVE_INFINITY,
        element: null,
      }
    ).element;
  }

  container.addEventListener(
    "pointerdown",
    (e) => {
      const handle =
        e.target.closest(
          ".favorite-drag-handle"
        );

      if (!handle) {
        return;
      }

      dragEl =
        handle.closest(
          ".favorite-item"
        );

      if (!dragEl) {
        return;
      }

      dragEl.setPointerCapture(
        e.pointerId
      );

      dragEl.classList.add(
        "dragging"
      );
    }
  );

  container.addEventListener(
    "pointermove",
    (e) => {
      if (!dragEl) {
        return;
      }

      const after =
        getDragAfterElement(
          container,
          e.clientY
        );

      if (after == null) {
        container.appendChild(
          dragEl
        );
      } else {
        container.insertBefore(
          dragEl,
          after
        );
      }
    }
  );

  function endDrag() {
    if (!dragEl) {
      return;
    }

    dragEl.classList.remove(
      "dragging"
    );

    dragEl = null;

    favoritesOrder = [
      ...container.querySelectorAll(
        ".favorite-item"
      ),
    ].map(
      (element) =>
        element.dataset.id
    );

    saveFavoritesOrder();
  }

  container.addEventListener(
    "pointerup",
    endDrag
  );

  container.addEventListener(
    "pointercancel",
    endDrag
  );
}


// ------------------------------------------------------
// 테마
// ------------------------------------------------------

function applyTheme(theme) {
  const normalizedTheme =
    theme === "dark"
      ? "dark"
      : "light";

  document.documentElement.setAttribute(
    "data-theme",
    normalizedTheme
  );

  const themeToggle =
    document.getElementById(
      "themeToggle"
    );

  if (themeToggle) {
    themeToggle.textContent =
      normalizedTheme === "dark"
        ? "☀️"
        : "🌙";
  }
}


function toggleTheme() {
  const current =
    document.documentElement.getAttribute(
      "data-theme"
    ) === "dark"
      ? "dark"
      : "light";

  const next =
    current === "dark"
      ? "light"
      : "dark";

  applyTheme(next);

  saveTheme(next);
}


// ------------------------------------------------------
// 컴팩트 뷰
// ------------------------------------------------------

function applyCompactView(
  isCompact
) {
  document.body.classList.toggle(
    "compact-view",
    isCompact
  );

  const toggle =
    document.getElementById(
      "compactToggle"
    );

  if (toggle) {
    toggle.textContent =
      isCompact
        ? "🖼️ 일반 보기로 전환"
        : "☰ 한 줄 보기";
  }
}


function toggleCompactView() {
  const next =
    !document.body.classList.contains(
      "compact-view"
    );

  applyCompactView(next);

  saveCompactView(next);
}


// ------------------------------------------------------
// TOP
// ------------------------------------------------------

function setupTopButton() {
  const topBtn =
    document.getElementById(
      "topBtn"
    );

  if (!topBtn) {
    return;
  }

  window.addEventListener(
    "scroll",
    () => {
      topBtn.classList.toggle(
        "hidden",
        window.scrollY < 400
      );
    }
  );

  topBtn.addEventListener(
    "click",
    () => {
      window.scrollTo({
        top: 0,
        behavior: "smooth",
      });
    }
  );
}


// ------------------------------------------------------
// 지역 버튼 / 날씨 링크
// ------------------------------------------------------

function updateAreaButtonLabel() {
  const btn =
    document.getElementById(
      "areaFilterBtn"
    );

  if (!btn) {
    return;
  }

  btn.textContent =
    getAreaLabel();

  updateWeatherLink();
}


function updateWeatherLink() {
  const weatherBtn =
    document.getElementById(
      "weatherLinkBtn"
    );

  if (!weatherBtn) {
    return;
  }

  const query =
    getWeatherSearchQuery();

  if (!query) {
    weatherBtn.classList.add(
      "hidden"
    );

    weatherBtn.removeAttribute(
      "href"
    );

    return;
  }

  weatherBtn.href =
    `https://search.naver.com/search.naver?query=${encodeURIComponent(query)}`;

  weatherBtn.classList.remove(
    "hidden"
  );
}


// ------------------------------------------------------
// 카카오톡 공유
// ------------------------------------------------------

function initializeKakao() {
  if (
    window.Kakao &&
    !Kakao.isInitialized()
  ) {
    Kakao.init(
      KAKAO_JS_KEY
    );
  }
}


function shareToKakao({
  title,
  date,
  location,
  link,
  thumbnail,
}) {
  initializeKakao();

  if (
    !window.Kakao ||
    !Kakao.isInitialized()
  ) {
    alert(
      "카카오톡 공유를 불러오지 못했어요. 잠시 후 다시 시도해주세요."
    );

    return;
  }

  if (thumbnail) {
    Kakao.Share.sendDefault({
      objectType: "feed",

      content: {
        title,

        description:
          `📅 ${date}` +
          (
            location
              ? " · " + location
              : ""
          ),

        imageUrl:
          thumbnail,

        link: {
          mobileWebUrl: link,
          webUrl: link,
        },
      },

      buttons: [
        {
          title: "🔍 상세보기",

          link: {
            mobileWebUrl: link,
            webUrl: link,
          },
        },
      ],
    });

    return;
  }

  Kakao.Share.sendDefault({
    objectType: "text",

    text:
      `📍 이번 주말 여기 어때요?\n\n` +
      `${title}\n` +
      `일정: ${date}` +
      (
        location
          ? "\n장소: " + location
          : ""
      ) +
      `\n\n👉 마음에 드시면 단톡방 투표를 열어주세요!`,

    link: {
      mobileWebUrl: link,
      webUrl: link,
    },
  });
}


// ------------------------------------------------------
// 포스터 확대
// ------------------------------------------------------

function applyZoomTransform() {
  const img =
    document.getElementById(
      "posterModalImg"
    );

  if (!img) {
    return;
  }

  img.style.transform =
    `translate(${zoomX}px, ${zoomY}px) scale(${zoomScale})`;
}


function openPosterView(src) {
  const img =
    document.getElementById(
      "posterModalImg"
    );

  const modal =
    document.getElementById(
      "posterModal"
    );

  if (!img || !modal || !src) {
    return;
  }

  img.src = src;

  zoomScale = 1;
  zoomX = 0;
  zoomY = 0;

  applyZoomTransform();

  modal.classList.remove(
    "hidden"
  );
}


function closePosterView() {
  document
    .getElementById(
      "posterModal"
    )
    ?.classList.add("hidden");

  zoomPointers.clear();

  panLast = null;

  pinchStartDist = 0;
}


function setupPosterZoom() {
  const img =
    document.getElementById(
      "posterModalImg"
    );

  const modal =
    document.getElementById(
      "posterModal"
    );

  const close =
    document.getElementById(
      "posterModalClose"
    );

  if (!img || !modal || !close) {
    return;
  }

  img.addEventListener(
    "pointerdown",
    (e) => {
      img.setPointerCapture(
        e.pointerId
      );

      zoomPointers.set(
        e.pointerId,
        {
          x: e.clientX,
          y: e.clientY,
        }
      );

      if (
        zoomPointers.size === 2
      ) {
        const pts = [
          ...zoomPointers.values(),
        ];

        pinchStartDist =
          Math.hypot(
            pts[0].x -
              pts[1].x,
            pts[0].y -
              pts[1].y
          );

        pinchStartScale =
          zoomScale;

        panLast = null;
      } else {
        panLast = {
          x: e.clientX,
          y: e.clientY,
        };
      }
    }
  );

  img.addEventListener(
    "pointermove",
    (e) => {
      if (
        !zoomPointers.has(
          e.pointerId
        )
      ) {
        return;
      }

      zoomPointers.set(
        e.pointerId,
        {
          x: e.clientX,
          y: e.clientY,
        }
      );

      if (
        zoomPointers.size === 2
      ) {
        const pts = [
          ...zoomPointers.values(),
        ];

        const dist =
          Math.hypot(
            pts[0].x -
              pts[1].x,
            pts[0].y -
              pts[1].y
          );

        if (
          pinchStartDist > 0
        ) {
          zoomScale =
            Math.min(
              4,
              Math.max(
                1,
                pinchStartScale *
                  (
                    dist /
                    pinchStartDist
                  )
              )
            );

          applyZoomTransform();
        }

        return;
      }

      if (
        zoomPointers.size === 1 &&
        zoomScale > 1 &&
        panLast
      ) {
        zoomX +=
          e.clientX -
          panLast.x;

        zoomY +=
          e.clientY -
          panLast.y;

        panLast = {
          x: e.clientX,
          y: e.clientY,
        };

        applyZoomTransform();
      }
    }
  );

  const endPointer = (e) => {
    zoomPointers.delete(
      e.pointerId
    );

    if (
      zoomPointers.size === 1
    ) {
      panLast =
        [
          ...zoomPointers.values(),
        ][0];

      pinchStartDist = 0;
    } else if (
      zoomPointers.size === 0
    ) {
      panLast = null;

      pinchStartDist = 0;

      if (
        zoomScale <= 1.02
      ) {
        zoomScale = 1;
        zoomX = 0;
        zoomY = 0;

        applyZoomTransform();
      }
    }
  };

  img.addEventListener(
    "pointerup",
    endPointer
  );

  img.addEventListener(
    "pointercancel",
    endPointer
  );

  close.addEventListener(
    "click",
    closePosterView
  );

  modal.addEventListener(
    "click",
    (e) => {
      if (e.target === modal) {
        closePosterView();
      }
    }
  );
}


// ------------------------------------------------------
// 카드 내부 동작
// ------------------------------------------------------

function handleCardClick(e) {

  // 카드 메뉴 버튼
  const menuBtn =
    e.target.closest(
      ".card-menu-btn"
    );

  if (menuBtn) {
    e.preventDefault();
    e.stopPropagation();

    toggleCardMenu(
      menuBtn
    );

    return;
  }


  // 카드 메뉴 - 숨기기
  const hideMenuBtn =
    e.target.closest(
      ".hide-card-action"
    );

  if (hideMenuBtn) {
    e.preventDefault();
    e.stopPropagation();

    const card =
      hideMenuBtn.closest(
        ".card"
      );

    closeCardMenus();

    hideItem(
      hideMenuBtn.dataset
        .hideId
    );

    card?.remove();

    return;
  }


  // 카드 메뉴 - 카카오톡
  const shareBtn =
    e.target.closest(
      ".share-btn"
    );

  if (shareBtn) {
    e.preventDefault();
    e.stopPropagation();

    shareToKakao({
      title:
        shareBtn.dataset.title,

      date:
        shareBtn.dataset.date,

      location:
        shareBtn.dataset.location,

      link:
        shareBtn.dataset.link,

      thumbnail:
        shareBtn.dataset.thumbnail,
    });

    closeCardMenus();

    return;
  }


  // 관심
  const favoriteBtn =
    e.target.closest(
      ".favorite-btn"
    );

  if (favoriteBtn) {
    e.preventDefault();
    e.stopPropagation();

    toggleFavorite(
      favoriteBtn.dataset
        .favoriteId
    );

    closeCardMenus();

    return;
  }


  // 포스터
  const poster =
    e.target.closest(
      ".card img, .card .no-img"
    );

  if (poster) {
    e.preventDefault();
    e.stopPropagation();

    const cardEl =
      poster.closest(
        ".card"
      );

    const f =
      allFestivals.find(
        (item) =>
          String(item.id) ===
          String(
            cardEl?.dataset.id
          )
      );

    if (f) {

      const posterSrc =
        f.thumbnail ||
        f.image ||
        "";

      if (posterSrc) {
        openPosterView(
          posterSrc
        );
      }
    }

    return;
  }


  // 카드 링크
  const cardLink =
    e.target.closest(
      ".card-link"
    );

  if (cardLink) {
    closeCardMenus();

    return;
  }

  closeCardMenus();
}


// ------------------------------------------------------
// 필터 전체 초기화
// ------------------------------------------------------

function resetAllFilters() {
  const search =
    document.getElementById(
      "search"
    );

  const type =
    document.getElementById(
      "typeFilter"
    );

  const month =
    document.getElementById(
      "monthFilter"
    );

  if (search) {
    search.value = "";
  }

  if (type) {
    type.value = "";
  }

  if (month) {
    month.value = "";
  }

  selectedAreas =
    new Set();

  selectedMonth =
    "";

  dateFilterMode =
    "";

  customDateStart =
    "";

  customDateEnd =
    "";

  weekendMode =
    "";

  const start =
    document.getElementById(
      "customDateStart"
    );

  const end =
    document.getElementById(
      "customDateEnd"
    );

  if (start) {
    start.value = "";
  }

  if (end) {
    end.value = "";
  }

  saveSelectedAreas();
  saveDateFilterState();

  updateAreaButtonLabel();
  updateDateQuickUI();
  renderCurrentView();

  closeFilterDrawer();
}


// ------------------------------------------------------
// 이벤트 등록
// ------------------------------------------------------

function setupActions() {

  // ----------------------------------------------------
  // 필터 패널
  // ----------------------------------------------------

  document
    .getElementById(
      "filterHandle"
    )
    ?.addEventListener(
      "click",
      toggleFilterDrawer
    );

  document
    .getElementById(
      "filterClose"
    )
    ?.addEventListener(
      "click",
      closeFilterDrawer
    );

  document
    .getElementById(
      "filterBackdrop"
    )
    ?.addEventListener(
      "click",
      closeFilterDrawer
    );

  const filterDrawer =
    document.getElementById(
      "filterDrawer"
    );

  const filterHandle =
    document.getElementById(
      "filterHandle"
    );

  filterHandle?.addEventListener(
    "pointerdown",
    startFilterSwipe
  );

  filterHandle?.addEventListener(
    "pointermove",
    moveFilterSwipe,
    {
      passive: false,
    }
  );

  filterHandle?.addEventListener(
    "pointerup",
    endFilterSwipe
  );

  filterHandle?.addEventListener(
    "pointercancel",
    endFilterSwipe
  );

  filterDrawer?.addEventListener(
    "pointerdown",
    (e) => {
      if (
        e.target.closest(
          "input, select, button, a, label"
        )
      ) {
        return;
      }

      startFilterSwipe(e);
    }
  );

  filterDrawer?.addEventListener(
    "pointermove",
    moveFilterSwipe,
    {
      passive: false,
    }
  );

  filterDrawer?.addEventListener(
    "pointerup",
    endFilterSwipe
  );

  filterDrawer?.addEventListener(
    "pointercancel",
    endFilterSwipe
  );

  document.addEventListener(
    "keydown",
    (e) => {
      if (
        e.key === "Escape" &&
        filterDrawerOpen
      ) {
        closeFilterDrawer();
      }
    }
  );


  // ----------------------------------------------------
  // 보기 전환
  // ----------------------------------------------------

  document
    .getElementById(
      "btnUrgentView"
    )
    ?.addEventListener(
      "click",
      () =>
        switchView(
          "urgent"
        )
    );

  document
    .getElementById(
      "btnListView"
    )
    ?.addEventListener(
      "click",
      () =>
        switchView(
          "list"
        )
    );


  // ----------------------------------------------------
  // 일반 필터
  // ----------------------------------------------------

  document
    .getElementById(
      "typeFilter"
    )
    ?.addEventListener(
      "change",
      () => {
        renderCurrentView();
        closeFilterDrawer();
      }
    );


  document
    .querySelectorAll(
      "#dateQuickBar .date-quick-btn"
    )
    .forEach((button) => {
      button.addEventListener(
        "click",
        () =>
          setDateFilter(
            button.dataset.mode ||
              "all"
          )
      );
    });


  document
    .getElementById(
      "customDateApply"
    )
    ?.addEventListener(
      "click",
      applyCustomDateFilter
    );


  document
    .getElementById(
      "customDateReset"
    )
    ?.addEventListener(
      "click",
      () =>
        setDateFilter(
          "all"
        )
    );


  document
    .getElementById(
      "filterResetBtn"
    )
    ?.addEventListener(
      "click",
      resetAllFilters
    );


  document
    .getElementById(
      "monthFilter"
    )
    ?.addEventListener(
      "change",
      (e) => {
        selectedMonth =
          e.target.value;

        if (selectedMonth) {
          dateFilterMode = "";
          customDateStart = "";
          customDateEnd = "";
          weekendMode = "";

          saveDateFilterState();
          updateDateQuickUI();
        }

        renderCurrentView();
        closeFilterDrawer();
      }
    );


  // ----------------------------------------------------
  // 검색
  // ----------------------------------------------------

  document
    .getElementById(
      "search"
    )
    ?.addEventListener(
      "input",
      () => {
        renderCurrentView();
      }
    );


  // ----------------------------------------------------
  // 지역
  // ----------------------------------------------------

  document
    .getElementById(
      "areaFilterBtn"
    )
    ?.addEventListener(
      "click",
      openAreaModal
    );


  document
    .getElementById(
      "areaModalClose"
    )
    ?.addEventListener(
      "click",
      closeAreaModal
    );


  document
    .getElementById(
      "areaModal"
    )
    ?.addEventListener(
      "click",
      (e) => {
        if (
          e.target.id ===
          "areaModal"
        ) {
          closeAreaModal();
        }
      }
    );


  document
    .getElementById(
      "areaSelectAll"
    )
    ?.addEventListener(
      "click",
      selectAllAreas
    );


  document
    .getElementById(
      "areaSelectNone"
    )
    ?.addEventListener(
      "click",
      selectNoAreas
    );


  document
    .getElementById(
      "areaApply"
    )
    ?.addEventListener(
      "click",
      applyAreaFilter
    );


  // ----------------------------------------------------
  // 숨긴 항목
  // ----------------------------------------------------

  document
    .getElementById(
      "hiddenManageBtn"
    )
    ?.addEventListener(
      "click",
      openHiddenModal
    );


  document
    .getElementById(
      "hiddenModalClose"
    )
    ?.addEventListener(
      "click",
      closeHiddenModal
    );


  document
    .getElementById(
      "hiddenModal"
    )
    ?.addEventListener(
      "click",
      (e) => {

        if (
          e.target.id ===
          "hiddenModal"
        ) {
          closeHiddenModal();

          return;
        }

        const restoreAllBtn =
          e.target.closest(
            ".unhide-all-btn"
          );

        if (restoreAllBtn) {
          hiddenIds.clear();

          saveHiddenIds();

          updateHiddenManageButton();

          closeHiddenModal();

          renderCurrentView();

          return;
        }

        const unhideBtn =
          e.target.closest(
            ".unhide-btn"
          );

        if (unhideBtn) {
          unhideItem(
            unhideBtn.dataset
              .unhideId
          );
        }
      }
    );


  // ----------------------------------------------------
  // 찜
  // ----------------------------------------------------

  document
    .getElementById(
      "favoritesBtn"
    )
    ?.addEventListener(
      "click",
      openFavoritesModal
    );


  document
    .getElementById(
      "favoritesModalClose"
    )
    ?.addEventListener(
      "click",
      closeFavoritesModal
    );


  document
    .getElementById(
      "favoritesModal"
    )
    ?.addEventListener(
      "change",
      (e) => {
        const input =
          e.target.closest(
            ".favorite-reminder-date"
          );

        if (!input) {
          return;
        }

        setFavoriteReminder(
          input.dataset
            .reminderId,
          input.value
        );
      }
    );


  document
    .getElementById(
      "favoritesModal"
    )
    ?.addEventListener(
      "click",
      (e) => {

        if (
          e.target.id ===
          "favoritesModal"
        ) {
          closeFavoritesModal();

          return;
        }

        const removeBtn =
          e.target.closest(
            ".favorite-remove-btn"
          );

        if (removeBtn) {
          removeFavorite(
            removeBtn.dataset
              .removeFavoriteId
          );
        }
      }
    );


  // ----------------------------------------------------
  // 카드 / 주말 / 메뉴
  // ----------------------------------------------------

  document.body.addEventListener(
    "click",
    (e) => {

      const weekendChip =
        e.target.closest(
          ".weekend-chip"
        );

      if (weekendChip) {
        weekendMode =
          weekendChip.dataset
            .mode;

        if (
          weekendMode ===
          "all"
        ) {
          dateFilterMode = "";
        } else {
          dateFilterMode =
            "weekend";
        }

        customDateStart = "";
        customDateEnd = "";

        saveDateFilterState();
        updateDateQuickUI();

        renderCurrentView();

        closeFilterDrawer();

        return;
      }

      if (
        !e.target.closest(
          ".card-menu-wrap"
        )
      ) {
        closeCardMenus();
      }
    }
  );


  // ----------------------------------------------------
  // 카드 스와이프
  // ----------------------------------------------------

  document.body.addEventListener(
    "pointerdown",
    startCardSwipe
  );


  document.body.addEventListener(
    "pointermove",
    moveCardSwipe,
    {
      passive: false,
    }
  );


  document.body.addEventListener(
    "pointerup",
    endCardSwipe
  );


  document.body.addEventListener(
    "pointercancel",
    endCardSwipe
  );


  document.body.addEventListener(
    "click",
    suppressSwipeClick,
    true
  );


  // ----------------------------------------------------
  // 카드 이미지 오류 대체
  // ----------------------------------------------------

  document.body.addEventListener(
    "error",
    (e) => {
      const img =
        e.target.closest?.(
          ".card img"
        );

      if (
        !img ||
        img.dataset.fallbackApplied ===
          "true"
      ) {
        return;
      }

      img.dataset.fallbackApplied =
        "true";

      const fallback =
        document.createElement(
          "div"
        );

      fallback.className =
        "no-img";

      fallback.textContent =
        "🏮";

      img.replaceWith(
        fallback
      );
    },
    true
  );


  // ----------------------------------------------------
  // 테마
  // ----------------------------------------------------

  document
    .getElementById(
      "themeToggle"
    )
    ?.addEventListener(
      "click",
      toggleTheme
    );


  // ----------------------------------------------------
  // 컴팩트
  // ----------------------------------------------------

  document
    .getElementById(
      "compactToggle"
    )
    ?.addEventListener(
      "click",
      toggleCompactView
    );


  // ----------------------------------------------------
  // TOP
  // ----------------------------------------------------

  setupTopButton();


  // ----------------------------------------------------
  // 찜 드래그
  // ----------------------------------------------------

  setupFavoritesDragSort();


  // ----------------------------------------------------
  // 카드 / 공유 / 메뉴
  // ----------------------------------------------------

  document.body.addEventListener(
    "click",
    handleCardClick
  );


  // ----------------------------------------------------
  // 포스터 확대
  // ----------------------------------------------------

  setupPosterZoom();
}
