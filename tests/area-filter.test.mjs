import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const readProjectFile = (path) =>
  readFile(
    new URL(`../${path}`, import.meta.url),
    "utf8"
  );

function sliceBetween(
  source,
  startMarker,
  endMarker
) {
  const start = source.indexOf(startMarker);

  if (start < 0) {
    throw new Error(`Missing start marker: ${startMarker}`);
  }

  const end = source.indexOf(
    endMarker,
    start + startMarker.length
  );

  if (end < 0) {
    throw new Error(`Missing end marker: ${endMarker}`);
  }

  return source.slice(start, end);
}

test(
  "수집기는 구·신 광주/전남 명칭을 광주특별시로 통합한다",
  async () => {
    const source = (await readProjectFile("fetch-festivals.mjs"))
      .replace(/\r\n/g, "\n");

    const codeMap = sliceBetween(
      source,
      "const AREA_NAME_BY_CODE =",
      "// ======================================================\n// 제목 정규화"
    );

    const areaHelpers = sliceBetween(
      source,
      "const CANONICAL_AREA_MAP =",
      "// ======================================================\n// 날짜"
    );

    const context = vm.createContext({});

    vm.runInContext(
      codeMap +
        "\n" +
        areaHelpers +
        "\nglobalThis.__areaNameByCode = AREA_NAME_BY_CODE;" +
        "\nglobalThis.__normalizeAreaName = normalizeAreaName;" +
        "\nglobalThis.__deriveAreaFromAddress = deriveAreaFromAddress;",
      context
    );

    for (const alias of [
      "전남광주통합특별시",
      "전남광주통합",
      "광주특별시",
      "광주광역시",
      "광주",
      "전라남도",
      "전남",
      "무안군",
      "무안",
      "함평군",
      "함평",
      "해남군",
      "해남",
      "여수시",
      "여수",
      "순천시",
      "순천",
      "광양시",
      "광양",
      "화순군",
      "화순",
      "나주시",
      "나주",
      "목포시",
      "목포",
      "영암군",
      "영암",
      "강진군",
      "강진",
      "완도군",
      "완도",
      "진도군",
      "진도",
      "신안군",
      "신안",
      "장흥군",
      "장흥",
      "보성군",
      "보성",
      "곡성군",
      "곡성",
      "구례군",
      "구례",
      "고흥군",
      "고흥",
      "장성군",
      "장성",
      "담양군",
      "담양",
      "영광군",
      "영광",
    ]) {
      assert.equal(
        context.__normalizeAreaName(alias),
        "광주특별시",
        alias
      );
    }

    assert.equal(
      context.__areaNameByCode[5],
      "광주특별시"
    );

    assert.equal(
      context.__areaNameByCode[38],
      "광주특별시"
    );

    assert.equal(
      context.__normalizeAreaName("해외"),
      "해외"
    );
  }
);

test(
  "주소와 장소명에서 통합특별시 지역을 보완한다",
  async () => {
    const source = (await readProjectFile("fetch-festivals.mjs"))
      .replace(/\r\n/g, "\n");

    const codeMap = sliceBetween(
      source,
      "const AREA_NAME_BY_CODE =",
      "// ======================================================\n// 제목 정규화"
    );

    const areaHelpers = sliceBetween(
      source,
      "const CANONICAL_AREA_MAP =",
      "// ======================================================\n// 날짜"
    );

    const context = vm.createContext({});

    vm.runInContext(
      codeMap +
        "\n" +
        areaHelpers +
        "\nglobalThis.__deriveAreaFromAddress = deriveAreaFromAddress;",
      context
    );

    const examples = [
      "전남광주통합특별시 무안군 삼향읍",
      "화순읍 남산공원 일원",
      "양림오거리+우일선선교사사택",
      "땅끝마을일원",
      "해남군 미황사 일원",
      "여수시 행사장",
      "순천시 문화예술회관",
      "광양시 일원",
      "함평 엑스포공원 일원",
      "보성 차문화공원",
      "영광 굴비거리",
    ];

    for (const value of examples) {
      assert.equal(
        context.__deriveAreaFromAddress(value),
        "광주특별시",
        value
      );
    }
  }
);

test(
  "앱 데이터 정규화도 기존 광주/전남 지역을 통합한다",
  async () => {
    const source = (await readProjectFile("js/data.js"))
      .replace(/\r\n/g, "\n");

    const normalizers = sliceBetween(
      source,
      "function normalizeText(value)",
      "// ------------------------------------------------------\n// 카테고리 정규화"
    );

    const context = vm.createContext({});

    vm.runInContext(
      normalizers +
        "\nglobalThis.__normalizeArea = normalizeArea;",
      context
    );

    for (const value of [
      "전남광주통합특별시",
      "전남광주통합",
      "광주광역시",
      "전라남도",
      "전남",
      "광주",
      "광주특별시",
      "여수시",
      "여수",
      "순천시",
      "순천",
      "광양시",
      "광양",
      "무안",
      "함평",
      "해남",
      "화순",
      "나주",
      "목포",
      "영암",
      "강진",
      "완도",
      "진도",
      "신안",
      "장흥",
      "보성",
      "곡성",
      "구례",
      "고흥",
      "장성",
      "담양",
      "영광",
    ]) {
      assert.equal(
        context.__normalizeArea(value),
        "광주특별시",
        value
      );
    }

    assert.equal(
      context.__normalizeArea("서울특별시"),
      "서울"
    );
  }
);

