import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "Privacy Policy for DaoSearch.",
};

export default function PrivacyPage() {
  return (
    <div className="flex flex-col gap-6 sm:gap-8">
      <div className="flex flex-col items-center gap-1.5 sm:gap-2 pt-2">
        <h1 className="text-2xl sm:text-4xl font-medium tracking-tight">Privacy Policy</h1>
        <p className="text-sm sm:text-base text-muted-foreground">
          What we collect, why, and what we do with it
        </p>
      </div>

      <section className="flex flex-col gap-4">
        <h2 className="text-base sm:text-lg font-medium">Information we collect</h2>
        <p className="text-sm sm:text-base text-muted-foreground leading-relaxed">
          When you sign in with Google or Discord, we receive your email address, display name, and
          provider account ID. You can also set a public username and upload an avatar.
        </p>
        <p className="text-sm sm:text-base text-muted-foreground leading-relaxed">
          As you use the site, we store your activity — reading progress, bookmarks, ratings, reviews,
          booklists, tags, and likes. This is what powers the community features.
        </p>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-base sm:text-lg font-medium">How we use it</h2>
        <ul className="list-disc pl-5 text-sm sm:text-base text-muted-foreground space-y-1">
          <li>To run the service — show your activity, personalize your experience</li>
          <li>To power community features — public reviews, lists, tags, and rankings</li>
          <li>We do not sell or share your data with third parties for marketing. Ever.</li>
        </ul>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-base sm:text-lg font-medium">Third-party services</h2>
        <ul className="list-disc pl-5 text-sm sm:text-base text-muted-foreground space-y-1">
          <li>Google and Discord for authentication</li>
          <li>Google Translate for translating novel metadata — no user data is sent</li>
        </ul>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-base sm:text-lg font-medium">Cookies</h2>
        <p className="text-sm sm:text-base text-muted-foreground leading-relaxed">
          We use a single session cookie to keep you signed in (expires after 7 days). That&apos;s it.
          No analytics cookies, no tracking pixels, no third-party ad cookies.
        </p>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-base sm:text-lg font-medium">What&apos;s public vs private</h2>
        <ul className="list-disc pl-5 text-sm sm:text-base text-muted-foreground space-y-1">
          <li>Public: your username, avatar, reviews, public booklists, tags, and ratings</li>
          <li>Private: your email address and OAuth provider details</li>
        </ul>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-base sm:text-lg font-medium">Data retention and deletion</h2>
        <p className="text-sm sm:text-base text-muted-foreground leading-relaxed">
          Your data is kept as long as your account is active. If you want your account and data
          deleted, email us at{" "}
          <a href="mailto:daosearch@gmail.com" className="text-foreground hover:underline">
            daosearch@gmail.com
          </a>{" "}
          and we&apos;ll take care of it.
        </p>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-base sm:text-lg font-medium">Changes</h2>
        <p className="text-sm sm:text-base text-muted-foreground leading-relaxed">
          If we update this policy, we&apos;ll note it in our changelog. Continued use of the site
          after changes means you&apos;re okay with the updated policy.
        </p>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-base sm:text-lg font-medium">Contact</h2>
        <p className="text-sm sm:text-base text-muted-foreground leading-relaxed">
          Questions? Reach out at{" "}
          <a href="mailto:daosearch@gmail.com" className="text-foreground hover:underline">
            daosearch@gmail.com
          </a>
        </p>
      </section>
    </div>
  );
}
