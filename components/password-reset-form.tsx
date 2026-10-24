"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/client";

export function PasswordResetForm() {
  const params = useSearchParams();
  const token = params?.get("token") || "";
  const [message, setMessage] = useState("");
  const [localLink, setLocalLink] = useState("");
  const [error, setError] = useState("");

  const request = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    const body = new FormData(event.currentTarget);
    try {
      const payload = await api<{ message: string; localResetUrl?: string }>("/api/auth/forgot-password", {
        method: "POST",
        body: JSON.stringify({ email: body.get("email") }),
      });
      setMessage(payload.message);
      setLocalLink(payload.localResetUrl || "");
    } catch (err) {
      setError(err instanceof Error ? err.message : "请求失败。");
    }
  };

  const reset = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    const body = new FormData(event.currentTarget);
    try {
      const payload = await api<{ message: string }>("/api/auth/reset-password", {
        method: "POST",
        body: JSON.stringify({ token, password: body.get("password") }),
      });
      setMessage(payload.message);
    } catch (err) {
      setError(err instanceof Error ? err.message : "密码重置失败。");
    }
  };

  return (
    <form onSubmit={token ? reset : request} className="paper-panel p-7">
      <p className="eyebrow">{token ? "Secure reset link" : "Account recovery"}</p>
      <h1 className="serif mt-3 text-4xl">{token ? "Choose a new password." : "Reset your password."}</h1>
      <p className="mt-3 text-sm leading-7 text-[#756e64]">
        {token ? "重置链接有效期为 30 分钟，使用一次后失效。" : "我们不会在响应中披露邮箱是否已注册。"}
      </p>
      <div className="mt-6">
        {token ? (
          <>
            <label className="field-label" htmlFor="reset-password">New password</label>
            <input id="reset-password" name="password" type="password" minLength={8} maxLength={128} className="field" required autoComplete="new-password" />
          </>
        ) : (
          <>
            <label className="field-label" htmlFor="reset-email">Email</label>
            <input id="reset-email" name="email" type="email" className="field" required autoComplete="email" />
          </>
        )}
      </div>
      {error ? <div className="error-box mt-4">{error}</div> : null}
      {message ? (
        <div className="notice mt-4">
          <p>{message}</p>
          {localLink ? <Link href={localLink} className="mt-2 block break-all font-semibold underline">本地开发重置链接</Link> : null}
        </div>
      ) : null}
      <button type="submit" className="button-primary mt-5 w-full">{token ? "Set new password" : "Send reset instructions"}</button>
      <Link href="/login" className="mt-4 block text-center text-xs text-[#756e64] underline">Back to sign in</Link>
    </form>
  );
}