test(
  "기존 사용자 지역 필터 선택값을 새 행정구역으로 이전한다",
  async () => {
    const source = (await readProjectFile("js/storage.js"))
      .replace(/\r\n/g, "\n");

    const loader = sliceBetween(
      source,
      "function loadSelectedAreas()",
      "function saveSelectedAreas()"
    );

    const context = vm.createContext({
      localStorage: {
        getItem(key) {
          assert.equal(key, "selectedAreas");

          return JSON.stringify([
            "광주",
            "전남",
            "전남광주통합특별시",
            "강원",
          ]);
        },
      },
    });

    vm.runInContext(
      loader +
        "\nglobalThis.__loadSelectedAreas = loadSelectedAreas;",
      context
    );

    const migrated = Array.from(
      context.__loadSelectedAreas()
    );

    assert.deepEqual(
      migrated,
      ["광주특별시", "강원"]
    );
  }
);

test(
  "지역 선택 모달 체크박스를 지역 목록에서 생성한다",
  async () => {
    const [stateSource, uiSource] = await Promise.all([
      readProjectFile("js/state.js"),
      readProjectFile("js/ui.js"),
    ]);

    const state = stateSource.replace(/\r\n/g, "\n");
    const ui = uiSource.replace(/\r\n/g, "\n");

    const areaOrder = sliceBetween(
      state,
      "const AREA_DISPLAY_ORDER =",
      "const WEEKDAYS ="
    );

    const initializer = sliceBetween(
      ui,
      "function initializeAreaCheckboxes()",
      "// ------------------------------------------------------\n// UI 초기화"
    );

    const container = {
      children: [],
      replaceChildren(fragment) {
        this.children = [...fragment.children];
      },
    };

    const document = {
      getElementById(id) {
        return id === "areaCheckboxList"
          ? container
          : null;
      },

      createDocumentFragment() {
        return {
          children: [],
          append(child) {
            this.children.push(child);
          },
        };
      },

      createElement(tag) {
        return {
          tag,
          children: [],
          append(...children) {
            this.children.push(...children);
          },
        };
      },
    };

    const context = vm.createContext({
      document,
      selectedAreas: new Set(["광주특별시"]),
    });

    vm.runInContext(
      areaOrder +
        "\n" +
        initializer +
        "\nglobalThis.__initializeAreaCheckboxes = initializeAreaCheckboxes;" +
        "\nglobalThis.__areas = AREA_DISPLAY_ORDER;",
      context
    );

    context.__initializeAreaCheckboxes();

    const labels = container.children;
    const values = labels.map(
      (label) => label.children[0].value
    );

    assert.equal(values.length, 18);
    assert.deepEqual(
      values,
      Array.from(context.__areas)
    );

    assert.ok(values.includes("광주특별시"));
    assert.ok(values.includes("해외"));
    assert.ok(values.includes("전국"));
    assert.ok(!values.includes("광주"));
    assert.ok(!values.includes("전남"));

    const integratedRegion = labels.find(
      (label) =>
        label.children[0].value === "광주특별시"
    );

    assert.equal(
      integratedRegion.children[0].checked,
      true
    );

    assert.equal(
      integratedRegion.children[1].textContent,
      "광주특별시"
    );
  }
);

test(
  "KOPIS의 국가명이 포함된 해외 공연 장소를 해외로 분류한다",
  async () => {
    const source = (await readProjectFile("fetch-festivals.mjs"))
      .replace(/\r\n/g, "\n");

    const helper = sliceBetween(
      source,
      "function isLikelyOverseasPerformance(",
      "// ======================================================\n// KOPIS"
    );

    const context = vm.createContext({});

    vm.runInContext(
      helper +
        "\nglobalThis.__isLikelyOverseasPerformance = isLikelyOverseasPerformance;",
      context
    );

    assert.equal(
      context.__isLikelyOverseasPerformance(
        "JEONGHAN X JOSHUA JOURNEY INTO: DREAMING [일본]",
        "베루나 돔 [일본 사이타마]"
      ),
      true
    );

    assert.equal(
      context.__isLikelyOverseasPerformance(
        "국내 콘서트",
        "강릉아트센터"
      ),
      false
    );
  }
);


test(
  "문화축제 표준데이터의 상세 장소명으로 누락 지역을 보완한다",
  async () => {
    const source = (await readProjectFile("fetch-festivals.mjs"))
      .replace(/\r\n/g, "\n");

    const codeMap = sliceBetween(
      source,
      "const AREA_NAME_BY_CODE =",
      "// ======================================================\n// 제목 정규화"
    );

    const areaHelpers = sliceBetween(
      source,
      "const CANONICAL_AREA_MAP =",
      "// ======================================================\n// 날짜"
    );

    const context = vm.createContext({});

    vm.runInContext(
      codeMap +
        "\n" +
        areaHelpers +
        "\nglobalThis.__deriveAreaFromAddress = deriveAreaFromAddress;",
      context
    );

    const cases = [
      ["울릉군 도동항", "경북"],
      ["울릉군 저동항", "경북"],
      ["울릉군 일원", "경북"],
      ["충남 계룡시일원(계룡대 활주로 및 시가지)", "충남"],
      ["화랑대 철도공원 일원", "서울"],
      ["노원역 일원(KB국민은행/롯데백화점)", "서울"],
      ["당현천 일원(상계역~중계역)", "서울"],
    ];

    for (const [location, expected] of cases) {
      assert.equal(
        context.__deriveAreaFromAddress(location),
        expected,
        location
      );
    }
  }
);
