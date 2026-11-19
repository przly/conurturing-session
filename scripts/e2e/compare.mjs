// Compares two form-regression runs: screen text and logged events/answers
// (ignores health/talk events, which depend on timing and the fake mic).
// Usage: node scripts/e2e/compare.mjs <baselineDir> <newDir>
import fs from 'node:fs'
import path from 'node:path'

const [a, b] = process.argv.slice(2)
const read = (dir, f) => fs.readFileSync(path.join(dir, f), 'utf8')
const key = (d) =>
  JSON.stringify({
    order: d.order,
    events: d.events.filter((e) => !['health', 'talk'].includes(e.type)).map((e) => [e.round, e.form, e.type, e.meta?.source]),
    answers: d.answers.map((x) => [x.round, x.form, x.question_id, x.value]),
  })
const textsSame = read(a, 'texts.txt') === read(b, 'texts.txt')
const dataSame = key(JSON.parse(read(a, 'data.json'))) === key(JSON.parse(read(b, 'data.json')))
const errors = read(b, 'errors.txt').trim()
console.log(`screen text: ${textsSame ? 'identical' : 'DIFFERENT'}`)
console.log(`events + answers: ${dataSame ? 'identical' : 'DIFFERENT'}`)
console.log(`page errors: ${errors || 'none'}`)
process.exit(textsSame && dataSame && !errors ? 0 : 1)
