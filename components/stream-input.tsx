'use client';
import { Radio } from 'lucide-react';

interface StreamInputProps {
  streamUrl: string;
}

export function StreamInput({ streamUrl }: StreamInputProps) {
  let displayUrl = 'No stream configured';
  if (streamUrl) {
    try {
      displayUrl = new URL(streamUrl).hostname;
    } catch {
      displayUrl = streamUrl;
    }
  }

  return (
    <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/40 px-4 py-2.5 text-sm">
      <Radio className="h-4 w-4 shrink-0 text-red-500 animate-pulse" />
      <span className="text-muted-foreground">Stream:</span>
      <span className="font-mono text-foreground truncate">{displayUrl}</span>
    </div>
  );
}