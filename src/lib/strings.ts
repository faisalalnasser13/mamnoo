import type { Kit, Lang, TeamId } from "./types";
import { plural as pluralAr } from "./arabic";

export type { Lang };

const pluralEn = (n: number, one: string, many: string) =>
  n === 1 ? one : many;

export interface Strings {
  title: string;
  tagline: string;
  team: Record<Kit, Record<TeamId, string>>;
  stamp: string;
  you: string;
  kickAria: string;
  moveAria: string;
  stealWord: string;
  hostPlus: string;
  hostMinus: string;
  /** Face-down card: the steal, and the beat before the first deal. */
  unknownCard: string;

  chipExplain: string;
  chipJudge: string;
  chipGuess: string;
  chipListen: string;
  chipSteal: string;
  chipTurnOver: string;
  chipYourTurn: string;
  chipTheirTurn: string;

  explainIt: string;
  hurry: string;
  drawing: string;
  waitingCard: string;
  heatOff: string;
  heatNext: string;
  burned: string;
  thisRound: (pts: number) => string;
  aheadBy: (n: number) => string;
  behindBy: (n: number) => string;
  tied: string;
  correct: string;
  skip: string;
  skipLocked: (secs: number) => string;
  buzz: string;
  buzzHint: string;
  stalled: (name: string) => string;
  saidTaboo: (name: string) => string;
  burnedUs: string;
  burnedThem: string;
  explainingNow: string;
  shoutAnswer: string;
  theirTurn: string;
  explaining: (name: string) => string;
  rememberClues: string;
  skipLockedIdle: string;
  lastCardYours: string;
  stealIfTime: string;
  theyScored: string;
  judgingForYou: (name: string) => string;
  floorBuzz: string;

  timeUpOn: (team: string) => string;
  stealYell: string;
  stealYours: string;
  stealTheirs: string;
  stealYouJudge: string;
  stealYouSit: string;
  stealAward: string;
  stealMiss: string;
  waitingSteal: (name: string) => string;

  recapExplained: (name: string) => string;
  recapOk: string;
  waitingHost: (name: string) => string;

  overtimeRound: (n: number) => string;
  roundOf: (n: number, total: number) => string;
  nextRoundTitle: string;
  scoreTitle: string;
  roleExplain: string;
  roleJudge: string;
  vs: string;
  yourTurnNow: string;
  yourTurnAt: (n: number) => string;
  ourTurn: string;
  theirTurnChip: string;
  startTurn: (name: string) => string;
  youAreHost: string;
  waitingHostStart: (name: string) => string;

  mostExplained: string;
  harshestJudge: string;
  longestWord: string;
  longestStreak: string;
  cardsN: (n: number) => string;
  timesN: (n: number) => string;
  secondsN: (n: number) => string;
  streakN: (n: number) => string;
  reasonDraw: string;
  reasonHost: string;
  reasonOvertime: string;
  reasonRounds: string;
  rematch: string;
  leave: string;

  roomName: string;
  invitedTo: string;
  yourNamePh: string;
  joinCta: string;
  otherRoom: string;
  youAreHere: string;
  tapToSwitch: string;
  nobodyYet: string;
  teamsHint: string;
  showQr: string;
  hideQr: string;
  scanToJoin: string;
  shuffle: string;
  roundLength: string;
  seconds: string;
  roundsPerTeam: string;
  totalRounds: (n: number) => string;
  roundsHint: (per: number, total: number) => string;
  startPlay: string;
  waitingHostBegin: string;
  sendLink: string;
  copied: string;
  shareText: (id: string, url: string) => string;

  hostMenu: string;
  guessTeamFallback: string;
  plusGuess: (team: string) => string;
  minusGuess: (team: string) => string;
  guessHint: string;
  resume: string;
  pause: string;
  addTime: string;
  addTimeHint: string;
  skipTurn: string;
  skipTurnHint: string;
  kickPlayer: string;
  kickHint: string;
  kick: string;
  endGame: string;
  endGameHint: string;
  pausedTitle: string;
  pausedSub: string;

