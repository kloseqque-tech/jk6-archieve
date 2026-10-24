import { Suspense } from "react";
import { AuthForm } from "@/components/auth-form";

export const metadata = { title: "Join the archive" };

export default function RegisterPage() {
  return (
    <section className="page-wrap grid min-h-[70vh] items-center gap-10 py-12 md:grid-cols-[1fr_460px]">
      <div className="hidden md:block">
        <p className="eyebrow">Contribute with context</p>
        <p className="display mt-6 max-w-xl text-7xl">
          Add your
          <br />
          <span className="italic text-[#394b60]">chapter.</span>
        </p>
        <p className="mt-6 max-w-sm text-sm leading-7 text-[#756e64]">
          Join a community that values provenance over speed. Uploads are reviewed, sources stay visible, and
          discussion remains connected to the record.
        </p>
      </div>
      <Suspense fallback={<div className="paper-panel h-[560px] skeleton" />}>
        <AuthForm mode="register" />
      </Suspense>
    </section>
  );
}
