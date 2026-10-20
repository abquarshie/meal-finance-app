import { SettingsHead } from "@/components/SettingsTabs";
import { Section } from "@/components/ui";
import { inviteCode, newInviteCode, requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { loadBook } from "@/lib/load";
import { MyAccount, OwnerTools } from "./PeopleForms";

export const metadata = { title: "People" };

function backupLine(raw: string | null | undefined): { tone: "ok" | "warn" | "hint"; text: string } {
  if (!raw) return { tone: "hint", text: "No automatic backup has run yet. In your GitHub repository, add a secret called BACKUP_PASSPHRASE; the daily job then saves an encrypted copy every morning." };
  try {
    const info = JSON.parse(raw) as { at: string; kb?: number; rows?: number };
    const at = new Date(info.at);
    const days = Math.floor((Date.now() - at.getTime()) / 86_400_000);
    const when = at.toLocaleString("en-GB", { timeZone: "Africa/Accra", weekday: "short", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
    if (days >= 3) return { tone: "warn", text: `The daily backup has stopped: the last one was ${days} days ago (${when}). On GitHub, open Actions → Daily to see what went wrong.` };
    return { tone: "ok", text: `Last automatic backup: ${when} (${info.kb ?? "?"} KB${typeof info.rows === "number" ? `, ${info.rows.toLocaleString("en-US")} rows` : ""}).` };
  } catch {
    return { tone: "hint", text: "The last backup's details couldn't be read." };
  }
}

export default async function People() {
  const [me, b] = await Promise.all([requireUser(), loadBook()]);
  let code: string | null = null;
  let backup = null;
  if (me.isOwner) {
    code = (await inviteCode()) ?? (await newInviteCode());
    backup = backupLine((await prisma.appMeta.findUnique({ where: { key: "last_backup" } }))?.value);
  }
  return (
    <>
      <SettingsHead current="/settings/people" sub="Your account, and who else can use this Cashew" />
      <div className={me.isOwner ? "grid2" : ""} style={me.isOwner ? undefined : { maxWidth: 560 }}>
        <MyAccount me={me} />
        {me.isOwner ? (
          <OwnerTools me={me.id} code={code!} backup={backup!}
            people={b.users.map((u) => ({ id: u.id, name: u.displayName, username: u.username, isOwner: u.isOwner,
              lastLogin: u.lastLogin ? new Date(u.lastLogin).toLocaleString("en-GB", { timeZone: "Africa/Accra", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "Never" }))} />
        ) : <div className="card"><Section title="Invites and passwords" /><p className="caption">To invite someone or reset a password, ask the account owner.</p></div>}
      </div>
    </>
  );
}
