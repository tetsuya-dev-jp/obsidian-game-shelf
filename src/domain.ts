export interface SearchItem {
  slug: string;
  title: string;
  url: string;
  cover_url: string | null;
  rating: number | null;
  subtitle: string | null;
}

export interface SearchPage {
  query: string;
  page: number;
  total: number;
  total_pages: number;
  items: SearchItem[];
  fetched_at: string;
}

export interface Game {
  slug: string;
  url: string;
  title: string;
  description: string | null;
  developers: string[];
  publishers: string[];
  directors: string[];
  release_date: string | null;
  release_date_scope: string | null;
  release_dates: { date: string; scope: string | null }[];
  platforms: string[];
  tags: string[];
  age_rating: string | null;
  status: string | null;
  ratings: { igdb: number | null; steam: number | null };
  cover_url: string | null;
  hero_url: string | null;
  screenshots: string[];
  trailers: string[];
  stores: { store: string; name: string; url: string }[];
  articles: {
    title: string;
    url: string;
    source: string | null;
    date: string | null;
    category: string | null;
    summary: string | null;
  }[];
  related: { slug: string; title: string; url: string }[];
  updated_at: string | null;
  fetched_at: string;
  steam: SteamData | null;
}

export interface SteamData {
  players: number | null;
  playersBase: boolean;
  review: { pct: number; desc: string; total: number } | null;
  reviewLocal: { pct: number; desc: string; total: number } | null;
  price: {
    free: boolean;
    formatted: string | null;
    initialFormatted: string | null;
    discount: number;
  } | null;
  history: { from: string; peaks: number[]; peak: number } | null;
  fetched_at: string;
}

export const STATUSES = [
  'backlog',
  'playing',
  'completed',
  'paused',
  'dropped',
  'wishlist',
] as const;
export type PlayStatus = string;
export type Locale = 'en' | 'ja';
export type MetadataValue = string | number | boolean | null | string[];
export type Metadata = Record<string, MetadataValue>;

export const FIELD_GROUPS = [
  'basics',
  'description',
  'ratings',
  'stores',
  'articles',
  'media',
  'steam',
] as const;
export type FieldGroup = (typeof FIELD_GROUPS)[number];

export interface ShelfSettings {
  folder: string;
  coverFolder: string;
  filename: string;
  language: 'auto' | Locale;
  online: boolean;
  saveCover: boolean;
  groups: FieldGroup[];
  template: string;
  propertyNames: Record<string, string>;
  statuses: string[];
}

export const DEFAULT_TEMPLATE =
  '{{cover}}\n# {{title}}\n\n{{source}}\n\n## {{notes_heading}}\n\n\n## {{journal_heading}}\n\n{{journal_marker}}\n';
export const DEFAULT_SETTINGS: ShelfSettings = {
  folder: 'Games',
  coverFolder: 'Games/Attachments',
  filename: '{{title}}',
  language: 'auto',
  online: false,
  saveCover: true,
  groups: ['basics', 'ratings', 'stores'],
  template: DEFAULT_TEMPLATE,
  propertyNames: {},
  statuses: [...STATUSES],
};

export interface LibraryItem {
  path: string;
  id: string;
  slug: string | null;
  title: string;
  status: PlayStatus;
  rating: number | null;
  platforms: string[];
  genres: string[];
  cover: string | null;
  releaseDate: string | null;
  modified: number;
  minutes: number;
}
