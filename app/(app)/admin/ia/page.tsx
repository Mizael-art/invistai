import type { Metadata } from "next";
import { adminTraining } from "@/services/calls";
import { AiTraining } from "@/features/admin/AiTraining";

export const metadata: Metadata = { title: "Treinar IA — TRADEON" };
export default async function AdminIA() {
  const t = await adminTraining();
  return (<>
    <div className="page-h"><div><h1>Treinar a TRADEON AI</h1><p className="mt" style={{ margin: "6px 0 0" }}>Instruções, base de conhecimento e exemplos — sem retreinar o modelo. As regras de segurança (dados reais, sem promessas, sem recomendação individual) são fixas.</p></div></div>
    {t ? <AiTraining t={t} /> : <p className="note" role="alert">Não foi possível carregar a configuração da IA.</p>}
  </>);
}
