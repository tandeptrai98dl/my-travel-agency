import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Coming soon",
  description: "Our new website is being prepared.",
  robots: { index: false, follow: false },
};

// Temporary placeholder until the public website is built in Phase 3.
export default function HomePage() {
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="max-w-xl text-center">
        <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
          Coming soon
        </p>
        <h1 className="mt-4 text-4xl font-medium md:text-5xl">
          Our new website is on its way
        </h1>
      </div>
    </main>
  );
}
