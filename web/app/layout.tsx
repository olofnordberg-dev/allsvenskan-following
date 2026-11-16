import type { Metadata } from "next";
import Link from "next/link";
import "@fontsource/barlow-condensed/600.css";
import "@fontsource/barlow-condensed/700.css";
import "@fontsource/barlow-condensed/800.css";
import { TeamPicker } from "@/components/TeamPicker";
import { THEME_SCRIPT, ThemeToggle } from "@/components/ThemeToggle";
import { getMeta } from "@/lib/data";
import "./globals.css";

export const metadata: Metadata = {
  title: "Matchplan",
  description: "Follow your Allsvenskan team: the next match, strengths, weaknesses, line-ups and trends.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  const meta = getMeta();
  const teams = meta.teams.map((t) => ({ slug: t.slug, name: t.name }));
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body>
        <header className="appbar">
          <div className="appbar-inner">
            <Link href="/" className="brand">MATCH<span>PLAN</span></Link>
            <div className="appbar-tools">
              <Link href="/methods" className="appbar-link">Methods</Link>
              <TeamPicker teams={teams} fallback={meta.defaultTeam} />
              <ThemeToggle />
            </div>
          </div>
        </header>
        <div className="shell">{children}</div>
      </body>
    </html>
  );
}
