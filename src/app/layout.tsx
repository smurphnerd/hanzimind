import type { Metadata } from "next";
import { Toaster } from "sonner";
import { Ma_Shan_Zheng } from "next/font/google";
import { ApiClientProvider } from "@/lib/orpc.client";
import { Header } from "@/components/header";
import { Footer } from "@/components/footer";
import "./globals.css";
import { env } from "@/env";

const maShanZheng = Ma_Shan_Zheng({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-brush",
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
    <html lang="en" className={maShanZheng.variable}>
      <body className="flex min-h-screen flex-col pattern-clouds">
        <ApiClientProvider baseUrl={env.BASE_URL}>
          <Header />
          <main className="flex-1">{children}</main>
          <Footer />
          <Toaster
            toastOptions={{
              style: {
                background: "oklch(0.94 0.02 85)",
                border: "1px solid oklch(0.75 0.15 85)",
                color: "oklch(0.15 0.01 0)",
              },
            }}
          />
        </ApiClientProvider>
      </body>
    </html>
  );
}
