import type { Metadata, Viewport } from "next";
import "./globals.css";
import { AuthProvider } from "@/components/auth-provider";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";

export const metadata: Metadata = {
  title: {
    default: "Joshua Kimmich Archive",
    template: "%s · Joshua Kimmich Archive",
  },
  description: "A living archive of matches, words and moments.",
  applicationName: "Joshua Kimmich Archive",
  openGraph: {
    title: "Joshua Kimmich Archive",
    description: "A living archive of matches, words and moments.",
    type: "website",
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#faf6ed",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>
          <a
            href="#main-content"
            className="fixed left-3 top-3 z-[100] -translate-y-24 bg-[#394b60] px-4 py-2 text-sm text-white focus:translate-y-0"
          >
            Skip to content
          </a>
          <SiteHeader />
          <main id="main-content">{children}</main>
          <SiteFooter />
        </AuthProvider>
      </body>
    </html>
  );
}
