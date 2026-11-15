import { AdminNav } from "@/features/admin/AdminNav";
import { notFound, redirect } from "next/navigation";
import { getSessionUser } from "@/services/session";
import { isAdmin } from "@/services/calls";

export const dynamic = "force-dynamic";
/** Painel administrativo: só para contas em app_admins (checado no banco). Para os demais a área nem existe (404). */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  if (!(await getSessionUser())) redirect("/login?next=%2Fadmin");
  if (!(await isAdmin())) notFound();
  return (<div className="adm">
    <AdminNav />
    {children}
  </div>);
}
