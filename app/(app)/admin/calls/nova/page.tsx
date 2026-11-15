import Link from "next/link";
import { CallForm } from "@/features/admin/CallForm";
export default function NovaCall() {
  return (<><div className="page-h"><div><Link href="/admin/calls" className="src">← Calls</Link><h1 style={{ marginTop: 6 }}>Nova call</h1></div></div><CallForm /></>);
}
