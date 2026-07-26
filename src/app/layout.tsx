import type { Metadata } from "next";
import { Inter, Nunito } from "next/font/google";
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

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: "HanziMind",
    description: "A community-driven platform for learning Chinese",
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${inter.variable} ${nunito.variable}`}
    >
      <body className="flex min-h-screen flex-col">
        <ThemeProvider>
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
