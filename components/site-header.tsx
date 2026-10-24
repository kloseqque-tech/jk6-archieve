"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { useAuth } from "./auth-provider";
import { CloseIcon, MenuIcon, SearchIcon, UploadIcon } from "./icons";

const links = [
  { href: "/photos", label: "Photos" },
  { href: "/videos", label: "Videos" },
  { href: "/interviews", label: "Words" },
  { href: "/matches", label: "Matches" },
  { href: "/community", label: "Community" },
];

export function SiteHeader() {
  const pathname = usePathname();
  const { user, loading, logout } = useAuth();
  const [open, setOpen] = useState(false);

  const isActive = (href: string) => pathname === href || Boolean(pathname?.startsWith(`${href}/`));

  return (
    <>
      <div className="hidden border-b border-[#dcd2c3]/80 bg-[#f7f3ea]/80 py-1.5 text-[9px] font-semibold uppercase tracking-[.18em] text-[#756e64] sm:block">
        <div className="page-wrap flex items-center justify-between">
          <span>Independent fan archive · Est. 2026</span>
          <span className="flex items-center gap-4">
            <span>Matches · Words · Moments</span>
            <span className="text-[#394b60]">No. 06</span>
          </span>
        </div>
      </div>
      <header className="sticky top-0 z-50 border-b border-[#dcd2c3] bg-[#faf6ed]/95 backdrop-blur-md">
        <div className="page-wrap flex h-[72px] items-center justify-between gap-6">
          <Link href="/" className="group flex shrink-0 items-center gap-3" aria-label="Joshua Kimmich Archive home">
            <span className="grid h-9 w-9 place-items-center rounded-full border border-[#394b60] font-serif text-sm text-[#394b60] transition group-hover:bg-[#394b60] group-hover:text-[#fffdf8]">
              6
            </span>
            <span className="leading-none">
              <span className="serif block text-[17px] tracking-[-.025em] sm:text-[19px]">Joshua Kimmich</span>
              <span className="mt-1 block text-[8px] font-bold uppercase tracking-[.24em] text-[#756e64]">
                Archive
              </span>
            </span>
          </Link>

          <nav className="hidden items-center gap-1 lg:flex" aria-label="Main navigation">
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={`relative px-3 py-2 text-[11px] font-bold uppercase tracking-[.12em] transition ${
                  isActive(link.href) ? "text-[#394b60]" : "text-[#756e64] hover:text-[#403a32]"
                }`}
              >
                {link.label}
                {isActive(link.href) ? (
                  <span className="absolute inset-x-3 -bottom-[13px] h-px bg-[#394b60]" />
                ) : null}
              </Link>
            ))}
          </nav>

          <div className="hidden items-center gap-2 md:flex">
            <Link href="/search" aria-label="Search the archive" className="grid h-9 w-9 place-items-center border border-[#dcd2c3] text-[#756e64] hover:border-[#394b60] hover:text-[#394b60]">
              <SearchIcon width={15} height={15} />
            </Link>
            {!loading && user ? (
              <>
                {user.role === "admin" || user.role === "editor" ? (
                  <Link href="/admin" className="button-quiet">
                    Admin
                  </Link>
                ) : null}
                <Link href={`/users/${user.username}`} className="px-2 text-xs font-semibold hover:text-[#394b60]">
                  {user.displayName}
                </Link>
                <Link href="/photos?upload=1" className="button-primary !min-h-9 !px-3 !text-[9px]">
                  <UploadIcon width={14} height={14} />
                  Upload
                </Link>
                <button type="button" onClick={() => void logout()} className="button-quiet !min-h-9">
                  Log out
                </button>
              </>
            ) : (
              <>
                <Link href="/login" className="px-3 py-2 text-[11px] font-bold uppercase tracking-[.1em]">
                  Sign in
                </Link>
                <Link href="/register" className="button-primary !min-h-9 !px-4 !text-[9px]">
                  Join archive
                </Link>
              </>
            )}
          </div>

          <button
            type="button"
            aria-label="Open navigation"
            aria-expanded={open}
            className="grid h-10 w-10 place-items-center border border-[#dcd2c3] lg:hidden"
            onClick={() => setOpen((value) => !value)}
          >
            {open ? <CloseIcon /> : <MenuIcon />}
          </button>
        </div>

        {open ? (
          <div className="border-t border-[#dcd2c3] bg-[#faf6ed] lg:hidden">
            <nav className="page-wrap grid gap-1 py-4" aria-label="Mobile navigation">
              {links.map((link, index) => (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setOpen(false)}
                  className="flex items-center justify-between border-b border-[#dcd2c3]/70 py-3"
                >
                  <span className="serif text-xl">{link.label}</span>
                  <span className="text-[10px] tracking-widest text-[#756e64]">0{index + 1}</span>
                </Link>
              ))}
              <div className="flex flex-wrap gap-2 pt-3">
                <Link href="/search" className="button-quiet" onClick={() => setOpen(false)}>Search</Link>
                {user ? (
                  <>
                    <Link href={`/users/${user.username}`} className="button-secondary" onClick={() => setOpen(false)}>
                      My profile
                    </Link>
                    <Link href="/photos?upload=1" className="button-primary" onClick={() => setOpen(false)}>
                      Upload media
                    </Link>
                    {user.role !== "member" ? (
                      <Link href="/admin" className="button-quiet" onClick={() => setOpen(false)}>
                        Admin
                      </Link>
                    ) : null}
                  </>
                ) : (
                  <>
                    <Link href="/login" className="button-secondary" onClick={() => setOpen(false)}>
                      Sign in
                    </Link>
                    <Link href="/register" className="button-primary" onClick={() => setOpen(false)}>
                      Join archive
                    </Link>
                  </>
                )}
              </div>
            </nav>
          </div>
        ) : null}
      </header>
    </>
  );
}
