import { Suspense } from "react";
import { AuthForm } from "@/components/auth-form";

export const metadata = { title: "Sign in" };

export default function LoginPage() {
  return (
    <section className="page-wrap grid min-h-[70vh] items-center gap-10 py-12 md:grid-cols-[1fr_460px]">
      <div className="hidden md:block">
        <p className="eyebrow">A living archive</p>
        <p className="display mt-6 max-w-xl text-7xl">
          Keep the
          <br />
          <span className="italic text-[#394b60]">context</span>
          <br />
          alive.
        </p>
        <p className="mt-6 max-w-sm text-sm leading-7 text-[#756e64]">
          Your account connects contributions to their source, supports moderation and makes community discussion
          accountable.
        </p>
      </div>
      <Suspense fallback={<div className="paper-panel h-[500px] skeleton" />}>
        <AuthForm mode="login" />
      </Suspense>
    </section>
  );
}
