import { Suspense } from "react";
import { PasswordResetForm } from "@/components/password-reset-form";

export const metadata = { title: "Reset password" };

export default function ResetPasswordPage() {
  return <section className="page-wrap grid min-h-[65vh] place-items-center py-12"><div className="w-full max-w-lg"><Suspense fallback={<div className="skeleton h-96" />}><PasswordResetForm /></Suspense></div></section>;
}
