/**
 * QA content: for every format, its sample plus a minimal and a long stress
 * variant, so every template is checked at both extremes of text length.
 */
import { FORMATS } from "../lib/render/formats";
import type { FormatId, QuoteContent } from "../lib/render/template";

const LONG = "The city does not care about your plans, and that is its gift. Nobody is watching closely enough to stop you, and nobody is coming to save you either.";

const VARIANTS: Record<FormatId, { short: Partial<QuoteContent>; long: Partial<QuoteContent> }> = {
  classic: { short: { text: "Silence is not empty." }, long: { text: `${LONG} Walk anyway; the streets were built by people who stopped waiting for permission.`, author: "Fred M" } },
  hbp: {
    short: { hook: "Wait less.", body: "", punchline: "Begin." },
    long: { hook: "Nobody is coming to rescue the version of you that keeps waiting.", body: `${LONG} Every door you were taught to fear was painted on a wall that was never there.`, punchline: "The door was never locked, and it was never a door." },
  },
  carousel: {
    short: { hook: "Wait less.", body: "Most delay is fear wearing a schedule.", punchline: "Begin." },
    long: { hook: "Comfort is a loan with a long fuse.", body: `${LONG} It feels free when you take it. The interest is invisible for years. Then one morning you notice the calls you stopped making and the rooms you no longer enter. Nobody sent a bill. You paid in time, which is the only currency that never comes back.`, punchline: "Every loan is repaid in the currency you value most, usually years after you stopped counting." },
  },
  "one-liner": { short: { text: "Stay." }, long: { text: "The city does not remember the people who waited for the perfect moment to begin." } },
  highlight: { short: { text: "*Silence* is an answer." }, long: { text: `We call it *patience* when it is only *fear* with better posture. ${LONG}` } },
  contrast: { short: { a: "Loud.", b: "Right." }, long: { a: `Silence means nothing is happening and the room is waiting for someone braver to speak first.`, b: `Silence is where the decisions are made, quietly, by the people who stopped asking for permission years ago.` } },
  "myth-truth": { short: { a: "Later.", b: "Never." }, long: { a: "You will know when you are ready, because a clear feeling will arrive and tell you it is finally time.", b: "Ready is a feeling that arrives after you start, usually somewhere in the middle of the thing you were afraid of." } },
  "then-now": { short: { a: "Noise.", b: "Work." }, long: { a: "I wanted to be understood by everyone in every room I walked into, even the ones I did not respect.", b: "I want to be left alone to work, and to be understood by the few people who were there when it was hard." } },
  paradox: { short: { first: "Hold on,", second: "let go." }, long: { first: "The more doors you keep open for the life you might live someday,", second: "the fewer rooms you ever actually walk into and call your own." } },
  list: {
    short: { title: "Rules", items: ["Arrive early", "Leave quietly", "Keep notes"] },
    long: {
      title: "Things I stopped doing after the year everything went quiet",
      items: ["Explaining myself twice to people who decided before I spoke", "Answering at midnight", "Waiting for the right mood to start the work that pays the rent", "Keeping score", "Arguing with weather", "Asking for permission I did not need", "Pretending the plan was working"],
    },
  },
  qa: { short: { question: "Why?", answer: "Because." }, long: { question: "What do you owe the people who doubted you when you had nothing to show them but intent?", answer: `Nothing. Not even the satisfaction of proving them wrong. ${LONG}` } },
  definition: {
    short: { word: "Rest", phonetic: "", pos: "", definition: "Work, deferred.", usage: "" },
    long: { word: "Procrastination", phonetic: "prəʊˌkræs.tɪˈneɪ.ʃən", pos: "noun, uncountable", definition: "The art of keeping up with yesterday while borrowing heavily from the person you will be next year, at interest you will not see until it is due.", usage: "He called it research for most of a decade, and it was very thorough research." },
  },
  equation: {
    short: { equation: "Ego - 1 = Peace", caption: "" },
    long: { equation: "Comfort x Time = Regret\nEffort - Ego = Progress\nNoise / Signal = Distraction", caption: "Three lines nobody wants to read on a Monday morning, compounded quietly over years." },
  },
  stat: { short: { number: "1", context: "life.", source: "" }, long: { number: "1,000,000", context: "seconds is roughly eleven and a half days, which is about how long most resolutions survive contact with an ordinary week.", source: "Arithmetic, not research" } },
  law: { short: { number: "1", statement: "Begin." }, long: { name: "Fred's Second Law of Rooms", number: "112", statement: "Any plan that requires everyone in the room to be reasonable at the same time is not a plan; it is a wish with a calendar invite attached." } },
  dialogue: {
    short: { speakerA: "Me", lineA: "When?", speakerB: "Life", lineB: "Now." },
    long: { speakerA: "The young man at the bus stop", lineA: "When does it get easier, honestly, once the first years are finally over?", speakerB: "The old man beside him", lineB: "It doesn't. You just stop asking, and one day you notice you are carrying it differently." },
  },
  stanza: {
    short: { title: "", text: "Stone\nkeeps\ntime." },
    long: { title: "Stone, a longer weather", text: "The river argues with the stone\nfor a thousand years\nand wins\nwithout raising its voice.\n\nThe stone does not apologise\nfor having been there first,\nfor being slow,\nfor keeping its shape as long as it could.", author: "Fred M" },
  },
  "field-note": {
    short: { date: "04.10.2026", place: "", text: "Rain again." },
    long: { date: "Saturday, 04 October 2026", place: "Nairobi, Moi Avenue, 6:40 a.m.", text: `The matatu driver checks his mirror more than the road. Everyone in this city is watching what is behind them. ${LONG}` },
  },
  "post-card": { short: { text: "Less.", date: "" }, long: { text: `Most advice is autobiography. Read it the way you would read someone's diary: with interest, and without obeying it. ${LONG}`, date: "Saturday 4 October 2026" } },
  "pull-quote": { short: { text: "Stay quiet.", source: "" }, long: { text: `The ocean is honest about its size. Most people are not. ${LONG}`, source: "Field notes, the long version, 2026" } },
};

export function qaContent(format: FormatId): { kind: string; content: QuoteContent }[] {
  const sample = FORMATS[format].sample;
  const v = VARIANTS[format];
  return [
    { kind: "sample", content: sample },
    { kind: "short", content: { ...sample, ...v.short } as QuoteContent },
    { kind: "long", content: { ...sample, ...v.long } as QuoteContent },
  ];
}

export const QA_STYLES = ["line", "stacked", "caps", "rule", "monogram", "vertical"] as const;
