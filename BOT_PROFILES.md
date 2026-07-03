# Pisti Bot Profiles & Development Prompts

## Core Bot Profiles (7 difficulty levels)

### 1. **Random**
**Difficulty:** Beginner  
**Description:** Plays any legal card with equal probability  
**Strategy:** No strategy — complete randomness  
**Use case:** Baseline, worst-case bot for training data  

**Decision Logic:**
- From all legal moves, pick one at random
- No card evaluation

---

### 2. **Greedy**
**Difficulty:** Easy  
**Description:** Captures whenever possible; minimizes risk when not capturing  
**Strategy:** Maximize capture points, avoid wasting high-value cards  
**Use case:** Beginner player behavior  

**Decision Logic:**
- **If can capture:** Choose capture that maximizes points gained
  - Slight penalty for using Jack unless it matches the table's top card
- **If cannot capture:** Play the lowest-value card that:
  1. Minimizes card points (Ace=1, 2♣=2, 10♦=3, others=0)
  2. Avoids Jacks (leave them for capturing)
  3. Prioritizes lower-rank cards

---

### 3. **Safe**
**Difficulty:** Easy-Medium  
**Description:** Conservative player who prioritizes not giving opponent easy pisti (single-card table)  
**Strategy:** Never leave dangerous single cards; capture when valuable  
**Use case:** Cautious beginner, defensive play  

**Decision Logic:**
- **If can capture:** Choose capture that maximizes points gained
- **If cannot capture:** Play the lowest-value card that:
  1. Avoids leaving single cards on table (pisti gift) — highest priority
  2. Minimizes card points
  3. Avoids Jacks
  4. Prioritizes lower-rank cards

---

### 4. **PointHunter**
**Difficulty:** Medium  
**Description:** Aggressively chases high-point cards (Aces, Jacks, 2♣, 10♦)  
**Strategy:** Maximize total points captured regardless of risk  
**Use case:** Reward-focused player  

**Decision Logic:**
- **If can capture:** Choose capture that maximizes points gained (same as Greedy/Safe)
- **If cannot capture:** Play the lowest-value card that:
  1. Minimizes card points (penalize high-value cards)
  2. Avoids Jacks
  3. Prioritizes lower-rank cards

---

### 5. **JackSaver**
**Difficulty:** Medium  
**Description:** Treats Jacks as precious resources; uses them only for high-value captures  
**Strategy:** Preserve Jacks, use non-Jack captures first, avoid wasting Jacks  
**Use case:** Experienced player with card counting intuition  

**Decision Logic:**
- Categorize legal moves:
  - `rankCaps`: Captures with non-Jack cards
  - `jackCaps`: Captures with Jacks
  - `nonJacks`: Non-Jack cards
- **Priority order:**
  1. **Use rank captures first** (non-Jack captures)
  2. **Use Jack captures only if:**
     - Table has ≥2 points worth of cards, OR
     - It's a "Jack Pisti" (single Jack on table, capturing with Jack = 20 points)
  3. **When must play but can't capture:**
     - Play non-Jacks first (prefer: low points, low rank)
     - Only use Jacks if no non-Jacks remain

---

### 6. **Aggressive**
**Difficulty:** Medium-Hard  
**Description:** Plays to set up future pisti opportunities for themselves  
**Strategy:** Discard singleton cards from hand to create single-card tables  
**Use case:** Strong offensive player, sets traps  

**Decision Logic:**
- **If can capture:** Choose capture that maximizes points gained
- **If cannot capture:** Play card avoiding "pair cards" (cards with duplicates in hand)
  - Logic: Cards without duplicates in hand are safer to discard without wasting pairs
  - Among those, play lowest-value then non-Jack cards

---

### 7. **Defensive**
**Difficulty:** Medium-Hard  
**Description:** Conservative blocker; similar to Safe but with Jack awareness  
**Strategy:** Block opponent traps, avoid dangerous tables, respect Jacks  
**Use case:** Defensive player, counter-strategy  

**Decision Logic:**
- **If can capture:** Choose capture that maximizes points gained
- **If cannot capture:** Play the lowest-value card that:
  1. Avoids leaving single cards (pisti gift)
  2. Minimizes card points
  3. Avoids Jacks
  4. Prioritizes lower-rank cards

---

## Monte Carlo Bots (2 variants by world count)

