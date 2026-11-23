interface AvatarProps {
  initials: string;
  color: string;
  size?: 'sm' | 'md' | 'lg';
  ring?: boolean;
}

const sizes = {
  sm: 'h-7 w-7 text-2xs',
  md: 'h-9 w-9 text-xs',
  lg: 'h-12 w-12 text-sm',
};

export function Avatar({ initials, color, size = 'md', ring = false }: AvatarProps) {
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white select-none ${sizes[size]} ${ring ? 'ring-2 ring-bg-subtle' : ''}`}
      style={{ backgroundColor: color }}
    >
      {initials}
    </span>
  );
}
