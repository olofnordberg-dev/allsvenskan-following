import Link from "next/link";
import { FavoriteRedirect } from "@/components/FavoriteRedirect";
import { TeamLogo } from "@/components/TeamLogo";
import { getMeta } from "@/lib/data";

export default function Home() {
  const { teams, defaultTeam } = getMeta();
  return (
    <main className="stack">
      <FavoriteRedirect fallback={defaultTeam} known={teams.map((t) => t.slug)} />
      <h1>Choose a team</h1>
      <div className="team-grid">
        {teams.map((t) => (
          <Link key={t.slug} href={`/${t.slug}`}>
            <TeamLogo team={t.code} src={t.logo} color={t.color} size={28} />
            <span>{t.short}</span>
          </Link>
        ))}
      </div>
    </main>
  );
}
