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
  {
    id: 'random',
    name: 'Şansçı',
    difficulty: 'Acemi',
    blurb: 'Eline ne gelirse onu oynar, strateji diye bir şey duymamış.',
    strategy: randomStrategy,
  },
  {
    id: 'greedy',
    name: 'Toplayıcı',
    difficulty: 'Kolay',
    blurb: 'Masada ne görürse kapar, doyma bilmez.',
    strategy: greedyStrategy,
  },
  {
    id: 'villageUncle',
    name: 'Köylü Amca',
    difficulty: 'Kolay',
    blurb: 'Kart saymaz, gönlünden geçeni oynar; çoğu zaman şanslıdır.',
    strategy: greedyStrategy,
  },
  {
    id: 'safe',
    name: 'Temkinli',
    difficulty: 'Kolay-Orta',
    blurb: 'Riske girmeden, küçük adımlarla ilerlemeyi sever.',
    strategy: safeStrategy,
  },
  {
    id: 'pointHunter',
    name: 'Puncu',
    difficulty: 'Orta',
    blurb: 'Sadece puanlı kartların peşinde, gerisiyle ilgilenmez.',
    strategy: pointHunterStrategy,
  },
  {
    id: 'jackSaver',
    name: 'Vale Cambazı',
    difficulty: 'Orta',
    blurb: 'Valesini cebinde saklar, doğru anı sabırla kollar.',
    strategy: jackSaverStrategy,
  },
  {
    id: 'aggressive',
    name: 'Atak',
    difficulty: 'Orta-Zor',
    blurb: 'Her fırsatta saldırır, geri adım atmayı bilmez.',
    strategy: aggressiveStrategy,
  },
  {
    id: 'streetShark',
    name: 'Sokak Kurdu',
    difficulty: 'Orta-Zor',
    blurb: 'Masanın kabadayısı; verdiği kartı geri istemez.',
    strategy: aggressiveStrategy,
  },
  {
    id: 'defensive',
    name: 'Duvar',
    difficulty: 'Orta-Zor',
    blurb: 'Önce savunur, sonra oynar; sabrı taştan.',
    strategy: defensiveStrategy,
  },
  {
    id: 'cafeRegular',
    name: 'Kahveci',
    difficulty: 'Orta-Zor',
    blurb: 'Çayını yudumlarken bile hesabını yapar.',
    strategy: defensiveStrategy,
  },
  {
    id: 'mc16',
    name: 'Turnuvacı',
    difficulty: 'Zor',
    blurb: 'Her ihtimali hesaplar ama acelesi vardır.',
    strategy: makeMonteCarloBot(16),
  },
  {
    id: 'mc24',
    name: 'Monte Carlo',
    difficulty: 'Zor',
    blurb: 'Kafasında binlerce senaryoyu aynı anda oynatır.',
    strategy: makeMonteCarloBot(24),
  },
  {
    id: 'mc40',
    name: 'Uzman',
    difficulty: 'Çok Zor',
    blurb: 'Hata yapmaz, pişman da olmaz.',
    strategy: makeMonteCarloBot(40),
  },
  {
    id: 'mc48',
    name: 'Vegas Pro',
    difficulty: 'Çok Zor',
    blurb: 'Kumarhaneden yeni çıkmış gibi her kartı hesaplar.',
    strategy: makeMonteCarloBot(48),
  },
]

const BY_ID = new Map(BOTS.map((bot) => [bot.id, bot]))

export const DEFAULT_BOT_ID = 'random'

export function getBot(id: string): BotProfile {
  return BY_ID.get(id) ?? BY_ID.get(DEFAULT_BOT_ID)!
}
