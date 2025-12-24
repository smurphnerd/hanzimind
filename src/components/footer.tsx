import Link from "next/link";

export function Footer() {
  return (
    <footer className="border-t mt-auto">
      <div className="container mx-auto flex h-16 items-center justify-between px-4 text-sm text-muted-foreground">
        <div className="flex items-center gap-4">
          <span>© 2025 Hanzimind</span>
          <Link href="/resources" className="hover:text-foreground">
            Resources
          </Link>
          <Link href="/privacy" className="hover:text-foreground">
            Privacy Policy
          </Link>
        </div>
      </div>
    </footer>
  );
}
