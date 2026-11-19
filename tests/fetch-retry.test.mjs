import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const script = await readFile(
  new URL("../fetch-festivals.mjs", import.meta.url),
  "utf8"
);

const normalizedScript =
  script.replace(/\r\n/g, "\n");

const startMarker =
  "const RETRYABLE_HTTP_STATUSES";

const endMarker =
  "// ======================================================\n// 환경변수";

const start =
  normalizedScript.indexOf(startMarker);

const end =
  normalizedScript.indexOf(
    endMarker,
    start
  );

assert.notEqual(
  start,
  -1,
  "fetch retry helper must exist"
);

assert.notEqual(
  end,
  -1,
  "fetch retry helper boundary must exist"
);

const helperSource =
  script.slice(
    start,
    end
  );

function createFetchWithRetry(
  mockFetch,
  delays = [],
  logs = []
) {
  const context = {
    fetch: mockFetch,

    AbortSignal: {
      timeout(milliseconds) {
        return {
          timeout: milliseconds,
          marker: Symbol("timeout"),
        };
      },
    },

    setTimeout(callback, milliseconds) {
      delays.push(milliseconds);
      callback();
      return 1;
    },

    logSanitizedError(...values) {
      logs.push(values);
    },

    redactApiSecrets(value) {
      return String(value);
    },
  };

  vm.createContext(context);

  vm.runInContext(
    helperSource +
      "\\nglobalThis.__fetchWithRetry = fetchWithRetry;",
    context
  );

  return context.__fetchWithRetry;
}

function response(
  status,
  retryAfter = ""
) {
  return {
    status,
    headers: {
      get(name) {
        return name.toLowerCase() === "retry-after"
          ? retryAfter
          : null;
      },
    },
  };
}

test(
  "일시적인 HTTP 503은 재시도 후 성공한다",
  async () => {
    const queue = [
      response(503),
      response(200),
    ];

    const delays = [];
    let calls = 0;

    const fetchWithRetry =
      createFetchWithRetry(
        async () => {
          calls += 1;
          return queue.shift();
        },
        delays
      );

    const result =
      await fetchWithRetry(
        "https://example.test/api"
      );

    assert.equal(result.status, 200);
    assert.equal(calls, 2);
    assert.deepEqual(delays, [1500]);
  }
);

test(
  "429 응답은 Retry-After 초 단위를 따른다",
  async () => {
    const queue = [
      response(429, "2"),
      response(200),
    ];

    const delays = [];

    const fetchWithRetry =
      createFetchWithRetry(
        async () => queue.shift(),
        delays
      );

    const result =
      await fetchWithRetry(
        "https://example.test/api"
      );

    assert.equal(result.status, 200);
    assert.deepEqual(delays, [2000]);
  }
);

test(
  "Retry-After 대기 시간은 30초를 넘지 않는다",
  async () => {
    const queue = [
      response(503, "3600"),
      response(200),
    ];

    const delays = [];

    const fetchWithRetry =
      createFetchWithRetry(
        async () => queue.shift(),
        delays
      );

    const result =
      await fetchWithRetry(
        "https://example.test/api"
      );

    assert.equal(result.status, 200);
    assert.deepEqual(delays, [30000]);
  }
);

test(
  "재시도 횟수를 모두 사용하면 마지막 HTTP 응답을 반환한다",
  async () => {
    const delays = [];
    let calls = 0;

    const fetchWithRetry =
      createFetchWithRetry(
        async () => {
          calls += 1;
          return response(503);
        },
        delays
      );

    const result =
      await fetchWithRetry(
        "https://example.test/api"
      );

    assert.equal(result.status, 503);
    assert.equal(calls, 3);
    assert.deepEqual(delays, [1500, 3000]);
  }
);

test(
  "재시도하지 않는 HTTP 400은 바로 반환한다",
  async () => {
    const delays = [];
    let calls = 0;

    const fetchWithRetry =
      createFetchWithRetry(
        async () => {
          calls += 1;
          return response(400);
        },
        delays
      );

    const result =
      await fetchWithRetry(
        "https://example.test/api"
      );

    assert.equal(result.status, 400);
    assert.equal(calls, 1);
    assert.deepEqual(delays, []);
  }
);

test(
  "네트워크 예외도 재시도하고 각 시도에 새 timeout signal을 만든다",
  async () => {
    const delays = [];
    const signals = [];
    let calls = 0;

    const fetchWithRetry =
      createFetchWithRetry(
        async (_url, options) => {
          calls += 1;
          signals.push(options.signal);

          if (calls === 1) {
            throw new Error("temporary network failure");
          }

          return response(200);
        },
        delays
      );

    const result =
      await fetchWithRetry(
        "https://example.test/api"
      );

    assert.equal(result.status, 200);
    assert.equal(calls, 2);
    assert.deepEqual(delays, [1500]);
    assert.notEqual(signals[0], signals[1]);
    assert.equal(signals[0].timeout, 60000);
    assert.equal(signals[1].timeout, 60000);
  }
);
