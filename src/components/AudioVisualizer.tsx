import React, { useEffect, useRef } from 'react';
import { atmosphericEngine } from '../utils/ambientEngine';

interface AudioVisualizerProps {
  isPlaying: boolean;
  className?: string;
}

export const AudioVisualizer: React.FC<AudioVisualizerProps> = ({ isPlaying, className = '' }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const animationFrameId = useRef<number | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Responsive Canvas Resizing via ResizeObserver
    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) {
          const dpr = window.devicePixelRatio || 1;
          canvas.width = width * dpr;
          canvas.height = height * dpr;
          ctx.scale(dpr, dpr);
        }
      }
    });

    resizeObserver.observe(container);

    // Frequency data buffer
    const bufferLength = 64;
    const dataArray = new Uint8Array(bufferLength);

    let phase = 0;

    const render = () => {
      const width = container.clientWidth;
      const height = container.clientHeight;

      ctx.clearRect(0, 0, width, height);

      // Draw subtle background grid line
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.04)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, height / 2);
      ctx.lineTo(width, height / 2);
      ctx.stroke();

      if (atmosphericEngine.analyser && isPlaying) {
        atmosphericEngine.analyser.getByteFrequencyData(dataArray);
      } else {
        // Idle breathing wave
        for (let i = 0; i < bufferLength; i++) {
          dataArray[i] = Math.sin(phase + i * 0.15) * 8 + 12;
        }
      }

      phase += 0.04;

      const barWidth = (width / bufferLength) * 1.5;
      let x = 0;

      for (let i = 0; i < bufferLength; i++) {
        const barHeight = (dataArray[i] / 255) * (height * 0.85);

        // Gradient from vivid Frosted Glass accent #ff4e00 to warm nocturnal reflection
        const gradient = ctx.createLinearGradient(0, height / 2 - barHeight / 2, 0, height / 2 + barHeight / 2);
        gradient.addColorStop(0, 'rgba(255, 78, 0, 0.85)'); // Accent #ff4e00
        gradient.addColorStop(0.5, 'rgba(255, 140, 0, 0.5)'); // Warm Ember
        gradient.addColorStop(1, 'rgba(26, 26, 46, 0.2)');

        ctx.fillStyle = gradient;

        // Mirrored vertical wave around center with rounded pill caps
        const yTop = height / 2 - barHeight / 2;
        ctx.beginPath();
        ctx.roundRect(x, yTop, Math.max(2.5, barWidth - 2), Math.max(2.5, barHeight), 2);
        ctx.fill();

        x += barWidth;
        if (x > width) break;
      }

      animationFrameId.current = requestAnimationFrame(render);
    };

    render();

    return () => {
      resizeObserver.disconnect();
      if (animationFrameId.current) {
        cancelAnimationFrame(animationFrameId.current);
      }
    };
  }, [isPlaying]);

  return (
    <div
      ref={containerRef}
      id="audio-visualizer-container"
      className={`relative w-full h-12 overflow-hidden rounded-xl bg-white/[0.03] backdrop-blur-md border border-white/10 ${className}`}
    >
      <canvas ref={canvasRef} className="w-full h-full block" />
      <div className="absolute inset-0 pointer-events-none bg-gradient-to-r from-[#050505]/40 via-transparent to-[#050505]/40" />
    </div>
  );
};
