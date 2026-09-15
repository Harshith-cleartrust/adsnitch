import { PACK_KEYWORDS } from './pack-keyword-lists.js'

export const POLICY_PACKS = [
  { id: 'GAMBLING', name: 'Gambling', populated: true },
  { id: 'ADULT', name: 'Adult', populated: true },
  { id: 'ALCOHOL', name: 'Alcohol', populated: true },
  { id: 'CANNABIS', name: 'Cannabis', populated: true },
  { id: 'DATING', name: 'Dating', populated: true },
  { id: 'TOBACCO', name: 'Tobacco', populated: true },
  { id: 'WEAPONS', name: 'Weapons', populated: true },
  { id: 'CRYPTOCURRENCY', name: 'Cryptocurrency', populated: true },
  { id: 'POLITICS', name: 'Politics', populated: true },
  { id: 'WEIGHT_LOSS', name: 'Weight loss', populated: true },
]

export { PACK_KEYWORDS }

export function packById(id) {
  return POLICY_PACKS.find((pack) => pack.id === id) || null
}

export function keywordsForPack(id) {
  const languages = PACK_KEYWORDS[id] || {}
  return Object.entries(languages).flatMap(([language, words]) =>
    words.map((keyword) => ({
      keyword: String(keyword).trim().toLowerCase(),
      language,
      category: id,
    })),
  )
}

export function packKeywordCount(id) {
  return keywordsForPack(id).length
}
