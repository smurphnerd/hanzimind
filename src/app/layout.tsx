import type { Metadata } from "next";
import { Inter, Nunito } from "next/font/google";
import { headers } from "next/headers";
import { ApiClientProvider } from "@/lib/orpc.client";
import { ThemeProvider } from "@/components/theme-provider";
import { AppToaster } from "@/components/app-toaster";
import { Header } from "@/components/header";
import { Footer } from "@/components/footer";
import "./globals.css";
import { env } from "@/env";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const nunito = Nunito({
  subsets: ["latin"],
  weight: ["600", "700", "800"],
  variable: "--font-nunito",
  display: "swap",
});

/**
 * Nothing here is statically prerenderable.
 *
 * Every screen fetches through the oRPC client, and under `useSuspenseQuery`
 * that fetch also runs while the page is being rendered on the server. At build
 * time the app is not listening yet, so prerendering `/study` reaches for
 * BASE_URL and dies with ECONNREFUSED before a single page is emitted. The
 * content is per-user anyway — even the landing page branches on the session —
 * so there is no static output worth rescuing here.
 *
 * The CSP nonce depends on this too: proxy.ts mints one per request, and a
 * cached or prerendered page would ship HTML with a nonce that cannot match
 * the response header, blocking every script on it.
 */
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: "HanziMind",
    description: "A community-driven platform for learning Chinese",
  };
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${inter.variable} ${nunito.variable}`}
    >
      <body className="flex min-h-screen flex-col">
        <ThemeProvider nonce={nonce}>
          <ApiClientProvider baseUrl={env.BASE_URL}>
            <Header />
            <main className="flex flex-1 flex-col">{children}</main>
            <Footer />
            <AppToaster />
          </ApiClientProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
