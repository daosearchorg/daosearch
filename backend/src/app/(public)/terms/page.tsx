import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: "Terms of Service for DaoSearch.",
};

export default function TermsPage() {
  return (
    <div className="flex flex-col gap-6 sm:gap-8">
      <div className="flex flex-col items-center gap-1.5 sm:gap-2 pt-2">
        <h1 className="text-2xl sm:text-4xl font-medium tracking-tight">Terms of Service</h1>
        <p className="text-sm sm:text-base text-muted-foreground">
          By using DaoSearch, you agree to these terms
        </p>
      </div>

      <section className="flex flex-col gap-4">
        <h2 className="text-base sm:text-lg font-medium">The service</h2>
        <p className="text-sm sm:text-base text-muted-foreground leading-relaxed">
          DaoSearch is a discovery and tracking platform for web novels. We aggregate novel
          metadata and translate it so English-speaking readers can find what to read.
          We don&apos;t host novel content — we help you discover it.
        </p>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-base sm:text-lg font-medium">Accounts</h2>
        <p className="text-sm sm:text-base text-muted-foreground leading-relaxed">
          You can sign up with Google or Discord. One account per person. You&apos;re responsible for
          your account and anything that happens under it.
        </p>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-base sm:text-lg font-medium">Your content</h2>
        <p className="text-sm sm:text-base text-muted-foreground leading-relaxed">
          Reviews, booklists, tags, and ratings you create are yours. By posting them on DaoSearch,
          you give us permission to display them publicly as part of the platform. Keep it civil — no
          spam, hate speech, or illegal content.
        </p>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-base sm:text-lg font-medium">Don&apos;t be that person</h2>
        <p className="text-sm sm:text-base text-muted-foreground leading-relaxed">
          No spam, no impersonating others, no harassing other users. Don&apos;t use the platform for
          anything illegal. Pretty standard stuff.
        </p>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-base sm:text-lg font-medium">Intellectual property</h2>
        <p className="text-sm sm:text-base text-muted-foreground leading-relaxed">
          Novel content belongs to its original authors and publishers. DaoSearch doesn&apos;t claim
          ownership of any novel content. User-generated content (reviews, lists, tags) belongs to
          the people who created it.
        </p>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-base sm:text-lg font-medium">Disclaimer</h2>
        <p className="text-sm sm:text-base text-muted-foreground leading-relaxed">
          The service is provided &ldquo;as is&rdquo;. Translations are machine-generated and may not be
          perfect. We do our best to keep data accurate but can&apos;t guarantee it.
        </p>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-base sm:text-lg font-medium">Account suspension</h2>
        <p className="text-sm sm:text-base text-muted-foreground leading-relaxed">
          We reserve the right to suspend or remove accounts that violate these terms.
        </p>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-base sm:text-lg font-medium">Changes</h2>
        <p className="text-sm sm:text-base text-muted-foreground leading-relaxed">
          We may update these terms from time to time. If we do, we&apos;ll note it in our changelog.
          Continuing to use the site means you accept the updated terms.
        </p>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-base sm:text-lg font-medium">Contact</h2>
        <p className="text-sm sm:text-base text-muted-foreground leading-relaxed">
          Questions or concerns? Email us at{" "}
          <a href="mailto:daosearch@gmail.com" className="text-foreground hover:underline">
            daosearch@gmail.com
          </a>
        </p>
      </section>
    </div>
  );
}
