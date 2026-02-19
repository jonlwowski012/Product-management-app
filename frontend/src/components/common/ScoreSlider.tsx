interface ScoreSliderProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
}

export default function ScoreSlider({ label, value, onChange, min = 1, max = 10 }: ScoreSliderProps) {
  const percentage = ((value - min) / (max - min)) * 100;
  const color =
    percentage > 66 ? 'text-green-600' : percentage > 33 ? 'text-yellow-600' : 'text-red-600';

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <label className="label mb-0">{label}</label>
        <span className={`text-lg font-bold ${color}`}>{value}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(parseInt(e.target.value))}
        className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-primary-600"
      />
      <div className="flex justify-between text-xs text-gray-400 mt-0.5">
        <span>{min}</span>
        <span>{max}</span>
      </div>
    </div>
  );
}
