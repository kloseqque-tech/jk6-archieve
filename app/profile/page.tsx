import Link from "next/link";
import { ArrowUpRight } from "@/components/icons";
import { PageHero } from "@/components/page-hero";

const timeline = [
  {
    year: "1995",
    title: "Born in Rottweil",
    text: "Joshua Walter Kimmich was born on 8 February 1995 in Rottweil, Germany.",
    source: "https://www.dfb.de/en/national-teams/national-team/joshua-kimmich",
  },
  {
    year: "Youth",
    title: "Stuttgart to Leipzig",
    text: "He came through VfB Stuttgart's youth pathway before joining RB Leipzig in 2013.",
    source: "https://www.dfb.de/en/national-teams/national-team/joshua-kimmich",
  },
  {
    year: "2015",
    title: "FC Bayern München",
    text: "Kimmich joined Bayern in 2015 and established himself as a versatile central midfielder and defender.",
    source: "https://fcbayern.com/en/teams/first-team/joshua-kimmich",
  },
  {
    year: "2016",
    title: "Germany senior debut",
    text: "He made his senior Germany debut in 2016 and has represented the national team in major tournaments.",
    source: "https://www.dfb.de/en/national-teams/national-team/joshua-kimmich",
  },
];

export const metadata = {
  title: "Player dossier",
  description: "A sourced career dossier for Joshua Kimmich.",
};

export default function PlayerProfilePage() {
  return (
    <>
      <PageHero
        number="06"
        eyebrow="Player dossier · last referenced 23 Oct 2026"
        title="Joshua Kimmich."
        description="Midfielder. Bayern München. Germany. This dossier keeps concise biographical claims tied to external reference sources rather than presenting the archive as an official record."
      />
      <section className="page-wrap grid gap-10 py-12 lg:grid-cols-[1fr_350px]">
        <div>
          <div className="grid gap-4 sm:grid-cols-3">
            {[
              ["1995", "Born"],
              ["No. 6", "Shirt"],
              ["Central", "Midfield"],
            ].map(([value, label]) => (
              <div key={label} className="paper-panel p-5">
                <p className="serif text-3xl">{value}</p>
                <p className="text-[9px] font-bold uppercase tracking-widest text-[#756e64]">{label}</p>
              </div>
            ))}
          </div>
          <div className="mt-12">
            <p className="eyebrow">Career register</p>
            <h2 className="display mt-4 text-5xl">A sourced timeline.</h2>
            <div className="mt-8">
              {timeline.map((entry, index) => (
                <div key={`${entry.year}-${entry.title}`} className="grid gap-4 border-t border-[#dcd2c3] py-7 sm:grid-cols-[90px_1fr]">
                  <span className="serif text-3xl text-[#394b60]">{entry.year}</span>
                  <div>
                    <h3 className="serif text-2xl">{entry.title}</h3>
                    <p className="mt-2 max-w-2xl text-sm leading-7 text-[#756e64]">{entry.text}</p>
                    <a href={entry.source} target="_blank" rel="noreferrer noopener" className="mt-3 inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-[.12em] text-[#394b60]">
                      Reference source {String(index + 1).padStart(2, "0")} <ArrowUpRight width={11} height={11} />
                    </a>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="mt-10 border border-[#dcd2c3] bg-[#f7f3ea] p-5 text-xs leading-6 text-[#756e64]">
            This page avoids fast-changing statistics without a trusted live data source. Match records and current squad details should be checked at their cited source before reuse.
          </div>
        </div>
        <aside className="space-y-5 self-start lg:sticky lg:top-28">
          <div className="paper-panel overflow-hidden">
            <img src="/assets/diagonal.svg" alt="Original abstract midfield illustration" className="aspect-[4/5] w-full object-cover" />
            <div className="p-5">
              <span className="source-badge demo">Original illustration</span>
              <p className="mt-3 text-[10px] leading-5 text-[#756e64]">This is not a photograph of Kimmich and is labelled as demonstration artwork.</p>
            </div>
          </div>
          <div className="paper-panel p-5">
            <p className="eyebrow">Reference links</p>
            <div className="mt-4 grid gap-2 text-xs">
              <a className="line-link" href="https://fcbayern.com/en/teams/first-team/joshua-kimmich" target="_blank" rel="noreferrer noopener">FC Bayern player profile</a>
              <a className="line-link" href="https://www.dfb.de/en/national-teams/national-team/joshua-kimmich" target="_blank" rel="noreferrer noopener">DFB player profile</a>
              <a className="line-link" href="https://www.uefa.com/" target="_blank" rel="noreferrer noopener">UEFA competitions</a>
            </div>
          </div>
          <Link href="/matches" className="button-secondary w-full">Open match register</Link>
        </aside>
      </section>
    </>
  );
}
