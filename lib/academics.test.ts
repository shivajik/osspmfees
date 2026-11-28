import { test } from "node:test";
import assert from "node:assert/strict";
import { STREAM_SUFFIX, classLevel, classStream, compareClassNames, normalizeClassName } from "@/lib/academics";

test("streams are kept and understood for classes 11 and 12", () => {
  assert.equal(normalizeClassName("11th Arts"), "Class 11 Arts");
  assert.equal(normalizeClassName("XI science"), "Class 11 Science");
  assert.equal(normalizeClassName("Class 12 - Commerce"), "Class 12 Commerce");
  assert.equal(normalizeClassName("12th (Science)"), "Class 12 Science");
  assert.equal(classLevel("11th Arts"), 11);
  assert.equal(classStream("11th Arts"), "Arts");
  assert.equal(classStream("8th"), "");
});

test("plain classes are unchanged", () => {
  assert.equal(normalizeClassName("8th"), "Class 8");
  assert.equal(normalizeClassName("VIII"), "Class 8");
  assert.equal(normalizeClassName("Jr. KG"), "Jr. KG");
  assert.equal(normalizeClassName("Class 10 Toppers"), "10 Toppers");
});

test("order: 10, 11, 11 Arts, 11 Science, 12, 12 Commerce", () => {
  const sorted = ["12th Commerce", "11th Science", "12th", "10th", "11th Arts", "11th"].sort(compareClassNames);
  assert.deepEqual(sorted, ["10th", "11th", "11th Arts", "11th Science", "12th", "12th Commerce"]);
});

test("science sub-streams: Medical, Non-Medical, both", () => {
  assert.equal(normalizeClassName("11th Medical"), "Class 11 Medical");
  assert.equal(normalizeClassName("XII non-medical"), "Class 12 Non-Medical");
  assert.equal(normalizeClassName("11 Medical & Non-Medical"), "Class 11 Medical & Non-Medical");
  assert.equal(classStream("Class 12 Non-Medical"), "Non-Medical");
  assert.equal("Class 11 Non-Medical".replace(STREAM_SUFFIX, ""), "Class 11");
  assert.equal("Class 11 Medical & Non-Medical".replace(STREAM_SUFFIX, ""), "Class 11");
  assert.equal("Class 11 Medical".replace(STREAM_SUFFIX, ""), "Class 11");
});
