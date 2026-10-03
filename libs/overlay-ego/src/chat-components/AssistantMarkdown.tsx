import Markdown from 'react-markdown';

interface AssistantMarkdownProps {
  children: string;
}

/** Renders assistant prose with the shared chat markdown styling. */
export function AssistantMarkdown({ children }: AssistantMarkdownProps) {
  return (
    <div className="prose prose-sm prose-invert max-w-none text-sm [&_p]:my-1 [&_ul]:my-1 [&_ol]:my-1 [&_pre]:my-2 [&_code]:text-xs">
      <Markdown>{children}</Markdown>
    </div>
  );
}
