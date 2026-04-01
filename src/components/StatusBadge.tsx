interface StatusBadgeProps {
  status: string;
}

const colorMap: Record<string, { bg: string; text: string }> = {
  in_stock: { bg: 'bg-[#22c55e]/15', text: 'text-[#22c55e]' },
  coming_soon: { bg: 'bg-[#eab308]/15', text: 'text-[#eab308]' },
  sold_out: { bg: 'bg-[#ef4444]/15', text: 'text-[#ef4444]' },
  unknown: { bg: 'bg-[#888888]/15', text: 'text-[#888888]' },
  blocked: { bg: 'bg-[#ff6b35]/15', text: 'text-[#ff6b35]' },
  monitoring: { bg: 'bg-[#3B9EFF]/15', text: 'text-[#3B9EFF]' },
  paused: { bg: 'bg-[#eab308]/15', text: 'text-[#eab308]' },
  found: { bg: 'bg-[#22c55e]/15', text: 'text-[#22c55e]' },
};

export default function StatusBadge({ status }: StatusBadgeProps) {
  const colors = colorMap[status] || colorMap.unknown;
  const label = status.replace(/_/g, ' ');

  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium capitalize ${colors.bg} ${colors.text}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full mr-1.5 ${colors.text === 'text-[#22c55e]' ? 'bg-[#22c55e]' : colors.text === 'text-[#3B9EFF]' ? 'bg-[#3B9EFF]' : colors.text === 'text-[#eab308]' ? 'bg-[#eab308]' : colors.text === 'text-[#ef4444]' ? 'bg-[#ef4444]' : colors.text === 'text-[#ff6b35]' ? 'bg-[#ff6b35]' : 'bg-[#888888]'}`} />
      {label}
    </span>
  );
}
