/**
 * The AI disclosure copy the owner approved on 2026-09-25
 * (DOCS/2026-09-25_ai-label-copy-review.md, items CM-1 to CM-5), for tests
 * that check each label renders at first exposure with exactly these words.
 * On 2026-09-26 the owner changed CM-1 and CM-2: the Briefing heading now
 * carries one tag, "AI-generated", with the tooltip "Not reviewed by an
 * editor, may contain errors."; the separate "AI" badge and the notice line
 * inside the tile were removed. The owner supplied only the EN tooltip; the
 * DE, TR and AR tooltips were derived from the second sentence of the approved
 * CM-2 notice and await the owner's confirmation (DE) and a native-speaker
 * check (TR, AR).
 *
 * This duplicates the translation files on purpose: a change to the wording
 * there is a change to approved public copy, and should fail a test until the
 * owner has approved the new text here too. TR and AR have not had a
 * native-speaker check yet (see .context/ai-transparency.md).
 */
export const AI_COPY_LANGS = ['en', 'de', 'tr', 'ar'] as const;
export type AiCopyLang = (typeof AI_COPY_LANGS)[number];

interface ApprovedAiCopy {
  /** CM-1: text of the Briefing heading's tag, also its accessible name. */
  generated: string;
  /** CM-1/CM-2: the tag's tooltip, also its accessible description. */
  tooltip: string;
  /** CM-3: Sources page section heading. */
  sourcesTitle: string;
  /** CM-3: Sources page section text, with generic model naming. */
  sourcesDescription: string;
  /** CM-4: News tile legend. */
  newsLegend: string;
  /** CM-4: tooltip and accessible name of the "NN%" score. */
  importanceScore: string;
  /** CM-5: note next to the place label in map popups and on the News-tile pin. */
  locationEstimated: string;
}

export const APPROVED_AI_COPY: Record<AiCopyLang, ApprovedAiCopy> = {
  en: {
    generated: 'AI-generated',
    tooltip: 'Not reviewed by an editor, may contain errors.',
    sourcesTitle: 'AI Processing',
    sourcesDescription: 'An OpenAI language model selects, rates and tags news headlines, places news and police reports on the map, and writes the daily briefing.',
    newsLegend: 'Selected, rated and tagged by AI.',
    importanceScore: 'Importance score from AI',
    locationEstimated: 'Location estimated by AI',
  },
  de: {
    generated: 'KI-generiert',
    tooltip: 'Nicht redaktionell geprüft, kann Fehler enthalten.',
    sourcesTitle: 'KI-Verarbeitung',
    sourcesDescription: 'Ein Sprachmodell von OpenAI wählt Schlagzeilen aus, bewertet und verschlagwortet sie, verortet Nachrichten und Polizeimeldungen auf der Karte und schreibt das tägliche Briefing.',
    newsLegend: 'Von einer KI ausgewählt, bewertet und verschlagwortet.',
    importanceScore: 'Wichtigkeit laut KI',
    locationEstimated: 'Ort von einer KI geschätzt',
  },
  tr: {
    generated: 'Yapay zekâ ile oluşturuldu',
    tooltip: 'Bir editör tarafından kontrol edilmedi, hatalar içerebilir.',
    sourcesTitle: 'Yapay zekâ ile işleme',
    sourcesDescription: 'Bir OpenAI dil modeli haber başlıklarını seçer, puanlar ve etiketler; haberleri ve polis bildirimlerini haritada konumlandırır ve günlük özeti yazar.',
    newsLegend: 'Yapay zekâ tarafından seçildi, puanlandı ve etiketlendi.',
    importanceScore: 'Yapay zekâya göre önem puanı',
    locationEstimated: 'Konum yapay zekâ tarafından tahmin edildi',
  },
  ar: {
    generated: 'مُنشأ بالذكاء الاصطناعي',
    tooltip: 'لم يراجعه محرر، وقد يحتوي على أخطاء.',
    sourcesTitle: 'المعالجة بالذكاء الاصطناعي',
    sourcesDescription: 'يختار نموذج لغوي من OpenAI عناوين الأخبار ويقيّمها ويصنّفها، ويحدد مواقع الأخبار وبلاغات الشرطة على الخريطة، ويكتب الملخص اليومي.',
    newsLegend: 'اختارها الذكاء الاصطناعي وقيّمها ووسمها.',
    importanceScore: 'درجة الأهمية وفق تقييم الذكاء الاصطناعي',
    locationEstimated: 'الموقع مُقدَّر بواسطة الذكاء الاصطناعي',
  },
};
