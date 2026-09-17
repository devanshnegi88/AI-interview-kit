export const TOPICS = ["hiring", "careers", "interview", "about", "product"] as const;
export type Topic = (typeof TOPICS)[number];

/** Ranking features only — never required paths. */
const TOPIC_TERMS: Record<Topic, string[]> = {
  hiring: ["hiring", "we're hiring", "we are hiring", "join us", "join our team", "open roles", "openings", "apply now"],
  careers: ["career", "careers", "jobs", "job", "work with us", "talent", "vacancy", "vacancies"],
  interview: ["interview", "hiring process", "how we hire", "recruiting", "recruitment", "interview process"],
  about: ["about", "our story", "mission", "values", "culture", "who we are", "our team", "company"],
  product: ["product", "products", "platform", "solutions", "what we do", "features"],
};

function haystack(value: string): string {
  return value.toLowerCase().replace(/[-_/#?&=.]+/g, " ").replace(/\s+/g, " ").trim();
}

function termHits(text: string, terms: string[]): number {
  let n = 0;
  for (const term of terms) {
    if (text.includes(term)) n += 1;
  }
  return n;
}

export interface ScoreInput {
  url: string;
  title?: string;
  text?: string;
  anchor?: string;
}

export interface LinkScore {
  score: number;
  topics: Topic[];
}

export function scoreSignals(input: ScoreInput): LinkScore {
  const urlH = haystack(input.url);
  const titleH = haystack(input.title ?? "");
  const textH = haystack((input.text ?? "").slice(0, 2000));
  const anchorH = haystack(input.anchor ?? "");

  let score = 0;
  const topics: Topic[] = [];

  for (const topic of TOPICS) {
    const terms = TOPIC_TERMS[topic];
    const urlHits = termHits(urlH, terms);
    const titleHits = termHits(titleH, terms);
    const anchorHits = termHits(anchorH, terms);
    const textHits = termHits(textH, terms);
    const topicScore = urlHits * 4 + titleHits * 5 + anchorHits * 4 + Math.min(textHits, 3);
    if (topicScore > 0) {
      score += topicScore;
      topics.push(topic);
    }
  }

  return { score, topics };
}
