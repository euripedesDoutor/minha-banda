import React from 'react';

interface KnobProps {
    value: number;
    min: number;
    max: number;
    label: string;
    onChange: (val: number) => void;
    unit?: string;
}

export const Knob: React.FC<KnobProps> = ({ value, min, max, label, onChange, unit }) => {
    return (
        <div className="flex flex-col items-center gap-2">
            <span className="text-studio-300 text-xs font-mono uppercase tracking-widest">{label}</span>
            <input 
                type="range"
                min={min}
                max={max}
                step={0.01}
                value={value}
                onChange={(e) => onChange(parseFloat(e.target.value))}
                className="w-32 accent-neon-blue"
            />
            <span className="text-white font-bold font-mono text-sm">
                {value > 0 && '+'}{value}{unit}
            </span>
        </div>
    );
};