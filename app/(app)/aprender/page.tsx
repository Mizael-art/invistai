import type { Metadata } from "next";
import { ComingSoon } from "@/features/soon/ComingSoon";
export const metadata: Metadata = { title: "Aprender — TRADEON" };
export default function Aprender() { return <ComingSoon icon="learn" nameKey="nav.learn" textKey="soon.learn.text" />; }
