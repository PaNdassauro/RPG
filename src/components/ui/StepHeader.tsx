interface StepHeaderProps {
  eyebrow?: string;
  title: string;
  description?: string;
}

export function StepHeader({ eyebrow, title, description }: StepHeaderProps) {
  return (
    <header className="mb-8">
      {eyebrow && (
        <p className="font-display text-xs uppercase tracking-[0.4em] text-accent-muted">
          {eyebrow}
        </p>
      )}
      <h2 className="mt-2 font-display text-3xl text-text">{title}</h2>
      {description && (
        <p className="mt-3 max-w-2xl text-sm text-text-muted">{description}</p>
      )}
    </header>
  );
}
