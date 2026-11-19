import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const logic = (
  await readFile(
    new URL("../js/logic.js", import.meta.url),
    "utf8"
  )
).replace(/\r\n/g, "\n");

const startMarker =
  "function compareFestivalStart(a, b) {";

const endMarker =
  "// ------------------------------------------------------\n// 임박순 정렬";

const start =
  logic.indexOf(startMarker);

const end =
  logic.indexOf(
    endMarker,
    start
  );

assert.notEqual(start, -1, "list comparator must exist");
assert.notEqual(end, -1, "list comparator boundary must exist");

const comparatorSource =
  logic.slice(start, end);

const context = {
  getFestivalStartDate(event) {
    return event?.startDate
      ? new Date(`${event.startDate}T00:00:00Z`)
      : null;
  },

  getFestivalEndDate(event) {
    return event?.endDate
      ? new Date(`${event.endDate}T00:00:00Z`)
      : this.getFestivalStartDate(event);
  },

  isFestivalEnded(event) {
    const endDate = this.getFestivalEndDate(event);
    return Boolean(
      endDate &&
      endDate < new Date("2026-11-19T00:00:00Z")
    );
  },

  isFestivalOngoing(event) {
    const startDate = this.getFestivalStartDate(event);
    const endDate = this.getFestivalEndDate(event);
    const today = new Date("2026-11-19T00:00:00Z");

    return Boolean(
      startDate &&
      endDate &&
      startDate <= today &&
      today <= endDate
    );
  },
};

vm.createContext(context);

vm.runInContext(
  comparatorSource +
    String.fromCharCode(10) +
    "globalThis.__compareFestivalStart = compareFestivalStart;",
  context
);

const compare =
  context.__compareFestivalStart;

const event = (id, startDate, endDate = startDate) => ({
  id,
  startDate,
  endDate,
});

test(
  "현재 진행 중인 행사는 앞으로 시작할 행사보다 먼저 나온다",
  () => {
    const ongoing = event("ongoing", "2026-11-01", "2026-11-21");
    const upcoming = event("upcoming", "2026-11-20");

    assert.ok(compare(ongoing, upcoming) < 0);
  }
);

test(
  "앞으로 시작할 행사는 시작일이 빠른 순서다",
  () => {
    const later = event("later", "2026-11-25");
    const sooner = event("sooner", "2026-11-20");

    assert.ok(compare(sooner, later) < 0);
  }
);

test(
  "종료된 행사는 진행 중·예정 행사보다 뒤에 나온다",
  () => {
    const ended = event("ended", "2026-11-15");
    const upcoming = event("upcoming", "2026-11-20");

    assert.ok(compare(upcoming, ended) < 0);
  }
);

test(
  "종료된 행사는 가장 최근에 끝난 행사부터 나온다",
  () => {
    const older = event("older", "2026-11-10", "2026-11-12");
    const newer = event("newer", "2026-11-16", "2026-11-18");

    assert.ok(compare(newer, older) < 0);
  }
);

test(
  "진행 중인 행사는 종료일이 가까운 순서다",
  () => {
    const laterEnd = event("later-end", "2026-11-01", "2026-11-25");
    const soonerEnd = event("sooner-end", "2026-11-10", "2026-11-20");

    assert.ok(compare(soonerEnd, laterEnd) < 0);
  }
);

test(
  "시작일이 없는 항목은 유효한 일정 뒤로 보낸다",
  () => {
    const missingDate = { id: "missing" };
    const valid = event("valid", "2026-11-20");

    assert.ok(compare(valid, missingDate) < 0);
    assert.equal(compare(missingDate, missingDate), 0);
  }
);
