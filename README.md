# ممنوع

لعبة تابو عربية أونلاين. غرفة واحدة، كل لاعب على جواله، والكلام على مكالمة
صوتية خارجية (واتساب أو ديسكورد). لا تسجيل، لا تطبيق، رابط واحد.

مبنية لتعمل بالكامل على **Firebase Spark (المجاني)**: لا Cloud Functions،
لا سيرفر. المحرّك يعمل في المتصفح.

---

## كيف تُلعب

فريقان: 🌿 **النعناع** و 🌶️ **الفلفل**.

في كل جولة، لاعب من فريق يشرح كلمة دون أن ينطق خمس كلمات ممنوعة مطبوعة على
البطاقة. **الحكم من الفريق الخصم** ويرى البطاقة نفسها — إن سمع كلمة ممنوعة
ضغط الزر. بقية اللاعبين لا يرون شيئًا سوى الوقت والنتيجة.

| | |
|---|---|
| **صح** | نقطة. وكل ثالثة متتالية بنقطتين (🔥 الحماس) |
| **تخطي** | ثلاث فرص في الجولة، بلا خسارة نقاط — لكنها تطفئ الحماس |
| **ممنوع** | ‎−1 والبطاقة تُحرق بختم أحمر |
| **سرقة** | انتهى الوقت وبطاقة قائمة؟ عشر ثوانٍ للخصم ونقطة إن خمّنوها |
| **النهاية** | 21 نقطة، أو انتهاء الجولات — أيهما أولًا |

بين كل جولتين صفحة انتقال: من يشرح، من يحكم، كم بقي، والنتيجة. لا تتقدّم
إلا بضغطة المضيف — وهذه هي المساحة التي يتنفّس فيها الناس ويتكلمون.

---

## التشغيل

```bash
npm install
cp .env.example .env      # املأ قيم VITE_FB_* الست
npm run dev
```

راجع `SETUP.md` للخطوات الكاملة في Firebase Console، و`AGENTS.md` لقيود
المشروع قبل تعديل أي شيء.

```bash
npm test                  # 610 تحقّق + محاكاة 300 مباراة، ~3 ثوانٍ
npm run build
firebase deploy
```

---

## Architecture

No server. The engine is `src/lib/engine.ts` and it runs in every
player's browser. Correctness comes from three places:

**1. Guarded transactions.** Every state change is a Firestore
transaction that re-reads the room and bails if someone already made the
move. Six phones racing to end the same turn produce one transition. Card
actions carry `fromCardId`, so a double-tap on صح is a no-op rather than
two points.

**2. Named transition owners.** Without a server, someone has to be
responsible for each transition or clients fight over it. The host owns
everything driven by a tap; the clue-giver's device owns everything
driven by the clock, with the rest of the table firing two seconds later
as a backstop so a locked phone can't freeze the game.

**3. Security rules on the one thing that matters.** See below.

### The sealed card

```
rooms/{id}/secret/card    read:  clueGiver or judge only
                          write: clueGiver only
```

This is the one place this project is stricter than its sibling تشفير.
There, a devtools peek at the opponent's code is cheating at the margins.
Here, the card *is* the game — a guesser who reads it has nothing left to
play. So it's enforced at the database layer, and the client only opens
that listener for the two roles entitled to it.

The current card's word never touches the room document. `round.log`
receives a word only after the card has left play.

### Cost

Firestore's free tier allows 50k reads/day. A six-player game generates
roughly 400 reads — one snapshot per player per card resolution, plus the
transition beats. The timer is never written during a round; only the
absolute `phaseEndsAt` is, once, at turn start, and every phone counts
down locally against it. A 60-second round costs one write.

### Room names

Rooms are named with real Arabic words (`قهوة`, `نخلة`) rather than
random codes, because the name has to survive being said out loud on a
voice call. The pool is 50 words, then the same words with a digit —
about 450 concurrent rooms.

Since there's no server to sweep abandoned rooms, `createRoom` reclaims
any room untouched for six hours (`STALE_ROOM_MS`). The 300-game
simulator found this: it exhausted the name pool on run one.

---

## Trust model

**The clue-giver taps صح for their own team.** Any of them could tap it
without earning it. This is a deliberate choice, the same one made in
تشفير: this is a game among friends on a live voice call, and the social
cost of cheating is doing it in front of five people who can hear you.
Moving scoring to the judge would add a round-trip to every single card
and buy nothing.

What is *not* left to trust is the card itself, because that isn't
cheating at the margins — it's the difference between playing and not.

---

## Testing

```
✓ rules: 610 assertions passed
✓ negative control: read-after-write is detected
✓ sim: 300 games · 4.5 turns/game · 27.0 cards/game · target:150 rounds:150
```

`test/sim/` compiles the real engine against an in-memory Firestore stub
and plays whole games with six phones racing each other. It asserts the
sealed card never outlives its turn, no turn index repeats, the judge is
never on the describer's team, scores never go negative, and a correct
card scores 1 or 2 — never 0, never 3.

The stub rejects a read-after-write inside a transaction exactly as
Firestore does, and `test/sim/negative.cjs` proves that detector fires,
so a green sim means something.

The deck is tested too: five distinct taboo words per card, and no taboo
word may be a substring of its own answer. That rule caught «طبيب أسنان /
سن» and «مقص / قص» — cards you cannot play, because you can't say the
answer without saying the forbidden word.

---

## المحتوى

70 بطاقة. هذا يكفي سهرة واحدة، لا مجموعة تلعب أسبوعيًا. البطاقات في
`src/lib/deck.ts`، وإضافة المزيد أهم من أي تحسين في الكود — بشرط أن تمرّ
اختبارات `npm test`.

اللهجة الحالية خليجية/شامية مختلطة. لو أردت حزمة لهجة منفصلة، أضف حقل
`dialect` وفلترًا في `drawFrom`؛ لا شيء آخر في المحرّك يحتاج تعديلًا.
