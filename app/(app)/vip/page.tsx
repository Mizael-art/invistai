import type { Metadata } from "next";
import { ComingSoon } from "@/features/soon/ComingSoon";
export const metadata: Metadata = { title: "VIP — TRADEON" };
export default function Vip() { return <ComingSoon icon="vip" nameKey="nav.vip" textKey="soon.vip.text" />; }
