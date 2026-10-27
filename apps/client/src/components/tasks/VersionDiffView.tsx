interface VersionDiffViewProps {
  left: { label: string; content: string };
  right: { label: string; content: string };
}

export function VersionDiffView({ left, right }: VersionDiffViewProps) {
  return (
    <div className="grid grid-cols-2 gap-4">
      <div>
        <div className="text-sm font-medium mb-2 text-muted-foreground">{left.label}</div>
        <pre className="p-3 rounded-md bg-muted text-sm whitespace-pre-wrap max-h-[400px] overflow-auto font-mono">
          {left.content || "(empty)"}
        </pre>
      </div>
      <div>
        <div className="text-sm font-medium mb-2 text-muted-foreground">{right.label}</div>
        <pre className="p-3 rounded-md bg-muted text-sm whitespace-pre-wrap max-h-[400px] overflow-auto font-mono">
          {right.content || "(empty)"}
        </pre>
      </div>
    </div>
  );
}
