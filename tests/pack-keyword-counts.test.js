import assert from 'node:assert/strict'
import test from 'node:test'
import { POLICY_PACKS, keywordsForPack, packKeywordCount } from '../src/server/policy-packs.js'

test('every category pack has more than 200 keywords', () => {
  for (const pack of POLICY_PACKS) {
    const count = packKeywordCount(pack.id)
    assert.ok(
      count > 200,
      `${pack.id} has ${count} keywords, expected more than 200`,
    )
    const rows = keywordsForPack(pack.id)
    assert.equal(rows.length, count)
    assert.ok(rows.every((row) => row.category === pack.id))
    assert.ok(rows.every((row) => row.keyword.length >= 2))
  }
})
