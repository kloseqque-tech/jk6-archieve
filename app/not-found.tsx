import Link from "next/link";

export default function NotFound() {
  return (
    <section className="page-wrap grid min-h-[65vh] place-items-center py-16 text-center">
      <div>
        <p className="font-serif text-[9rem] leading-none text-[#394b60]/15">404</p>
        <h1 className="serif -mt-3 text-5xl">Off the record.</h1>
        <p className="mx-auto mt-4 max-w-md text-sm leading-7 text-[#756e64]">This page is not in the archive, or the record has moved.</p>
        <Link href="/" className="button-primary mt-6">Return to the archive</Link>
      </div>
    </section>
  );
}
