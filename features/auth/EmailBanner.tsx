import { getPrefs } from "@/lib/i18n/server";
import { dict } from "@/lib/i18n/dictionary";
import { ResendConfirmation } from "./ResendConfirmation";
/** Identifica o estado da conta: e-mail ainda não confirmado (o acesso continua liberado). */
export async function EmailBanner() {
  const { lang, tr } = await getPrefs(); const d = dict[lang];
  return (<div className="note" role="status" data-testid="email-banner" style={{ margin: "12px 24px 0" }}>
    <div className="row sp"><span>✉ {tr("bn.unconfirmed")}</span>
      <ResendConfirmation labels={{ btn: d["rs.btn"], wait: d["rs.wait"], busy: d["rs.busy"], sent: d["rs.sent"], fail: d["rs.fail"], rate: d["rs.rate"], notConfigured: d["rs.notConfigured"] }} /></div></div>);
}
