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

// ---- reminder times follow the reply's words ----
{
  const { clockTimes, alignTimes, cardNote } = await import('../docs/js/actions.js');
  assert.deepEqual(clockTimes('Set for 4pm today'), [960]);
  assert.deepEqual(clockTimes('at 4:30 PM, then 16:30 again'), [990]);
  assert.deepEqual(clockTimes('noon or 9 a.m.'), [720, 540]);
  assert.deepEqual(clockTimes('in 20 minutes'), []);
  const made = new Date(2026, 9, 21, 15, 38).getTime();
  // the screenshot bug: text says 4pm, tag says 5pm (as a clock time, or as minutes from now)
  let [a] = alignTimes([{ type: 'reminder', text: 'x', at: '2026-10-21T17:00' }], "I've set a reminder for 4pm today", made);
  assert.equal(a.at, '2026-10-21T16:00');
  [a] = alignTimes([{ type: 'reminder', text: 'x', in_minutes: 82 }], 'Reminder at 4pm, tap the button', made);
  assert.equal(a.at, '2026-10-21T16:00'); assert.equal(a.in_minutes, undefined);
  // left alone: matching time, relative times, or two different times
  const ok = { type: 'reminder', text: 'x', at: '2026-10-21T16:00' };
  assert.equal(alignTimes([ok], 'Set for 4pm', made)[0], ok);
  const rel = { type: 'reminder', text: 'x', in_minutes: 60 };
  assert.equal(alignTimes([rel], "I'll remind you in an hour, before your 6pm class", made)[0], rel);
  const ev = { type: 'calendar', title: 'Study', start: '2026-10-22T15:00', minutes: 120 };
  assert.equal(alignTimes([ev], 'Study group from 4pm to 6pm tomorrow', made)[0], ev);
  assert.equal(alignTimes([ev], 'Study group tomorrow at 4pm', made)[0].start, '2026-10-22T16:00');
  // the AI is told what each card said
  assert.match(cardNote({ type: 'reminder', text: 'faizan ka khatna', at: '2026-10-21T17:00' }, made), /^Card shown: reminder "faizan ka khatna" .*5:00/);
  console.log('ok  reminder time matches the reply');
}
