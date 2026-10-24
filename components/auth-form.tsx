"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { useAuth } from "./auth-provider";
import { api } from "@/lib/client";

export function AuthForm({ mode }: { mode: "login" | "register" }) {
  const router = useRouter();
  const params = useSearchParams();
  const { refresh, showToast } = useAuth();
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setSubmitting(true);
    const form = new FormData(event.currentTarget);
    try {
      await api(`/api/auth/${mode}`, {
        method: "POST",
        body: JSON.stringify(Object.fromEntries(form)),
      });
      await refresh();
      showToast(mode === "login" ? "欢迎回到档案馆。" : "账号已创建，欢迎加入。");
      router.push(params?.get("next") || "/");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "操作失败，请重试。");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={submit} className="paper-panel p-6 sm:p-8">
      <p className="eyebrow">{mode === "login" ? "Return to the archive" : "Become a contributor"}</p>
      <h1 className="serif mt-3 text-4xl">{mode === "login" ? "Sign in" : "Join the archive"}</h1>
      <p className="mt-3 text-sm leading-7 text-[#756e64]">
        {mode === "login"
          ? "Sign in to upload media, publish fan notes and join the conversation."
          : "Create an account to submit media, save archive records and take part in community discussions."}
      </p>
      <div className="mt-7 grid gap-4">
        {mode === "register" ? (
          <>
            <div>
              <label className="field-label" htmlFor="displayName">Public display name</label>
              <input id="displayName" name="displayName" className="field" required maxLength={60} autoComplete="name" />
            </div>
            <div>
              <label className="field-label" htmlFor="username">Username</label>
              <input id="username" name="username" className="field" required pattern="[A-Za-z0-9_]{3,24}" autoComplete="username" placeholder="3–24 letters, numbers or _" />
            </div>
          </>
        ) : null}
        <div>
          <label className="field-label" htmlFor="email">Email</label>
          <input id="email" name="email" type="email" className="field" required autoComplete="email" />
        </div>
        <div>
          <label className="field-label" htmlFor="password">Password</label>
          <input
            id="password"
            name="password"
            type="password"
            className="field"
            required
            minLength={8}
            maxLength={128}
            autoComplete={mode === "login" ? "current-password" : "new-password"}
          />
          {mode === "register" ? <p className="mt-2 text-[10px] text-[#756e64]">至少 8 个字符。密码只会以加盐哈希保存。</p> : null}
        </div>
      </div>
      {error ? <div className="error-box mt-5" role="alert">{error}</div> : null}
      <button type="submit" className="button-primary mt-6 w-full" disabled={submitting}>
        {submitting ? "Please wait…" : mode === "login" ? "Sign in" : "Create account"}
      </button>
      <p className="mt-5 text-center text-xs text-[#756e64]">
        {mode === "login" ? (
          <>New here? <Link href="/register" className="line-link text-[#394b60]">Create an account</Link></>
        ) : (
          <>Already registered? <Link href="/login" className="line-link text-[#394b60]">Sign in</Link></>
        )}
      </p>
      {mode === "login" ? <p className="mt-2 text-center text-[10px]"><Link href="/forgot-password" className="text-[#756e64] underline">Forgot password?</Link></p> : null}
    </form>
  );
}
