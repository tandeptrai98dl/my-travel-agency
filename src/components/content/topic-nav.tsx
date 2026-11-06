import { Link } from "@/i18n/navigation";
import { cx } from "@/lib/cx";
import type { Topic } from "@/modules/content/public/content-public.mapping";

type Props = { topics: Topic[]; current?: string; label: string; allLabel: string };

const itemClass =
  "inline-flex min-h-11 items-center rounded-md border px-4 text-small font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";

/** Journal topics as links; the current one is marked. */
export function TopicNav({ topics, current, label, allLabel }: Props) {
  if (topics.length === 0) return null;
  return (
    <nav aria-label={label}>
      <ul className="flex flex-wrap gap-3">
        <li>
          <Link href="/journal" aria-current={current ? undefined : "page"} className={cx(itemClass, current ? "border-input hover:border-foreground" : "border-foreground bg-primary text-primary-foreground")}>
            {allLabel}
          </Link>
        </li>
        {topics.map((topic) => (
          <li key={topic.id}>
            <Link
              href={{ pathname: "/journal/topics/[slug]", params: { slug: topic.slug } }}
              aria-current={current === topic.slug ? "page" : undefined}
              className={cx(itemClass, current === topic.slug ? "border-foreground bg-primary text-primary-foreground" : "border-input hover:border-foreground")}
            >
              {topic.name}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
