interface StatsCardProps {
  title: string;
  value: number | string;
  isLoading?: boolean;
}

export function StatsCard({ title, value, isLoading = false }: StatsCardProps) {
  return (
    <div>
      <div className='text-3xl font-bold text-brand-600 mb-2'>
        {isLoading ? '...' : value}
      </div>
      <div className='text-white/80'>{title}</div>
    </div>
  );
}
