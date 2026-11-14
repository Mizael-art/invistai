import Link from "next/link";
import { getPrefs } from "@/lib/i18n/server";
export default async function AssetNotFound() {
  const { tr } = await getPrefs();
  return (<div className="card" style={{ textAlign: "center", padding: 40 }}><h1>{tr("as.notfound")}</h1><p className="mt" style={{ margin: "10px 0 20px" }}>{tr("as.notfoundText")}</p><Link href="/mercado" className="btn">{tr("as.back")}</Link></div>);
}
