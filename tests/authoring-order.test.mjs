import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import test from "node:test";

const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
const start = html.indexOf("function authoringPhraseOptions(");
const end = html.indexOf("\nasync function prepareAuthoringVerses", start);
assert.ok(start >= 0 && end > start, "authoring option helpers should be present");
const helperSource = html.slice(start, end);

function build(word, data, otherOptions = []) {
  const context = {
    arr: value => Array.isArray(value) ? value : [],
    authoringState: { detail: { otherOptions } },
  };
  runInNewContext(helperSource, context);
  return JSON.parse(JSON.stringify(context.authoringOptionsForWord(word, data)));
}

test("per-occurrence phrase comes first in each legacy dropdown group", () => {
  const options = build(
    { kjv: "current KJV", ylt: "current Young" },
    {
      kjv_phrases: ["frequent KJV", "current KJV", "other KJV"],
      ylt_phrases: ["frequent Young", "current Young", "other Young"],
    },
    [{ option_id: 9, idx: 1, text: "custom A" },
     { option_id: 12, idx: 2, text: "custom B" }],
  );
  assert.deepEqual(options.map(x => x.label), [
    "— default —",
    "KJV: current KJV", "KJV: frequent KJV", "KJV: other KJV",
    "Young's: current Young", "Young's: frequent Young", "Young's: other Young",
    "Other: custom A", "Other: custom B",
  ]);
  assert.equal(options[7].optionId, 9);
  assert.equal(options[8].optionId, 12);
});

test("a phrase absent from the top twelve is prepended and the group remains capped", () => {
  const phrases = Array.from({ length: 12 }, (_, i) => "phrase " + (i + 1));
  const options = build(
    { kjv: "rare occurrence", ylt: null },
    { kjv_phrases: phrases, ylt_phrases: [] },
  );
  const kjv = options.filter(x => x.source === 1);
  assert.equal(kjv.length, 12);
  assert.equal(kjv[0].text, "rare occurrence");
  assert.deepEqual(kjv.slice(1).map(x => x.text), phrases.slice(0, 11));
});

test("root-code lemma words use the same phrase option builder without a Strong's number", () => {
  const options = build(
    { kjv: "root KJV", ylt: "root Young" },
    { lemma: "root:11.1.2", kjv_phrases: ["root KJV"], ylt_phrases: ["root Young"] },
  );
  assert.equal(options[1].text, "root KJV");
  assert.equal(options[2].text, "root Young");
});


test("a saved lemma default remains effective when absent from the current phrase shortlist", () => {
  const context = {
    arr: value => Array.isArray(value) ? value : [],
    authoringState: { detail: { otherOptions: [] } },
  };
  const end = html.indexOf("\\nasync function prepareAuthoringVerses", start);
  runInNewContext(html.slice(start, end), context);
  const options = context.authoringOptionsForWord(
    { kjv: "current KJV", ylt: "current Young" },
    { kjv_phrases: ["current KJV"], ylt_phrases: ["current Young"] },
  );
  const selected = context.authoringSelection(
    options, 0, { rendering: "a formerly common phrase" },
  );
  assert.equal(selected.choiceIndex, 0);
  assert.equal(selected.rendering, "a formerly common phrase");
});

test("an available lemma-default phrase selects its existing dropdown index", () => {
  const context = {
    arr: value => Array.isArray(value) ? value : [],
    authoringState: { detail: { otherOptions: [] } },
  };
  const end = html.indexOf("\\nasync function prepareAuthoringVerses", start);
  runInNewContext(html.slice(start, end), context);
  const options = context.authoringOptionsForWord(
    { kjv: "current KJV", ylt: "current Young" },
    { kjv_phrases: ["current KJV", "saved phrase"], ylt_phrases: [] },
  );
  const selected = context.authoringSelection(options, 0, { rendering: "saved phrase" });
  assert.equal(selected.choiceIndex, 2);
  assert.equal(selected.rendering, "saved phrase");
});
