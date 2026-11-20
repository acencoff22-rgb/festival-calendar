import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const payload = JSON.parse(
  await readFile(
    new URL("../festivals.json", import.meta.url),
    "utf8"
  )
);

const validSources = new Set([
  "tourapi",
  "culture",
  "culturePortal",
  "kopis",
]);

const validTypes = new Set([
  "festival",
  "performance",
]);

function isValidDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(
    String(value ?? "")
  );

  if (!match) {
    return false;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(
    Date.UTC(year, month - 1, day)
  );

  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

test(
  "행사 데이터의 개수와 출처 상태가 저장 메타데이터와 일치한다",
  () => {
    assert.ok(Array.isArray(payload.festivals));
    assert.equal(payload.count, payload.festivals.length);
    assert.ok(payload.festivals.length > 0);
    assert.ok(
      payload.sourceStatus &&
      Object.values(payload.sourceStatus).every(
        (status) => status === true
      )
    );
  }
);

test(
  "행사 ID·출처·유형·날짜가 유효하고 중복 ID가 없다",
  () => {
    const ids = new Set();

    for (const [index, item] of payload.festivals.entries()) {
      assert.ok(item && typeof item === "object", `row ${index}`);
      assert.ok(validSources.has(item.source), `source: row ${index}`);
      assert.ok(validTypes.has(item.type), `type: row ${index}`);
      assert.ok(
        typeof item.id === "string" && item.id.trim(),
        `id: row ${index}`
      );
      assert.ok(
        !ids.has(item.id),
        `duplicate id: ${item.id}`
      );
      ids.add(item.id);

      assert.ok(
        typeof item.title === "string" && item.title.trim(),
        `title: row ${index}`
      );
      assert.ok(isValidDate(item.startDate), `startDate: ${item.id}`);
      assert.ok(isValidDate(item.endDate), `endDate: ${item.id}`);
      assert.ok(
        item.startDate <= item.endDate,
        `reversed date range: ${item.id}`
      );

      const hasLat = item.lat !== null && item.lat !== undefined;
      const hasLon = item.lon !== null && item.lon !== undefined;
      assert.equal(
        hasLat,
        hasLon,
        `incomplete coordinate pair: ${item.id}`
      );

      if (hasLat && hasLon) {
        assert.ok(Number.isFinite(item.lat), `latitude: ${item.id}`);
        assert.ok(Number.isFinite(item.lon), `longitude: ${item.id}`);
        assert.ok(item.lat >= -90 && item.lat <= 90, `latitude range: ${item.id}`);
        assert.ok(item.lon >= -180 && item.lon <= 180, `longitude range: ${item.id}`);
      }
    }
  }
);
