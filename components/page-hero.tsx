export function PageHero({
  number,
  eyebrow,
  title,
  description,
  children,
}: {
  number: string;
  eyebrow: string;
  title: string;
  description: string;
  children?: React.ReactNode;
}) {
  return (
    <section className="border-b border-[#dcd2c3]">
      <div className="page-wrap grid gap-8 py-10 md:grid-cols-[130px_1fr_auto] md:items-end md:py-14">
        <div className="hidden md:block">
          <span className="font-serif text-[6rem] leading-none text-[#394b60]/15">{number}</span>
        </div>
        <div>
          <p className="eyebrow">{eyebrow}</p>
          <h1 className="display mt-4 max-w-3xl text-[clamp(3.1rem,8vw,6.8rem)]">{title}</h1>
          <p className="mt-5 max-w-2xl text-sm leading-7 text-[#756e64]">{description}</p>
        </div>
        {children ? <div className="md:pb-2">{children}</div> : null}
      </div>
    </section>
  );
}
