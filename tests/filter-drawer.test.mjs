import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const readProjectFile = (path) =>
  readFile(
    new URL(`../${path}`, import.meta.url),
    "utf8"
  );

function sliceBetween(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);

  if (start < 0) {
    throw new Error(`Missing start marker: ${startMarker}`);
  }

  const end = source.indexOf(endMarker, start + startMarker.length);

  if (end < 0) {
    throw new Error(`Missing end marker: ${endMarker}`);
  }

  return source.slice(start, end);
}

function createClassList(initial = []) {
  const values = new Set(initial);

  return {
    add(value) {
      values.add(value);
    },
    remove(value) {
      values.delete(value);
    },
    contains(value) {
      return values.has(value);
    },
    toggle(value, force) {
      const shouldAdd =
        force === undefined
          ? !values.has(value)
          : Boolean(force);

      if (shouldAdd) {
        values.add(value);
      } else {
        values.delete(value);
      }

      return shouldAdd;
    },
  };
}

function createNode(document, inside = false) {
  const attributes = new Map();

  return {
    classList: createClassList(),
    attributes,
    inside,
    value: "",
    addAttribute(name, value) {
      attributes.set(name, String(value));
    },
    setAttribute(name, value) {
      attributes.set(name, String(value));
    },
    getAttribute(name) {
      return attributes.has(name)
        ? attributes.get(name)
        : null;
    },
    removeAttribute(name) {
      attributes.delete(name);
    },
    contains(element) {
      return Boolean(element?.inside);
    },
    focus() {
      document.activeElement = this;
    },
    getClientRects() {
      return [1];
    },
  };
}

async function createDrawerContext() {
  const source = (await readProjectFile("js/actions.js"))
    .replace(/\r\n/g, "\n");

  const helper = sliceBetween(
    source,
    "function openFilterDrawer() {",
    "function toggleFilterDrawer() {"
  );

  const document = {
    activeElement: null,
    body: {
      classList: createClassList(),
    },
    getElementById() {
      return null;
    },
  };

  const drawer = createNode(document);
  const backdrop = createNode(document);
  const handle = createNode(document);
  const closeButton = createNode(document, true);
  document.activeElement = handle;

  const nodes = {
    filterDrawer: drawer,
    filterBackdrop: backdrop,
    filterHandle: handle,
    filterClose: closeButton,
  };

  document.getElementById = (id) =>
    nodes[id] || null;

  const context = vm.createContext({
    document,
  });

  vm.runInContext(
    "let filterDrawerOpen = false;\nlet filterPointerState = null;\n" +
      helper +
      "\nglobalThis.__openFilterDrawer = openFilterDrawer;" +
      "\nglobalThis.__closeFilterDrawer = closeFilterDrawer;" +
      "\nglobalThis.__isFilterDrawerOpen = () => filterDrawerOpen;",
    context
  );

  return {
    context,
    document,
    drawer,
    backdrop,
    handle,
    closeButton,
  };
}

test(
  "필터 패널을 열면 접근성 상태를 갱신하고 닫기 버튼으로 초점을 이동한다",
  async () => {
    const {
      context,
      document,
      drawer,
      backdrop,
      handle,
      closeButton,
    } = await createDrawerContext();

    drawer.setAttribute("inert", "");
    drawer.setAttribute("aria-hidden", "true");

    context.__openFilterDrawer();

    assert.equal(context.__isFilterDrawerOpen(), true);
    assert.equal(drawer.classList.contains("open"), true);
    assert.equal(backdrop.classList.contains("visible"), true);
    assert.equal(drawer.getAttribute("inert"), null);
    assert.equal(drawer.getAttribute("aria-hidden"), "false");
    assert.equal(drawer.getAttribute("aria-modal"), "true");
    assert.equal(handle.getAttribute("aria-expanded"), "true");
    assert.equal(handle.getAttribute("aria-label"), "검색 및 필터 닫기");
    assert.equal(
      document.body.classList.contains("filter-drawer-open"),
      true
    );
    assert.equal(document.activeElement, closeButton);
  }
);

