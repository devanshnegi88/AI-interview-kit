import type { Topic } from "./score";

export interface PageRecord {
  url: string;
  finalUrl: string;
  title: string;
  text: string;
  score: number;
  topics: Topic[];
  status: number;
  depth: number;
  fetchedAt: string;
}

export interface SkippedSource {
  url: string;
  reason: string;
  code?: string;
}

export interface CompanyResearch {
  startUrl: string;
  pages: PageRecord[];
  skipped: SkippedSource[];
  discovered: Record<Topic, string[]>;
}
