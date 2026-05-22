import { LucideIcon } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";

interface EmptyStateProps {
  title: string;
  description: string;
  icon: LucideIcon;
  actionLabel?: string;
  actionHref?: string;
  actionOnClick?: () => void;
}

export function EmptyState({ 
  title, 
  description, 
  icon: Icon, 
  actionLabel, 
  actionHref, 
  actionOnClick 
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center text-center p-8 border border-dashed rounded-xl bg-card/50 max-w-md w-full mx-auto">
      <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-4">
        <Icon className="w-6 h-6 text-primary" />
      </div>
      <h3 className="text-lg font-semibold tracking-tight">{title}</h3>
      <p className="text-sm text-muted-foreground mt-2 mb-6 max-w-sm">
        {description}
      </p>
      
      {actionLabel && actionHref && (
        <Button asChild>
          <Link href={actionHref}>{actionLabel}</Link>
        </Button>
      )}
      
      {actionLabel && actionOnClick && !actionHref && (
        <Button onClick={actionOnClick}>
          {actionLabel}
        </Button>
      )}
    </div>
  );
}
