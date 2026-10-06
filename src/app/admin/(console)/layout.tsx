/**
 * Visual shell for the admin console.
 *
 * The whole of /admin is this console now; the group exists to keep the shell
 * scoped to the console's pages rather than the auth layout above them.
 */
import { AdminShell } from '@/components/admin/shell/AdminShell';

export default function AdminConsoleLayout({ children }: { children: React.ReactNode }) {
  return <AdminShell>{children}</AdminShell>;
}
