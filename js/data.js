// ======================================================
// js/data.js
// festivals.json 로딩 및 데이터 초기화
// ======================================================


// ------------------------------------------------------
// 지역 정규화
// ------------------------------------------------------

function normalizeFestivalArea(festival) {
  if (!festival) return "";

  const raw = String(festival.area || "").trim();
  const locationText = `${festival.location || ""} ${festival.address || ""}`;
  const titleText = String(festival.title || "");
  const source = `${raw} ${locationText}`;

  const rules = [
    ["서울", /서울(?:특별시)?/],
    ["부산", /부산(?:광역시)?/],
    ["대구", /대구(?:광역시)?/],
    ["인천", /인천(?:광역시)?/],
    ["광주", /광주(?:광역시|특별시)?/],
    ["대전", /대전(?:광역시)?/],
    ["울산", /울산(?:광역시)?/],
    ["세종", /세종(?:특별자치시)?/],
    ["경기", /경기(?:도)?/],
    ["강원", /강원(?:특별자치도|도)?/],
    ["충북", /충청북|충북/],
    ["충남", /충청남|충남/],
    ["전북", /전라북|전북/],
    ["전남", /전라남|전남/],
    ["경북", /경상북|경북/],
    ["경남", /경상남|경남/],
    ["제주", /제주(?:특별자치도|도)?/],
  ];

  if (/\[(?:중국|일본|베트남|홍콩|대만|미국|싱가포르|태국|해외)|(?:\[일본|\[중국)/.test(`${locationText} ${titleText}`)) {
    return "기타";
  }

  if (/포항|경주|안동|구미|김천|영주|영천|상주|문경|경산|칠곡|의성|울진|영덕|청도|성주|고령|봉화|예천|청송/.test(locationText)) {
    return "경북";
  }

  for (const [area, pattern] of rules) {
    if (pattern.test(source)) return area;
  }

  for (const [area, pattern] of rules) {
    if (pattern.test(titleText)) return area;
  }

  if (raw === "해외") return "기타";
  return raw;
}

function normalizeFestivalRecord(festival) {
  return {
    ...festival,
    area: normalizeFestivalArea(festival),
  };
}


// ------------------------------------------------------
// 데이터 로딩
// ------------------------------------------------------



// ------------------------------------------------------
// 찜 목록 알림 배너
// ------------------------------------------------------

function renderReminderBanner() {
  const banner = document.getElementById("reminderBanner");

  if (!banner) {
    return;
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const remindersForDisplay = Object.entries(reminders || {})
    .map(([id, date]) => ({
      id: String(id),
      date: String(date),
      time: new Date(`${date}T00:00:00`).getTime(),
    }))
    .filter((item) =>
      /^\d{4}-\d{2}-\d{2}$/.test(item.date) &&
      Number.isFinite(item.time) &&
      item.time >= today.getTime()
    )
    .sort((a, b) => a.time - b.time);

  if (!remindersForDisplay.length) {
    banner.classList.add("hidden");
    banner.innerHTML = "";
    return;
  }

  const lines = remindersForDisplay
    .map((item) => {
      const festival = allFestivals.find(
        (f) => String(f.id) === item.id
      );

      if (!festival) {
        return "";
      }

      const diff = Math.round(
        (item.time - today.getTime()) / 86400000
      );
      const when =
        diff === 0
          ? "오늘"
          : diff === 1
            ? "내일"
            : item.date;

      return `<div class="reminder-banner-item">
        <span>⏰</span>
        <strong>${escapeHtml(festival.title || "행사")}</strong>
        <span>— ${escapeHtml(when)}</span>
      </div>`;
    })
    .filter(Boolean);

  if (!lines.length) {
    banner.classList.add("hidden");
    banner.innerHTML = "";
    return;
  }

  banner.innerHTML = lines.join("");
  banner.classList.remove("hidden");
}


async function load() {
  try {
    const res =
      await fetch(
        "festivals.json",
        {
          cache: "no-store",
        }
      );

    if (!res.ok) {
      throw new Error(`축제 데이터 로딩 실패 (${res.status})`);
    }

    const json =
      await res.json();

    if (!json || !Array.isArray(json.festivals)) {
      throw new Error("축제 데이터 형식이 올바르지 않습니다.");
    }

    allFestivals =
      (json.festivals || []).map(
        normalizeFestivalRecord
      );

    reconcileReminders(
      allFestivals.map((f) => String(f.id))
    );

    // 모든 데이터 소스가 정상 갱신된 경우에만
    // 저장된 관심/숨김 목록의 고아 ID를 정리한다.
    // 일부 소스가 실패한 상태에서는 기존 저장 상태를 보존한다.
    const hasSourceFailure =
      Object.values(
        json.sourceStatus || {}
      ).some((ok) => ok === false);

    if (!hasSourceFailure) {
      reconcileStoredState(
        new Set(
          allFestivals.map((f) => String(f.id))
        )
      );
    }


    // --------------------------------------------------
    // 인기 행사
    //
    // mentions가 있는 행사 중
    // 상위 15개를 인기 행사로 지정한다.
    // --------------------------------------------------

    const ranked =
      allFestivals
        .filter(
          (f) =>
            typeof f.mentions ===
            "number"
        )
        .sort(
          (a, b) =>
            b.mentions -
            a.mentions
        )
        .slice(0, 15);

    hotIds =
      new Set(
        ranked.map(
          (f) => String(f.id)
        )
      );


    // --------------------------------------------------
    // 마지막 업데이트 표시
    // --------------------------------------------------

    const updated =
      new Date(
        json.updatedAt
      );

    const updatedValid = !Number.isNaN(updated.getTime());
    const staleHours = updatedValid
      ? (Date.now() - updated.getTime()) / 3600000
      : Infinity;

    document.getElementById(
      "updatedAt"
    ).textContent =
      `${updatedValid
        ? `마지막 업데이트: ${updated.toLocaleString("ko-KR")}`
        : "업데이트 시각 확인 필요"} · 총 ${allFestivals.length}건`;


    // --------------------------------------------------
    // 데이터 소스 상태
    // --------------------------------------------------

    const SOURCE_LABELS = {
      tourapi:
        "지역축제(TourAPI)",

      culture:
        "문화축제 표준데이터",

      kopis:
        "공연(KOPIS)",

      mentions:
        "인기도(언급량)",
    };

    const failed =
      Object.entries(
        json.sourceStatus ||
          {}
      )
        .filter(
          ([, ok]) =>
            ok === false
        )
        .map(
          ([key]) =>
            SOURCE_LABELS[key] ||
            key
        );

    const banner =
      document.getElementById(
        "statusBanner"
      );

    if (failed.length > 0) {
      banner.textContent =
        `⚠️ ${failed.join(", ")} 갱신에 실패해서 일부 정보가 최신이 아닐 수 있어요.`;
      banner.classList.remove("hidden");
    } else if (staleHours > 36) {
      banner.textContent =
        `⚠️ 행사 데이터가 ${Math.floor(staleHours)}시간 이상 갱신되지 않았습니다.`;
      banner.classList.remove("hidden");
    } else {
      banner.classList.add("hidden");
    }



    // --------------------------------------------------
    // 지역 필터 생성
    // --------------------------------------------------

    buildAreaFilter();


    // --------------------------------------------------
    // 월 필터 생성
    // --------------------------------------------------

    buildMonthFilter();


    // --------------------------------------------------
    // 지역 버튼 및 날씨 링크
    // --------------------------------------------------

    updateAreaButtonLabel();


    // --------------------------------------------------
    // 현재 화면 렌더링
    // --------------------------------------------------

    renderCurrentView();
    renderReminderBanner();

  } catch (e) {
    const urgentView =
      document.getElementById("urgentView");

    if (urgentView) {
      urgentView.innerHTML = `
        <div class="empty">
          <strong>행사 데이터를 불러오지 못했습니다.</strong><br>
          네트워크 상태를 확인한 뒤 다시 시도해주세요.<br>
          <button type="button" class="btn" onclick="retryLoadData()">다시 불러오기</button>
        </div>`;
    }

    const banner =
      document.getElementById("statusBanner");

    if (banner) {
      banner.textContent =
        "⚠️ 행사 데이터를 불러오지 못했습니다. 잠시 후 다시 시도해주세요.";
      banner.classList.remove("hidden");
    }

    console.error(e);
  }
}


// ------------------------------------------------------
// 데이터 재시도
// ------------------------------------------------------

async function retryLoadData() {
  const urgentView =
    document.getElementById("urgentView");

  if (urgentView) {
    urgentView.innerHTML =
      '<div class="empty">행사 데이터를 다시 불러오는 중입니다...</div>';
  }

  await load();
}


// ------------------------------------------------------
// 오늘 알림 배너
// ------------------------------------------------------




// ------------------------------------------------------
// 지역 필터 생성
// ------------------------------------------------------

function buildAreaFilter() {
  const usedAreas =
    new Set(
      allFestivals
        .map(
          (f) => f.area
        )
        .filter(Boolean)
    );

  const orderedAreas = [
    ...AREA_DISPLAY_ORDER.filter(
      (a) =>
        usedAreas.has(a)
    ),

    ...[
      ...usedAreas,
    ]
      .filter(
        (a) =>
          !AREA_DISPLAY_ORDER.includes(
            a
          )
      )
      .sort(),
  ];

  const checkboxList =
    document.getElementById(
      "areaCheckboxList"
    );

  checkboxList.innerHTML =
    orderedAreas
      .map(
        (area) => `
        <label class="area-checkbox-item">
          <input
            type="checkbox"
            value="${escapeAttr(area)}"
          />
          ${escapeAttr(area)}
        </label>`
      )
      .join("");
}


// ------------------------------------------------------
// 월 필터 생성
// ------------------------------------------------------

function buildMonthFilter() {
  const monthKeys =
    new Set();

  for (const f of allFestivals) {
    if (!f.startDate) {
      continue;
    }

    const start =
      new Date(
        f.startDate
      );

    const end =
      f.endDate
        ? new Date(
            f.endDate
          )
        : start;

    const cursor =
      new Date(
        start.getFullYear(),
        start.getMonth(),
        1
      );

    const endCursor =
      new Date(
        end.getFullYear(),
        end.getMonth(),
        1
      );

    while (
      cursor <=
      endCursor
    ) {
      monthKeys.add(
        `${cursor.getFullYear()}-${String(
          cursor.getMonth() + 1
        ).padStart(
          2,
          "0"
        )}`
      );

      cursor.setMonth(
        cursor.getMonth() + 1
      );
    }
  }

  const monthSelect =
    document.getElementById(
      "monthFilter"
    );

  monthSelect
    .querySelectorAll(
      "option:not(:first-child)"
    )
    .forEach(
      (option) =>
        option.remove()
    );

  [
    ...monthKeys,
  ]
    .sort()
    .forEach(
      (key) => {
        const [y, m] =
          key.split("-");

        const opt =
          document.createElement(
            "option"
          );

        opt.value =
          key;

        opt.textContent =
          `${y}년 ${Number(
            m
          )}월`;

        monthSelect.appendChild(
          opt
        );
      }
    );

  // 저장된 월 필터를 옵션 생성 후 복원한다.
  if (selectedMonth && monthKeys.has(selectedMonth)) {
    monthSelect.value = selectedMonth;
  } else if (selectedMonth) {
    selectedMonth = "";
    saveDateFilterState();
    monthSelect.value = "";
  }
}