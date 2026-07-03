import {
  aggressiveStrategy,
  defensiveStrategy,
  greedyStrategy,
  jackSaverStrategy,
  pointHunterStrategy,
  randomStrategy,
  safeStrategy,
} from './heuristics'
import { makeMonteCarloBot } from './monteCarlo'
import type { BotProfile } from './types'

// Ordered easy → hard so the picker can list them top to bottom. Ids are stable
// and persisted in game state. The three trailing entries are personality
// aliases that reuse a base strategy with a human archetype name.
export const BOTS: BotProfile[] = [
  { id: 'random', name: 'Şansçı', difficulty: 'Acemi', strategy: randomStrategy },
  { id: 'greedy', name: 'Toplayıcı', difficulty: 'Kolay', strategy: greedyStrategy },
  { id: 'villageUncle', name: 'Köylü Amca', difficulty: 'Kolay', strategy: greedyStrategy },
  { id: 'safe', name: 'Temkinli', difficulty: 'Kolay-Orta', strategy: safeStrategy },
  { id: 'pointHunter', name: 'Puncu', difficulty: 'Orta', strategy: pointHunterStrategy },
  { id: 'jackSaver', name: 'Vale Cambazı', difficulty: 'Orta', strategy: jackSaverStrategy },
  { id: 'aggressive', name: 'Atak', difficulty: 'Orta-Zor', strategy: aggressiveStrategy },
  { id: 'streetShark', name: 'Sokak Kurdu', difficulty: 'Orta-Zor', strategy: aggressiveStrategy },
  { id: 'defensive', name: 'Duvar', difficulty: 'Orta-Zor', strategy: defensiveStrategy },
  { id: 'cafeRegular', name: 'Kahveci', difficulty: 'Orta-Zor', strategy: defensiveStrategy },
  { id: 'mc16', name: 'Turnuvacı', difficulty: 'Zor', strategy: makeMonteCarloBot(16) },
  { id: 'mc24', name: 'Monte Carlo', difficulty: 'Zor', strategy: makeMonteCarloBot(24) },
  { id: 'mc40', name: 'Uzman', difficulty: 'Çok Zor', strategy: makeMonteCarloBot(40) },
  { id: 'mc48', name: 'Vegas Pro', difficulty: 'Çok Zor', strategy: makeMonteCarloBot(48) },
]

const BY_ID = new Map(BOTS.map((bot) => [bot.id, bot]))

export const DEFAULT_BOT_ID = 'random'

export function getBot(id: string): BotProfile {
  return BY_ID.get(id) ?? BY_ID.get(DEFAULT_BOT_ID)!
}
