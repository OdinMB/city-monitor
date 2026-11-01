/**
 * The language a city's briefing comes in for an interface language. The
 * server writes each briefing in the city's own languages (`languages` in its
 * config) and answers any other with the first of them
 * (packages/server/src/routes/news.ts); asking for that one directly lets the
 * page mark the text as the language it is in.
 */
export function briefingLanguage(cityLanguages: readonly string[], uiLanguage: string): string {
  const lang = uiLanguage.split('-')[0]!;
  return cityLanguages.includes(lang) ? lang : (cityLanguages[0] ?? 'de');
}
