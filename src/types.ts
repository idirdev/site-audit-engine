export type Severity = "critical" | "warning" | "info" | "pass";
export type Category = "seo" | "performance" | "accessibility" | "security" | "html";

export interface AuditIssue {
  category: Category;
  severity: Severity;
  rule: string;
  message: string;
  selector?: string;
  value?: string;
  expected?: string;
  url?: string;
  line?: number;
}

export interface PageData {
  url: string;
  statusCode: number;
  responseTimeMs: number;
  contentType: string;
  contentLength: number;
  html: string;
  headers: Record<string, string>;
  redirectChain: string[];
}

export interface AuditResult {
  url: string;
  timestamp: string;
  durationMs: number;
  score: CategoryScore;
  issues: AuditIssue[];
  meta: PageMeta;
  links: LinkInfo[];
  images: ImageInfo[];
  headers: HeaderInfo;
}

export interface CategoryScore {
  overall: number;
  seo: number;
  performance: number;
  accessibility: number;
  security: number;
  html: number;
}

export interface PageMeta {
  title: string | null;
  titleLength: number;
  description: string | null;
  descriptionLength: number;
  canonical: string | null;
  ogTitle: string | null;
  ogDescription: string | null;
  ogImage: string | null;
  twitterCard: string | null;
  viewport: string | null;
  charset: string | null;
  lang: string | null;
  robots: string | null;
  favicon: string | null;
  h1Count: number;
  h1Text: string[];
  wordCount: number;
  headings: { level: number; text: string }[];
}

export interface LinkInfo {
  href: string;
  text: string;
  isExternal: boolean;
  hasNofollow: boolean;
  statusCode?: number;
}

export interface ImageInfo {
  src: string;
  alt: string | null;
  width: string | null;
  height: string | null;
  hasLazyLoad: boolean;
  sizeBytes?: number;
}

export interface HeaderInfo {
  hasHSTS: boolean;
  hasCSP: boolean;
  hasXFrame: boolean;
  hasXContent: boolean;
  hasReferrer: boolean;
  hasPermissions: boolean;
  server: string | null;
  poweredBy: string | null;
}

export interface AuditConfig {
  url: string;
  followRedirects: boolean;
  timeout: number;
  userAgent: string;
  checkLinks: boolean;
  maxDepth: number;
}
