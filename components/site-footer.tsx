import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="mt-24 border-t border-[#dcd2c3] bg-[#f7f3ea]">
      <div className="page-wrap grid gap-10 py-12 md:grid-cols-[1.3fr_.7fr_.7fr]">
        <div>
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-full border border-[#394b60] font-serif text-[#394b60]">
              6
            </span>
            <div>
              <p className="serif text-xl leading-tight">Joshua Kimmich Archive</p>
              <p className="text-[9px] font-bold uppercase tracking-[.2em] text-[#756e64]">
                A living archive
              </p>
            </div>
          </div>
          <p className="mt-5 max-w-md text-sm leading-7 text-[#756e64]">
            An independent, community-built reading room for matches, words and moments. Not affiliated with
            Joshua Kimmich, FC Bayern München or the DFB.
          </p>
        </div>
        <div>
          <p className="eyebrow">Archive</p>
          <div className="mt-4 grid gap-2 text-sm text-[#756e64]">
            <Link href="/photos" className="hover:text-[#403a32]">Photo collection</Link>
            <Link href="/videos" className="hover:text-[#403a32]">Video collection</Link>
            <Link href="/interviews" className="hover:text-[#403a32]">Interviews & words</Link>
            <Link href="/matches" className="hover:text-[#403a32]">Match index</Link>
          </div>
        </div>
        <div>
          <p className="eyebrow">Community</p>
          <div className="mt-4 grid gap-2 text-sm text-[#756e64]">
            <Link href="/profile" className="hover:text-[#403a32]">Player dossier</Link>
            <Link href="/community" className="hover:text-[#403a32]">Fan forum</Link>
            <Link href="/register" className="hover:text-[#403a32]">Become a contributor</Link>
            <a href="mailto:rights@example.com" className="hover:text-[#403a32]">Rights enquiries</a>
          </div>
        </div>
      </div>
      <div className="border-t border-[#dcd2c3]/70 py-4">
        <div className="page-wrap flex flex-col justify-between gap-2 text-[9px] font-semibold uppercase tracking-[.14em] text-[#756e64] sm:flex-row">
          <span>© 2026 Joshua Kimmich Archive</span>
          <span>Demo content is labelled · user media is reviewed</span>
        </div>
      </div>
    </footer>
  );
}
