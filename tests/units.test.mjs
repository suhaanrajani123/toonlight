// Unit tests for the quiz shuffling and document search (no browser needed).
// Run: node tests/units.test.mjs
import assert from 'node:assert/strict';
globalThis.localStorage = { _: {}, getItem(k) { return this._[k] ?? null; }, setItem(k, v) { this._[k] = String(v); }, removeItem(k) { delete this._[k]; } };
const { extractQuiz, parseAnswer, rememberAsked, isRepeat, askedBefore, pickStyle } = await import('../docs/js/quiz.js');
const { passagesFor, quizPassage } = await import('../docs/js/docs.js');

// 1. the right answer lands in every position about equally often, and stays correct
const raw = '[happy] Go! [quiz: {"q":"2+2?","options":["4","3","5","22"],"answer":0,"explain":"Two plus two."}]';
const pos = [0, 0, 0, 0];
for (let i = 0; i < 4000; i++) {
  const { text, quiz } = extractQuiz(raw);
  assert.equal(text, '[happy] Go!');
  assert.equal(quiz.options[quiz.answer], '4', 'correct option tracked through the shuffle');
  pos[quiz.answer]++;
}
for (const n of pos) assert.ok(n > 850 && n < 1150, `answer position spread evenly ${pos}`);
console.log('ok  shuffle is fair', pos.join('/'));

// 2. "All of the above" stays last; letters stripped; bad JSON ignored
const q2 = extractQuiz('[quiz: {"q":"x","options":["A. red","B) blue","green","All of the above"],"answer":3}]').quiz;
assert.equal(q2.options[3], 'All of the above');
assert.ok(q2.options.includes('red') && q2.options.includes('blue'));
assert.equal(extractQuiz('[quiz: {nope}]').quiz, null);
assert.equal(extractQuiz('[quiz: {"q":"x","options":["a","a","b","c"],"answer":0}]').quiz, null, 'duplicate options rejected');
assert.equal(extractQuiz('[quiz: {"q":"x","options":["a","b"],"answer":5}]').quiz, null, 'answer out of range rejected');
console.log('ok  quiz tag parsing');

// 3. typed answers
const q3 = { options: ['red', 'blue', 'green', 'yellow'] };
assert.equal(parseAnswer('B', q3), 1);
assert.equal(parseAnswer('c)', q3), 2);
assert.equal(parseAnswer('option d', q3), 3);
assert.equal(parseAnswer('the second one', q3), 1);
assert.equal(parseAnswer('Green', q3), 2);
assert.equal(parseAnswer('why is it blue?', q3), null);
assert.equal(parseAnswer('e', q3), null);
console.log('ok  typed answers');

// 4. no repeats
rememberAsked('topic:x', 'What does LIFO stand for in a stack?');
assert.ok(isRepeat('topic:x', 'What does LIFO stand for in a stack'), 'near-identical question caught');
assert.ok(!isRepeat('topic:x', 'Which data structure is used for undo history?'));
for (let i = 0; i < 100; i++) rememberAsked('topic:x', `q${i}`);
assert.equal(askedBefore('topic:x').length, 80, 'history capped');
for (let i = 0; i < 50; i++) { const a = pickStyle('definition'); assert.notEqual(a, 'definition'); }
console.log('ok  no-repeat memory + style rotation');

// 5. document search finds the right passage; quiz passages rotate through the document
const doc = { name: 'bio.pdf', chunks: [
  { text: 'Mitochondria are the powerhouse of the cell and make ATP through respiration.', page: 1 },
  { text: 'Photosynthesis happens in chloroplasts, using light to make glucose.', page: 2 },
  { text: 'DNA is copied during the S phase of the cell cycle before mitosis.', page: 3 },
  { text: 'Enzymes speed up reactions by lowering activation energy, and they can be denatured by heat.', page: 4 },
] };
assert.equal(passagesFor(doc, 'what do enzymes do?')[0].where, 'page 4');
assert.equal(passagesFor(doc, 'where is ATP made')[0].where, 'page 1');
assert.equal(passagesFor(doc, 'summarize this document').length, 4, 'summary questions see the whole document');
const seen = new Set(); const used = [];
for (let i = 0; i < 3; i++) { const p = quizPassage(doc, used); assert.ok(!used.includes(p.index), 'never reuses a recent passage'); used.push(p.index); seen.add(p.index); }
assert.equal(seen.size, 3);
console.log('ok  document search + quiz passages\nall unit tests passed');
