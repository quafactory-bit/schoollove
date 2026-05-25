import { ReactNode } from 'react';

type StatCardProps = {
  label: string;
  value: number;
  unit: string;
  icon: ReactNode;
  iconBgClass: string;
  iconColorClass: string;
};

export function StatCard({
  label,
  value,
  unit,
  icon,
  iconBgClass,
  iconColorClass,
}: StatCardProps) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-5 flex items-center gap-4">
      <div
        className={`flex-shrink-0 w-12 h-12 rounded-full flex items-center justify-center ${iconBgClass}`}
      >
        <div className={`w-6 h-6 ${iconColorClass}`}>{icon}</div>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-gray-600">{label}</p>
        <p className="text-2xl font-bold text-black mt-1">
          {value.toLocaleString('ko-KR')}
          <span className="text-base font-normal text-gray-500 ml-1">
            {unit}
          </span>
        </p>
      </div>
    </div>
  );
}
