import React, { useEffect, useRef } from 'react';

interface VisualizerProps {
  analyser: AnalyserNode | null;
  isPlaying: boolean;
}

export const Visualizer: React.FC<VisualizerProps> = ({ analyser, isPlaying }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!analyser || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    let animationId: number;

    const draw = () => {
      animationId = requestAnimationFrame(draw);

      analyser.getByteFrequencyData(dataArray);

      // Clear with transparency for trail effect
      ctx.fillStyle = 'rgba(15, 11, 30, 0.3)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      const barWidth = (canvas.width / bufferLength) * 2.5;
      let barHeight;
      let x = 0;

      for (let i = 0; i < bufferLength; i++) {
        barHeight = dataArray[i];

        // Gradient color based on height
        const r = barHeight + (25 * (i/bufferLength));
        const g = 250 * (i/bufferLength);
        const b = 255;

        ctx.fillStyle = `rgb(${r},${g},${b})`;
        // Center the visualization
        const y = canvas.height - (barHeight / 255) * canvas.height;
        
        ctx.fillRect(x, y, barWidth, canvas.height - y);

        x += barWidth + 1;
      }
    };

    if (isPlaying) {
        draw();
    } else {
        // Clear immediately if stopped
         ctx.fillStyle = '#0f0b1e';
         ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    return () => {
      cancelAnimationFrame(animationId);
    };
  }, [analyser, isPlaying]);

  return (
    <canvas 
      ref={canvasRef} 
      width={800} 
      height={200} 
      className="w-full h-48 rounded-xl bg-studio-900 border border-studio-700 shadow-[0_0_20px_rgba(0,255,255,0.1)]"
    />
  );
};