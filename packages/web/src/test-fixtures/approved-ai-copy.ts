/**
 * The AI disclosure copy the owner approved on 2026-09-25
 * (DOCS/2026-09-25_ai-label-copy-review.md, items CM-1 to CM-5), for tests
 * that check each label renders at first exposure with exactly these words.
 *
 * This duplicates the translation files on purpose: a change to the wording
 * there is a change to approved public copy, and should fail a test until the
 * owner has approved the new text here too. TR and AR have not had a
 * native-speaker check yet (see .context/ai-transparency.md).
 */
export const AI_COPY_LANGS = ['en', 'de', 'tr', 'ar'] as const;
export type AiCopyLang = (typeof AI_COPY_LANGS)[number];

interface ApprovedAiCopy {
  /** CM-1: the badge's main element, "AI" in every language. */
  badge: string;
  /** CM-1: text next to the badge, also the label's accessible name. */
  generated: string;
  /** CM-2: first line of the Briefing tile. */
  briefingNotice: string;
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
    badge: 'AI',
    generated: 'AI-generated',
    briefingNotice: 'Written automatically by AI from current local headlines. Not reviewed by an editor; may contain errors.',
    sourcesTitle: 'AI Processing',
    sourcesDescription: 'An OpenAI language model selects, rates and tags news headlines, places news and police reports on the map, and writes the daily briefing.',
    newsLegend: 'Selected, rated and tagged by AI.',
    importanceScore: 'Importance score from AI',
    locationEstimated: 'Location estimated by AI',
  },
  de: {
    badge: 'AI',
    generated: 'KI-generiert',
    briefingNotice: 'Automatisch von einer KI aus aktuellen lokalen Schlagzeilen erstellt. Nicht redaktionell geprüft; kann Fehler enthalten.',
    sourcesTitle: 'KI-Verarbeitung',
    sourcesDescription: 'Ein Sprachmodell von OpenAI wählt Schlagzeilen aus, bewertet und verschlagwortet sie, verortet Nachrichten und Polizeimeldungen auf der Karte und schreibt das tägliche Briefing.',
    newsLegend: 'Von einer KI ausgewählt, bewertet und verschlagwortet.',
    importanceScore: 'Wichtigkeit laut KI',
    locationEstimated: 'Ort von einer KI geschätzt',
  },
  tr: {
    badge: 'AI',
    generated: 'Yapay zekâ ile oluşturuldu',
    briefingNotice: 'Güncel yerel haber başlıklarından yapay zekâ tarafından otomatik olarak yazıldı. Bir editör tarafından kontrol edilmedi; hatalar içerebilir.',
    sourcesTitle: 'Yapay zekâ ile işleme',
    sourcesDescription: 'Bir OpenAI dil modeli haber başlıklarını seçer, puanlar ve etiketler; haberleri ve polis bildirimlerini haritada konumlandırır ve günlük özeti yazar.',
    newsLegend: 'Yapay zekâ tarafından seçildi, puanlandı ve etiketlendi.',
    importanceScore: 'Yapay zekâya göre önem puanı',
    locationEstimated: 'Konum yapay zekâ tarafından tahmin edildi',
  },
  ar: {
    badge: 'AI',
    generated: 'مُنشأ بالذكاء الاصطناعي',
    briefingNotice: 'كُتب تلقائيًا بواسطة الذكاء الاصطناعي من عناوين الأخبار المحلية الحالية. لم يراجعه محرر، وقد يحتوي على أخطاء.',
    sourcesTitle: 'المعالجة بالذكاء الاصطناعي',
    sourcesDescription: 'يختار نموذج لغوي من OpenAI عناوين الأخبار ويقيّمها ويصنّفها، ويحدد مواقع الأخبار وبلاغات الشرطة على الخريطة، ويكتب الملخص اليومي.',
    newsLegend: 'اختارها الذكاء الاصطناعي وقيّمها ووسمها.',
    importanceScore: 'درجة الأهمية وفق تقييم الذكاء الاصطناعي',
    locationEstimated: 'الموقع مُقدَّر بواسطة الذكاء الاصطناعي',
  },
};