test(
  "필터 패널을 닫으면 내부 초점을 차단하고 호출 버튼으로 초점을 복귀한다",
  async () => {
    const {
      context,
      document,
      drawer,
      backdrop,
      handle,
      closeButton,
    } = await createDrawerContext();

    context.__openFilterDrawer();
    assert.equal(document.activeElement, closeButton);

    context.__closeFilterDrawer();

    assert.equal(context.__isFilterDrawerOpen(), false);
    assert.equal(drawer.classList.contains("open"), false);
    assert.equal(backdrop.classList.contains("visible"), false);
    assert.equal(drawer.getAttribute("inert"), "");
    assert.equal(drawer.getAttribute("aria-hidden"), "true");
    assert.equal(drawer.getAttribute("aria-modal"), "false");
    assert.equal(handle.getAttribute("aria-expanded"), "false");
    assert.equal(handle.getAttribute("aria-label"), "검색 및 필터 열기");
    assert.equal(
      document.body.classList.contains("filter-drawer-open"),
      false
    );
    assert.equal(document.activeElement, handle);
  }
);

test(
  "패널을 다른 창으로 전환할 때 요청하면 호출 버튼으로 초점을 복귀하지 않는다",
  async () => {
    const {
      context,
      document,
      handle,
      closeButton,
    } = await createDrawerContext();

    context.__openFilterDrawer();
    assert.equal(document.activeElement, closeButton);

    context.__closeFilterDrawer({
      restoreFocus: false,
    });

    assert.equal(document.activeElement, closeButton);
    assert.notEqual(document.activeElement, handle);
  }
);

test(
  "다이얼로그 초점 순환은 Tab과 Shift+Tab을 내부에 유지한다",
  async () => {
    const source = (await readProjectFile("js/actions.js"))
      .replace(/\r\n/g, "\n");

    const helper = sliceBetween(
      source,
      "function keepFocusInside(container, event) {",
      "// ------------------------------------------------------\n// 필터 패널"
    );

    const document = {
      activeElement: null,
    };

    const context = vm.createContext({
      document,
    });

    vm.runInContext(
      helper +
        "\nglobalThis.__keepFocusInside = keepFocusInside;",
      context
    );

    const first = {
      getClientRects: () => [1],
      focus() {
        document.activeElement = first;
      },
    };

    const last = {
      getClientRects: () => [1],
      focus() {
        document.activeElement = last;
      },
    };

    const container = {
      querySelectorAll: () => [first, last],
      contains(element) {
        return element === first || element === last;
      },
      focus() {
        document.activeElement = container;
      },
    };

    let prevented = false;
    document.activeElement = last;

    context.__keepFocusInside(container, {
      shiftKey: false,
      preventDefault() {
        prevented = true;
      },
    });

    assert.equal(prevented, true);
    assert.equal(document.activeElement, first);

    prevented = false;
    context.__keepFocusInside(container, {
      shiftKey: true,
      preventDefault() {
        prevented = true;
      },
    });

    assert.equal(prevented, true);
    assert.equal(document.activeElement, last);
  }
);

test(
  "날짜 조건을 변경해도 필터 패널을 유지한다",
  async () => {
    const source = (await readProjectFile("js/actions.js"))
      .replace(/\r\n/g, "\n");

    const dateFilter = sliceBetween(
      source,
      "function setDateFilter(mode) {",
      "function applyCustomDateFilter() {"
    );

    const monthFilter = {
      value: "2026-12",
    };

    const calls = {
      save: 0,
      update: 0,
      render: 0,
    };

    const context = vm.createContext({
      filterDrawerOpen: true,
      dateFilterMode: "",
      customDateStart: "2026-12-01",
      customDateEnd: "2026-12-31",
      selectedMonth: "2026-12",
      weekendMode: "",
      document: {
        getElementById(id) {
          return id === "monthFilter"
            ? monthFilter
            : null;
        },
      },
      saveDateFilterState() {
        calls.save += 1;
      },
      updateDateQuickUI() {
        calls.update += 1;
      },
      renderCurrentView() {
        calls.render += 1;
      },
    });

    vm.runInContext(
      dateFilter +
        "\nglobalThis.__setDateFilter = setDateFilter;" +
        "\nglobalThis.__isFilterDrawerOpen = () => filterDrawerOpen;" +
        "\nglobalThis.__getDateFilterMode = () => dateFilterMode;" +
        "\nglobalThis.__getWeekendMode = () => weekendMode;",
      context
    );

    context.__setDateFilter("weekend");

    assert.equal(context.__isFilterDrawerOpen(), true);
    assert.equal(context.__getDateFilterMode(), "weekend");
    assert.equal(context.__getWeekendMode(), "this");
    assert.equal(monthFilter.value, "");
    assert.equal(calls.save, 1);
    assert.equal(calls.update, 1);
    assert.equal(calls.render, 1);
  }
);
