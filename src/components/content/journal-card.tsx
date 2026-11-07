import { ResponsiveImage } from "@/components/media/responsive-image";
import { Link } from "@/i18n/navigation";
import { formatDate } from "@/lib/dates";
import type { JournalCard as JournalCardData } from "@/modules/content/public/content-public.mapping";

type Props = { post: JournalCardData; locale: "vi" | "en"; headingLevel?: 2 | 3; priority?: boolean };

/** One article: cover (3:2), topic and date, title and excerpt; the whole card is one link. */
export function JournalCard({ post, locale, headingLevel = 2, priority = false }: Props) {
  const Title = `h${headingLevel}` as const;
  return (
    <Link
      href={{ pathname: "/journal/[slug]", params: { slug: post.slug } }}
      className="group flex flex-col gap-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-4 focus-visible:ring-offset-background"
    >
      <div className="relative aspect-[3/2] overflow-hidden bg-muted">
        <ResponsiveImage image={post.image} sizes="(min-width: 1024px) 400px, (min-width: 640px) 50vw, 100vw" priority={priority} zoomOnHover />
      </div>
      <div className="flex flex-col gap-2">
        <p className="text-eyebrow font-semibold uppercase text-muted-foreground">
          {[post.topic?.name, post.publishedAt ? formatDate(post.publishedAt, locale) : null].filter(Boolean).join(" · ")}
        </p>
        <Title className="text-balance font-serif text-h3 font-medium md:text-h3-lg">{post.title}</Title>
        {post.excerpt && <p className="line-clamp-3 text-body text-muted-foreground">{post.excerpt}</p>}
      </div>
    </Link>
  );
}