  feedOk2: string;
  feedOk: string;
  feedBuzz: string;
  feedSkip: string;
  feedSteal: string;

  err: {
    signIn: string;
    hostOnly: string;
    notInRoom: string;
    noSuchRoom: string;
    writeName: string;
    namesBusy: string;
    gameStarted: string;
    roomFull: string;
    roomMissing: string;
    kickSelf: string;
    settingsLobby: string;
    shuffleLobby: string;
    moveOthers: string;
    switchLobby: string;
    needPlayer: string;
    noTurn: string;
    giverOnly: string;
    skipLocked: string;
    judgeBuzz: string;
    giverSteal: string;
    permission: string;
    network: string;
    generic: string;
    writeRoom: string;
  };
}

export const AR: Strings = {
  title: "ممنوع",
  tagline: "اشرح الكلمة… بدون الكلمات الخمس",
  team: {
    classic: { mint: "النعناع", chili: "الفلفل" },
    cafe: { mint: "قهوة", chili: "شاهي" },
  },
  stamp: "ممنوع",
  you: " (أنت)",
  kickAria: "اطرد",
  moveAria: "انقله للفريق الآخر",
  stealWord: "سرقة",
  hostPlus: "host +1",
  hostMinus: "host −1",
  unknownCard: "؟ ؟ ؟",

  chipExplain: "اشرح!",
  chipJudge: "حكم هذه الجولة 👀",
  chipGuess: "خمّن! 📣",
  chipListen: "استمعوا 👂",
  chipSteal: "فرصتكم!",
  chipTurnOver: "انتهت جولتكم",
  chipYourTurn: "جولتكم",
  chipTheirTurn: "جولتهم",

  explainIt: "اشرحها",
  hurry: "بسرعة!",
  drawing: "جاري السحب…",
  waitingCard: "بانتظار البطاقة…",
  heatOff: "💧 انطفأ الحماس",
  heatNext: "🔥 القادمة بنقطتين",
  burned: "−1 · البطاقة محروقة",
  thisRound: (pts) => `${pts > 0 ? "+" : pts < 0 ? "−" : ""}${pts === 0 ? "0" : Math.abs(pts)} هذه الجولة`,
  aheadBy: (n) => `فريقك متقدّم بفارق ${n}`,
  behindBy: (n) => `فريقك متأخر بفارق ${n}`,
  tied: "تعادل",
  correct: "صح ✓",
  skip: "تخطي",
  skipLocked: (secs) => `🔒 ما في تبديل في آخر ${secs} ثوانٍ`,
  buzz: "ممنوع!",
  buzzHint: "اضغط إذا قال إحدى الخمس",
  stalled: (name) =>
    `ما وصلت البطاقة. جهاز ${name} قد يكون نايم — المضيف يقدر ينهي الجولة من ⚙︎ تحكّم المضيف.`,
  saidTaboo: (name) => `${name} قال كلمة ممنوعة`,
  burnedUs: "−1 عليكم · البطاقة محروقة",
  burnedThem: "−1 عليهم · البطاقة محروقة",
  explainingNow: "يشرح الآن",
  shoutAnswer: "صيحوا بالإجابة في المكالمة 📣",
  theirTurn: "دور الخصم",
  explaining: (name) => `${name} يشرح`,
  rememberClues: "احفظوا الشرح",
  skipLockedIdle: "🔒 ما يقدر يبدّل — ركّزوا",
  lastCardYours: "هذه البطاقة هي الأخيرة. إن لم يخمّنوها، فهي لكم.",
  stealIfTime: "إذا انتهى الوقت وبقيت بطاقة، لكم عشر ثوانٍ لسرقتها — ونقطة إن خمّنتموها.",
  theyScored: "جابوا هذه الجولة",
  judgingForYou: (name) => `${name} يحكم عنكم 🚨`,
  floorBuzz: "ممنوع!",

  timeUpOn: (team) => `انتهى وقت ${team} على هذه البطاقة`,
  stealYell: "سرقة!",
  stealYours: "خمّنوا من الشرح الذي سمعتموه. الشارح يحكم إن صحّت.",
  stealTheirs: "الفريق الآخر يحاول يسرقها. الشارح يحكم إن خمّنوها.",
  stealYouJudge: "الآن دور الفريق الآخر يسرقها. أنت الحكم — الكلمة باقية عندك.",
  stealYouSit: "فريقك يحاول يسرقها. أنت شفت البطاقة — ما تقدر تشارك.",
  stealAward: "خمّنوها — نقطة لهم",
  stealMiss: "ما قدروا — تخطَّ",
  waitingSteal: (name) => `${name} يحكم على السرقة…`,

  recapExplained: (name) => `شرحها ${name}`,
  recapOk: "تمام",
  waitingHost: (name) => `بانتظار ${name}… ⏳`,

  overtimeRound: (n) => `وقت إضافي · الجولة ${n}`,
  roundOf: (n, total) => `الجولة ${n} من ${total}`,
  nextRoundTitle: "الجولة القادمة",
  scoreTitle: "النتيجة",
  roleExplain: "يشرح",
  roleJudge: "يحكم",
  vs: "ضد",
  yourTurnNow: "دورك الآن! 🎤",
  yourTurnAt: (n) => `دورك أنت في الجولة ${n}`,
  ourTurn: "دوركم",
  theirTurnChip: "دورهم",
  startTurn: (name) => `ابدأ جولة ${name} ▸`,
  youAreHost: "أنت المضيف — الجميع بانتظارك",
  waitingHostStart: (name) => `بانتظار ${name} ليبدأ… ⏳`,

  mostExplained: "أكثر من شرح",
  harshestJudge: "أشد حكم",
  longestWord: "أطول كلمة",
  longestStreak: "أطول سلسلة",
  cardsN: (n) => `${n} ${pluralAr(n, "بطاقة", "بطاقتان", "بطاقات", "بطاقة")}`,
  timesN: (n) => `${n} ${pluralAr(n, "مرة", "مرتان", "مرات", "مرة")}`,
  secondsN: (n) => `${n} ${pluralAr(n, "ثانية", "ثانيتان", "ثوانٍ", "ثانية")}`,
  streakN: (n) => `${n} ${pluralAr(n, "متتالية", "متتاليتان", "متتالية", "متتالية")}`,
  reasonDraw: "🤝 تعادل",
  reasonHost: "أنهاها المضيف",
  reasonOvertime: "وقت إضافي",
  reasonRounds: "انتهت الجولات",
  rematch: "مرة ثانية بنفس الفرق",
  leave: "خروج",

  roomName: "اسم الغرفة",
  invitedTo: "دعوة لغرفة",
  yourNamePh: "سعد بن صالح",
  joinCta: "ادخل الغرفة",
  otherRoom: "غرفة ثانية",
  youAreHere: "أنت هنا",
  tapToSwitch: "اضغط للانتقال",
  nobodyYet: "ما في أحد بعد",
  teamsHint: "اضغط على الفريق الآخر لتنتقل له",
  showQr: "▦ رمز QR",
  hideQr: "إخفاء رمز QR",
  scanToJoin: "امسح الرمز بالكاميرا للدخول",
  shuffle: "🔀 اخلط الفرق عشوائيًا",
  roundLength: "مدة الجولة",
  seconds: "ثانية",
  roundsPerTeam: "جولات لكل فريق",
  totalRounds: (n) => `الإجمالي ${n}`,
  roundsHint: (per, total) =>
    `كل رقم = جولات فريقك. الفريقان يتناوبان، فـ${per} لكل فريق = ${total} جولة إجمالًا.`,
  startPlay: "ابدأ اللعب",
  waitingHostBegin: "بانتظار المضيف ليبدأ… ⏳",
  sendLink: "📲 أرسل الرابط",
  copied: "انتسخ الرابط ✅",
  shareText: (id, url) => `العب معنا «ممنوع» — اسم الغرفة: ${id}\n${url}`,

  hostMenu: "تحكّم المضيف",
  guessTeamFallback: "فريق التخمين",
  plusGuess: (team) => `＋ نقطة لـ${team}`,
  minusGuess: (team) => `− نقطة من ${team}`,
  guessHint: "فريق التخمين — حتى تبدأ الجولة التالية",
  resume: "▶︎ كمّل",
  pause: "⏸ وقّف مؤقتًا",
  addTime: "⏱ أضف 5 ثوانٍ",
  addTimeHint: "تمديد المؤقّت الحالي",
  skipTurn: "⏭ أنهِ الجولة",
  skipTurnHint: "إذا وقف جهاز الشارح ولا تبدأ البطاقة",
  kickPlayer: "طرد لاعب",
  kickHint: "من اللوبي أو أثناء اللعب",
  kick: "اطرد",
  endGame: "⏹ أنهِ اللعبة",
  endGameHint: "يروح للنتيجة النهائية مباشرة",
  pausedTitle: "⏸ اللعبة موقوفة",
  pausedSub: "المؤقّت متوقّف. بانتظار المضيف.",

  feedOk2: "+2 🔥",
  feedOk: "+1",
  feedBuzz: "ممنوع −1",
  feedSkip: "تخطي −0.5",
  feedSteal: "سرقة +1",

  err: {
    signIn: "سجّل الدخول أولًا.",
    hostOnly: "هذا التحكم للمضيف فقط.",
    notInRoom: "لست في هذه الغرفة.",
    noSuchRoom: "لا توجد غرفة بهذا الاسم.",
    writeName: "اكتب اسمك أولًا.",
    namesBusy: "كل أسماء الغرف مشغولة الآن. جرّب بعد قليل.",
    gameStarted: "اللعبة بدأت. انتظر الجولة القادمة.",
    roomFull: "الغرفة ممتلئة (12 لاعبًا).",
    roomMissing: "الغرفة غير موجودة.",
    kickSelf: "ما تقدر تطرد نفسك.",
    settingsLobby: "الإعدادات تتغيّر قبل البدء فقط.",
    shuffleLobby: "الخلط قبل البدء فقط.",
    moveOthers: "المضيف فقط ينقل الآخرين.",
    switchLobby: "التبديل قبل البدء فقط.",
    needPlayer: "كل فريق يحتاج لاعبًا واحدًا على الأقل.",
    noTurn: "لا يوجد دور محدّد.",
    giverOnly: "الشارح فقط يحسم البطاقة.",
    skipLocked: "ما في تبديل في آخر 10 ثوانٍ.",
    judgeBuzz: "الحكم فقط يضغط ممنوع.",
    giverSteal: "الشارح فقط يحسم السرقة.",
    permission: "لا تملك صلاحية هذه الخطوة.",
    network: "الشبكة ضعيفة. حاول مرة أخرى.",
    generic: "صار خطأ. حاول مرة أخرى.",
    writeRoom: "اكتب اسم الغرفة",
  },
};

