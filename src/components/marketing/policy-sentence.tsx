/** A sentence with a `{policy}` placeholder, the placeholder rendered as a link to the policy. */
export function PolicySentence({ text, href, link }: { text: string; href: string; link: string }) {
  const [before, after = ""] = text.split("{policy}");
  return (
    <>
      {before}
      <a href={href} className="underline decoration-gold underline-offset-4">
        {link}
      </a>
      {after}
    </>
  );
}
