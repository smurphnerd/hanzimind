import Link from "next/link";

export function Footer() {
  return (
    <footer className="mt-auto border-t border-border">
      <div className="container mx-auto px-4 py-8">
        <div className="flex flex-col items-center justify-between gap-4 text-sm text-muted-foreground md:flex-row">
          <div className="flex items-center gap-3">
            <span className="font-display font-extrabold text-foreground">
              HanziMind
            </span>
            <span>© 2025</span>
          </div>

          <div className="flex items-center gap-6">
            <Link
              href="/resources"
              className="transition-colors hover:text-foreground"
            >
              Resources
            </Link>
            <Link
              href="/privacy"
              className="transition-colors hover:text-foreground"
            >
              Privacy Policy
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
