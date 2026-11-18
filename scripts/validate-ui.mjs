import { readFile } from "node:fs/promises";
import vm from "node:vm";

const readSource = (path) => readFile(new URL("../" + path, import.meta.url), "utf8");
function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const rendered = [];
const container = {
  replaceChildren(fragment) {
    rendered.splice(0, rendered.length, ...fragment.children);
  },
};
const documentStub = {
  getElementById(id) {
    return id === "areaCheckboxList" ? container : null;
  },
  createDocumentFragment() {
    return { children: [], append(node) { this.children.push(node); } };
  },
  createElement(tag) {
    return { tag, children: [], append(...nodes) { this.children.push(...nodes); } };
  },
};

const uiContext = vm.createContext({ document: documentStub, URL, console });
vm.runInContext(await readSource("js/state.js"), uiContext);
vm.runInContext(await readSource("js/logic.js"), uiContext);
vm.runInContext(await readSource("js/render.js"), uiContext);
vm.runInContext('selectedAreas = new Set(["강원"]); renderAreaCheckboxes();', uiContext);

const areaValues = rendered.map((label) => label.children[0].value);
assert(areaValues.length === 17, "지역 체크박스 수 오류: " + areaValues.length);
assert(new Set(areaValues).size === areaValues.length, "지역 체크박스 값 중복");
assert(areaValues.includes("광주·전남"), "통합 지역 체크박스 누락");
assert(areaValues.includes("해외"), "해외 지역 체크박스 누락");
assert(!areaValues.includes("광주") && !areaValues.includes("전남"), "구 지역 체크박스가 남아 있음");
assert(rendered.find((label) => label.children[0].value === "강원").children[0].checked, "저장된 지역 선택 상태 미반영");
assert(vm.runInContext('safeExternalUrl("javascript:alert(1)")', uiContext) === "", "javascript URL 차단 실패");
assert(vm.runInContext('safeExternalUrl("data:text/html,test")', uiContext) === "", "data URL 차단 실패");
assert(vm.runInContext('safeExternalUrl("www.example.com/path")', uiContext) === "https://www.example.com/path", "스킴 없는 URL 보정 실패");
assert(vm.runInContext('normalizeImageUrl("http://example.com/poster.jpg")', uiContext) === "https://example.com/poster.jpg", "이미지 URL HTTPS 보정 실패");

const storage = new Map([["selectedAreas", JSON.stringify(["광주", "전남", "강원"])]]);
const storageContext = vm.createContext({
  localStorage: {
    getItem(key) { return storage.has(key) ? storage.get(key) : null; },
    setItem(key, value) { storage.set(key, String(value)); },
  },
});
vm.runInContext(await readSource("js/storage.js"), storageContext);
const migrated = JSON.parse(vm.runInContext('JSON.stringify([...loadSelectedAreas()])', storageContext));
assert(migrated.includes("광주·전남"), "기존 통합 지역 선택 마이그레이션 실패");
assert(!migrated.includes("광주") && !migrated.includes("전남"), "기존 지역 선택이 정리되지 않음");
assert(migrated.includes("강원"), "다른 지역 선택이 마이그레이션 중 손실됨");

console.log("UI/지역 필터/외부 링크 검증 통과");
