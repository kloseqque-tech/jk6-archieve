import Link from "next/link";

export default function AuthCallbackPage() {
  return (
    <section className="page-wrap grid min-h-[60vh] place-items-center py-16 text-center">
      <div className="paper-panel max-w-lg p-8">
        <p className="eyebrow">Authentication callback</p>
        <h1 className="serif mt-3 text-4xl">Your session is ready.</h1>
        <p className="mt-4 text-sm leading-7 text-[#756e64]">
          This route is reserved for the Supabase authentication callback. Local email/password sessions do not
          require a callback.
        </p>
        <Link href="/" className="button-primary mt-6">Return to the archive</Link>
      </div>
    </section>
  );
}