export const EN: Strings = {
  title: "Banned",
  tagline: "Describe the word… without the five forbidden ones",
  team: {
    classic: { mint: "Mint", chili: "Chili" },
    cafe: { mint: "Coffee", chili: "Tea" },
  },
  stamp: "BANNED",
  you: " (you)",
  kickAria: "Kick",
  moveAria: "Move to the other team",
  stealWord: "Steal",
  hostPlus: "host +1",
  hostMinus: "host −1",
  unknownCard: "? ? ?",

  chipExplain: "Describe!",
  chipJudge: "Judging this turn 👀",
  chipGuess: "Guess! 📣",
  chipListen: "Listen 👂",
  chipSteal: "Your chance!",
  chipTurnOver: "Your turn's over",
  chipYourTurn: "Your turn",
  chipTheirTurn: "Their turn",

  explainIt: "Describe it",
  hurry: "Hurry!",
  drawing: "Drawing…",
  waitingCard: "Waiting for the card…",
  heatOff: "💧 Heat's out",
  heatNext: "🔥 Next one's worth two",
  burned: "−1 · card burned",
  thisRound: (pts) => `${pts > 0 ? "+" : pts < 0 ? "−" : ""}${pts === 0 ? "0" : Math.abs(pts)} this turn`,
  aheadBy: (n) => `Your team leads by ${n}`,
  behindBy: (n) => `Your team trails by ${n}`,
  tied: "Tied",
  correct: "Got it ✓",
  skip: "Skip",
  skipLocked: (secs) => `🔒 No skip in the last ${secs} seconds`,
  buzz: "Banned!",
  buzzHint: "Tap if they said a forbidden word",
  stalled: (name) =>
    `The card never arrived. ${name}'s phone may be asleep — the host can end the turn from ⚙︎ Host controls.`,
  saidTaboo: (name) => `${name} said a banned word`,
  burnedUs: "−1 for you · card burned",
  burnedThem: "−1 for them · card burned",
  explainingNow: "Describing now",
  shoutAnswer: "Shout the answer on the call 📣",
  theirTurn: "Their turn",
  explaining: (name) => `${name} is describing`,
  rememberClues: "Remember the clues",
  skipLockedIdle: "🔒 They can't skip — lock in",
  lastCardYours: "This is the last card. If they miss it, it's yours.",
  stealIfTime: "If time runs out with a card up, you get ten seconds to steal it — and a point if you do.",
  theyScored: "They scored this turn",
  judgingForYou: (name) => `${name} is judging for you 🚨`,
  floorBuzz: "Banned!",

  timeUpOn: (team) => `${team}'s time is up on this card`,
  stealYell: "Steal!",
  stealYours: "Guess from what you heard. The describer judges if you got it.",
  stealTheirs: "The other team is trying to steal it. The describer judges if they got it.",
  stealYouJudge: "Now it's the other team's turn to steal. You judge — the word stays on your phone.",
  stealYouSit: "Your team is attempting the steal. You already saw the card — you can't participate.",
  stealAward: "They got it — point for them",
  stealMiss: "They missed — skip",
  waitingSteal: (name) => `${name} is judging the steal…`,

  recapExplained: (name) => `${name} described`,
  recapOk: "Done",
  waitingHost: (name) => `Waiting for ${name}… ⏳`,

  overtimeRound: (n) => `Overtime · turn ${n}`,
  roundOf: (n, total) => `Turn ${n} of ${total}`,
  nextRoundTitle: "Next Round",
  scoreTitle: "Score",
  roleExplain: "Describes",
  roleJudge: "Judges",
  vs: "vs",
  yourTurnNow: "You're up! 🎤",
  yourTurnAt: (n) => `You describe on turn ${n}`,
  ourTurn: "Your side",
  theirTurnChip: "Their side",
  startTurn: (name) => `Start ${name}'s turn ▸`,
  youAreHost: "You're the host — everyone's waiting",
  waitingHostStart: (name) => `Waiting for ${name} to start… ⏳`,

  mostExplained: "Most described",
  harshestJudge: "Harshest judge",
  longestWord: "Longest word",
  longestStreak: "Hottest streak",
  cardsN: (n) => `${n} ${pluralEn(n, "card", "cards")}`,
  timesN: (n) => `${n} ${pluralEn(n, "time", "times")}`,
  secondsN: (n) => `${n} ${pluralEn(n, "second", "seconds")}`,
  streakN: (n) => `${n} in a row`,
  reasonDraw: "🤝 Draw",
  reasonHost: "Ended by the host",
  reasonOvertime: "Overtime",
  reasonRounds: "Rounds are done",
  rematch: "Rematch, same teams",
  leave: "Leave",

  roomName: "Room name",
  invitedTo: "You're invited to",
  yourNamePh: "Your name",
  joinCta: "Join the room",
  otherRoom: "Different room",
  youAreHere: "You're here",
  tapToSwitch: "Tap to switch",
  nobodyYet: "Nobody yet",
  teamsHint: "Tap the other side to switch teams",
  showQr: "▦ QR code",
  hideQr: "Hide QR code",
  scanToJoin: "Scan this with a camera to join",
  shuffle: "🔀 Shuffle teams",
  roundLength: "Turn length",
  seconds: "sec",
  roundsPerTeam: "Turns per team",
  totalRounds: (n) => `Total ${n}`,
  roundsHint: (per, total) =>
    `Each number is your team's turns. Sides alternate, so ${per} each is ${total} turns in all.`,
  startPlay: "Start the game",
  waitingHostBegin: "Waiting for the host to start… ⏳",
  sendLink: "📲 Send the link",
  copied: "Link copied ✅",
  shareText: (id, url) => `Play Banned with us — room: ${id}\n${url}`,

  hostMenu: "Host controls",
  guessTeamFallback: "guessing team",
  plusGuess: (team) => `＋ point for ${team}`,
  minusGuess: (team) => `− point from ${team}`,
  guessHint: "Guessing team — until the next turn starts",
  resume: "▶︎ Resume",
  pause: "⏸ Pause",
  addTime: "⏱ Add 5 seconds",
  addTimeHint: "Extend the current timer",
  skipTurn: "⏭ End the turn",
  skipTurnHint: "If the describer's phone is stuck",
  kickPlayer: "Kick a player",
  kickHint: "From the lobby or mid-game",
  kick: "Kick",
  endGame: "⏹ End the game",
  endGameHint: "Jump straight to the final scores",
  pausedTitle: "⏸ Paused",
  pausedSub: "The timer is frozen. Waiting for the host.",

  feedOk2: "+2 🔥",
  feedOk: "+1",
  feedBuzz: "Banned −1",
  feedSkip: "Skip −0.5",
  feedSteal: "Steal +1",

  err: {
    signIn: "Sign in first.",
    hostOnly: "Only the host can do that.",
    notInRoom: "You're not in this room.",
    noSuchRoom: "No room with that name.",
    writeName: "Enter your name first.",
    namesBusy: "Every room name is taken. Try again in a bit.",
    gameStarted: "The game already started. Wait for the next one.",
    roomFull: "The room is full (12 players).",
    roomMissing: "The room doesn't exist.",
    kickSelf: "You can't kick yourself.",
    settingsLobby: "Settings can only change before kickoff.",
    shuffleLobby: "Shuffle only works before kickoff.",
    moveOthers: "Only the host can move other people.",
    switchLobby: "Team switches only before kickoff.",
    needPlayer: "Each team needs at least one player.",
    noTurn: "No turn is set.",
    giverOnly: "Only the describer can resolve the card.",
    skipLocked: "No skip in the last 10 seconds.",
    judgeBuzz: "Only the judge can tap Banned.",
    giverSteal: "Only the describer can judge the steal.",
    permission: "You don't have permission for that.",
    network: "The network is weak. Try again.",
    generic: "Something went wrong. Try again.",
    writeRoom: "Enter the room name",
  },
};

export function S(lang: Lang | null | undefined): Strings {
  return lang === "en" ? EN : AR;
}

export function asLang(raw: unknown): Lang {
  return raw === "en" ? "en" : "ar";
}

export function asKit(raw: unknown): Kit {
  return raw === "cafe" ? "cafe" : "classic";
}
