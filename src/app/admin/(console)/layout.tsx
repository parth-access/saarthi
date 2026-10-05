/**
 * Visual shell for the new admin console.
 *
 * Scoped to this route group so the console's chrome applies to the sections
 * being built, while `/admin/legacy` — the console operators still use today —
 * keeps rendering with its own full-page layout and is not double-framed.
 */
import { AdminShell } from '@/components/admin/shell/AdminShell';

export default function AdminConsoleLayout({ children }: { children: React.ReactNode }) {
  return <AdminShell>{children}</AdminShell>;
}
