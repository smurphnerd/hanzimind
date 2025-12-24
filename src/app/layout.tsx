import type { Metadata } from "next";
import { Toaster } from "sonner";
import { ApiClientProvider } from "@/lib/orpc.client";
import { Header } from "@/components/header";
import { Footer } from "@/components/footer";
import "./globals.css";
import { env } from "@/env";

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
    <html lang="en">
      <body className="flex min-h-screen flex-col">
        <ApiClientProvider baseUrl={env.BASE_URL}>
          <Header />
          <main className="flex-1">{children}</main>
          <Footer />
          <Toaster />
        </ApiClientProvider>
      </body>
    </html>
  );
}
