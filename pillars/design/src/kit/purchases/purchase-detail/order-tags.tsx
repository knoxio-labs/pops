/** Every tag carried anywhere on the order, deduplicated by the pillar before this. */
export function OrderTags({ tags }: { tags: string[] }) {
  if (tags.length === 0) {
    return <p className="text-sm text-muted-foreground">No line on this order carries a tag.</p>;
  }

  return (
    <ul aria-label="Tags across this order" className="flex flex-wrap gap-1">
      {tags.map((tag) => (
        <li key={tag} className="rounded bg-muted px-2 py-0.5 text-xs">
          {tag}
        </li>
      ))}
    </ul>
  );
}
