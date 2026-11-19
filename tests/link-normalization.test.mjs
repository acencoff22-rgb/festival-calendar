import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const source = (await readFile(
  new URL("../js/logic.js", import.meta.url),
  "utf8"
)).replace(/\r\n/g, "\n");

const start = source.indexOf("function normalizeHttpUrl(value)");
const end = source.indexOf(
  "// ------------------------------------------------------\n// 검색 대상 텍스트",
  start
);

assert.notEqual(start, -1, "URL normalizer must exist");
assert.notEqual(end, -1, "eventLink boundary must exist");

const helper = source.slice(start, end);
const context = vm.createContext({ URL, cleanTitleForSearch: (value) => String(value ?? "") });

vm.runInContext(
  helper +
    "\nglobalThis.__normalizeHttpUrl = normalizeHttpUrl;" +
    "\nglobalThis.__eventLink = eventLink;",
  context
);

const normalizeHttpUrl = context.__normalizeHttpUrl;

test(
  "스킴이 빠진 일반·한글 도메인은 HTTPS로 보정한다",
  () => {
    const cases = [
      ["www.왕인문화축제.kr", "https://www.왕인문화축제.kr"],
      ["summer-hunter.com", "https://summer-hunter.com"],
      ["dh.go.kr", "https://dh.go.kr"],
      ["거창한마당축제.kr", "https://거창한마당축제.kr"],
      ["www.buan.go.kr/tour/index.buan", "https://www.buan.go.kr/tour/index.buan"],
    ];

    for (const [input, expected] of cases) {
      assert.equal(normalizeHttpUrl(input), expected, input);
    }
  }
);

test(
  "한 개의 슬래시만 있는 잘못된 HTTP(S) URL을 보정한다",
  () => {
    assert.equal(
      normalizeHttpUrl("https:/bhftf.or.kr"),
      "https://bhftf.or.kr"
    );

    assert.equal(
      normalizeHttpUrl("http:/example.com/path"),
      "http://example.com/path"
    );
  }
);

test(
  "정상 HTTP(S) 및 protocol-relative URL은 유지한다",
  () => {
    assert.equal(
      normalizeHttpUrl("https://example.com/path?q=1"),
      "https://example.com/path?q=1"
    );

    assert.equal(
      normalizeHttpUrl("http://example.com"),
      "http://example.com"
    );

    assert.equal(
      normalizeHttpUrl("//example.com/path"),
      "https://example.com/path"
    );
  }
);

test(
  "비HTTP 스킴, 사용자 정보, 상대 경로는 차단한다",
  () => {
    const rejected = [
      "javascript:alert(1)",
      "data:text/html,hello",
      "ftp://example.com/file",
      "//user@example.com/path",
      "https://user@example.com/path",
      "https://example.com:99999/path",
      "https://:443/path",
      "../relative/path",
      "not a domain",
      "",
    ];

    for (const input of rejected) {
      assert.equal(normalizeHttpUrl(input), "", input);
    }
  }
);

test(
  "행사별 상세 페이지는 일반 홈페이지 링크보다 우선한다",
  () => {
    assert.equal(
      context.__eventLink({
        detailUrl: "https://official.example.com/event",
        link: "https://ticket.example.com",
        url: "https://homepage.example.com",
        title: "검증 행사",
      }),
      "https://official.example.com/event"
    );
  }
);

test(
  "행사별 상세 페이지 URL이 안전하지 않으면 다음 안전한 링크를 사용한다",
  () => {
    assert.equal(
      context.__eventLink({
        detailUrl: "javascript:alert(1)",
        link: "www.example.com/ticket",
        url: "https://homepage.example.com",
        title: "검증 행사",
      }),
      "https://www.example.com/ticket"
    );
  }
);

