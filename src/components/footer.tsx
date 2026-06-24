import Link from "next/link";

export function Footer() {
  return (
    <footer className="relative mt-auto border-t-2 border-gold/40 bg-rice-paper">
      {/* Decorative top border */}
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-gold to-transparent" />

      <div className="container mx-auto px-4 py-8">
        {/* Ornamental divider */}
        <div className="divider-ornamental mb-6">
          <span className="medallion">福</span>
        </div>

        <div className="flex flex-col items-center justify-between gap-4 text-sm text-muted-foreground md:flex-row">
          <div className="flex items-center gap-6">
            <span className="font-brush text-lg text-primary">漢字心</span>
            <span>© 2025 HanziMind</span>
          </div>

          <div className="flex items-center gap-6">
            <Link
              href="/resources"
              className="transition-colors hover:text-primary"
            >
              Resources
            </Link>
            <Link
              href="/privacy"
              className="transition-colors hover:text-primary"
            >
              Privacy Policy
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
