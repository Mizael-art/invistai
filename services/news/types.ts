export type NewsCategory = "crypto" | "stocks" | "economy" | "forex";
export interface NewsItem { id: string; title: string; source: string; url: string; publishedAt: string; imageUrl: string | null; category?: NewsCategory }
