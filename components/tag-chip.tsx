export default function TagChip({ name, color }: { name: string; color: string }) {
  return (
    <span className="rounded-full px-2 py-0.5 text-xs text-white" style={{ backgroundColor: color }}>
      {name}
    </span>
  );
}
