
import React, { useMemo } from 'react';
import { VitalSign } from '../types';

interface VitalsGraphProps {
  vital: VitalSign;
}

const Sparkline: React.FC<{ data: number[], width: number, height: number, color: string }> = ({ data, width, height, color }) => {
  if (data.length < 2) {
    return (
        <div className="flex items-center justify-center w-full h-full text-xs text-gray-500">
            Not enough data to display graph
        </div>
    );
  }

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min === 0 ? 1 : max - min;
  const paddingY = 5; // Add vertical padding to avoid clipping
  const effectiveHeight = height - (2 * paddingY);

  const points = data.map((d, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = paddingY + (effectiveHeight - ((d - min) / range) * effectiveHeight);
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  }).join(' ');

  return (
    <svg width="100%" height="100%" viewBox={`0 0 ${width} ${height}`}>
      <polyline
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={points}
      />
    </svg>
  );
};

const VitalsGraph: React.FC<VitalsGraphProps> = ({ vital }) => {
  const stats = useMemo(() => {
    if (!vital.data || vital.data.length === 0) {
      return { latest: 'N/A', avg: 'N/A', min: 'N/A', max: 'N/A', values: [] };
    }
    const values = vital.data.map(d => d.value);
    const latest = values[values.length - 1];
    const sum = values.reduce((acc, val) => acc + val, 0);
    const avg = sum / values.length;
    const min = Math.min(...values);
    const max = Math.max(...values);
    const isFloat = vital.unit === '°F';
    
    return {
      latest: latest.toFixed(isFloat ? 1 : 0),
      avg: avg.toFixed(isFloat ? 1 : 0),
      min: min.toFixed(isFloat ? 1 : 0),
      max: max.toFixed(isFloat ? 1 : 0),
      values,
    };
  }, [vital]);

  const { vitalColor, sparklineColorHex } = useMemo(() => {
    let colorClass = 'text-gray-300';
    let hex = '#d1d5db'; // gray-300

    if (vital.name.includes('BP')) {
        colorClass = 'text-blue-400'; hex = '#60a5fa';
    } else if (vital.name === 'Heart Rate') {
        colorClass = 'text-red-400'; hex = '#f87171';
    } else if (vital.name === 'Respiratory Rate') {
        colorClass = 'text-cyan-400'; hex = '#22d3ee';
    } else if (vital.name === 'SPO2') {
        colorClass = 'text-purple-400'; hex = '#c084fc';
    } else if (vital.name === 'Temperature') {
        colorClass = 'text-orange-400'; hex = '#fb923c';
    }
    return { vitalColor: colorClass, sparklineColorHex: hex };
  }, [vital.name]);


  return (
    <div className="bg-gray-900/50 p-4 rounded-lg flex flex-col space-y-3 ring-1 ring-white/5">
      <div className="flex justify-between items-baseline">
        <h4 className="font-semibold text-gray-300">{vital.name}</h4>
        <div className="flex items-baseline space-x-1">
          <span className={`text-2xl font-bold ${vitalColor}`}>{stats.latest}</span>
          <span className="text-sm text-gray-400">{vital.unit}</span>
        </div>
      </div>
      
      <div className="w-full h-20">
        <Sparkline data={stats.values} width={300} height={80} color={sparklineColorHex} />
      </div>

      <div className="grid grid-cols-3 gap-2 text-center text-sm pt-3 border-t border-white/10">
        <div>
          <div className="text-gray-400 text-xs uppercase tracking-wider">Min</div>
          <div className="font-semibold text-gray-200 mt-1">{stats.min}</div>
        </div>
        <div>
          <div className="text-gray-400 text-xs uppercase tracking-wider">Avg</div>
          <div className="font-semibold text-gray-200 mt-1">{stats.avg}</div>
        </div>
        <div>
          <div className="text-gray-400 text-xs uppercase tracking-wider">Max</div>
          <div className="font-semibold text-gray-200 mt-1">{stats.max}</div>
        </div>
      </div>
    </div>
  );
};

export default VitalsGraph;
