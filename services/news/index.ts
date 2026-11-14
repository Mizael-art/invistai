import { cache } from "react";
import { toResult } from "../types";
import { fetchLatestNews } from "./newsapi";
export const getLatestNews = cache((lang: "pt" | "en") => toResult(() => fetchLatestNews(lang, 5)));
export const getAssetNews = cache((query: string, lang: "pt" | "en") => toResult(() => fetchLatestNews(lang, 5, query)));