### 8. **Tournament Player** (Monte Carlo, 16 worlds)
**Difficulty:** Hard  
**Description:** Mid-strength Monte Carlo expert; reasonable lookahead  
**Strategy:** Simulate 16 possible game outcomes from current position  
**Use case:** Medium-strength opponent, "card counting" personality  
**Monte Carlo Worlds:** 16 (faster, less accurate than Expert)

---

### 9. **Monte Carlo** (24 worlds)
**Difficulty:** Hard  
**Description:** Strong Monte Carlo expert; solid game tree evaluation  
**Strategy:** Simulate 24 possible game outcomes from current position  
**Use case:** Strong opponent, reliable expert  
**Monte Carlo Worlds:** 24 (balanced speed/accuracy)

---

### 10. **Expert** (Monte Carlo, 40 worlds)
**Difficulty:** Very Hard  
**Description:** Expert Monte Carlo player; deep game tree evaluation  
**Strategy:** Simulate 40 possible game outcomes from current position  
**Use case:** Strongest pure strategy bot, reference baseline  
**Monte Carlo Worlds:** 40 (thorough but slower)

---

### 11. **Vegas Pro** (Monte Carlo, 48 worlds)
**Difficulty:** Very Hard  
**Description:** Ultra-expert Monte Carlo; maximum lookahead depth  
**Strategy:** Simulate 48 possible game outcomes from current position  
**Use case:** Hardest pure strategy bot, tournament-grade player  
**Monte Carlo Worlds:** 48 (most thorough, slowest)

---

## Personality Aliases (Human archetypes)

These are named variants that wrap the core strategies for narrative/personality flavor:

### 12. **Village Uncle** → Greedy
**Archetype:** Friendly neighborhood player  
**Personality:** Basic, straightforward, captures whenever he can  
**Same as:** Greedy bot

---

### 13. **Cafe Regular** → Defensive
**Archetype:** Seasoned coffee-shop player  
**Personality:** Careful, defensive, doesn't fall for traps  
**Same as:** Defensive bot

---

### 14. **Street Shark** → Aggressive
**Archetype:** Competitive street hustler  
**Personality:** Aggressive, sets up traps, high-risk/high-reward  
**Same as:** Aggressive bot

---

## Game-Relevant Rules & Point Values

### Scoring (needed for bot logic)
- **Ace (A):** 1 point
- **Jack (J):** 1 point
- **2♣ (Two of Clubs):** 2 points
- **10♦ (Ten of Diamonds):** 3 points
- **Card majority (>26 cards):** 3 points
- **Pişti (capture single card):** 10 points
- **Jack Pişti (Jack over single Jack):** 20 points

### Capture Rules
- Card captures if:
  - It's a Jack (Jack captures any card), OR
  - Its rank matches the top card on table
- Capturing single card = **Pişti** (10-point bonus)
- Capturing single Jack with Jack = **Jack Pişti** (20-point bonus)

---

## Implementation Notes

1. **Ranking priority:** Always when choosing between cards, use a tuple of criteria (lower-value matches higher-priority)
   - Example: `(avoid_pisti_gift, card_points, is_jack, card_rank)`
   - Comparison is lexicographic (left-most difference wins)

2. **Pair detection:** Card has "pair in hand" if you hold 2+ cards of same rank

3. **Capture evaluation:** When choosing *which* capture, always maximize `CaptureGain()` = points on table + card points + bonuses

4. **Random tiebreaker:** When multiple cards have equal priority, pick randomly (or first-encountered)

5. **Legal moves:** Always work with `g.LegalActions()` — engine validates

---

## Development Checklist

- [ ] Random: Random selection
- [ ] Greedy: Capture priority + minimal hand value
- [ ] Safe: Pisti-gift avoidance + capture priority
- [ ] PointHunter: Pure point maximization
- [ ] JackSaver: Jack preservation strategy
- [ ] Aggressive: Pair-breaking/trap setup
- [ ] Defensive: Pisti-gift block + capture priority
- [ ] Tournament Player: MC sim (16 worlds)
- [ ] Monte Carlo: MC sim (24 worlds)
- [ ] Expert: MC sim (40 worlds)
- [ ] Vegas Pro: MC sim (48 worlds)
- [ ] Personality wrappers: Uncle, Shark, Regular

---
