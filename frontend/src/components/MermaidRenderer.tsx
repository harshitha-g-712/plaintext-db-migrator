import React, { useEffect, useRef, useState } from 'react';
import mermaid from 'mermaid';
import { Copy, Check, Download, AlertTriangle } from 'lucide-react';

interface MermaidRendererProps {
  chart: string;
  className?: string;
}

export const MermaidRenderer: React.FC<MermaidRendererProps> = ({ chart, className = '' }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [svgContent, setSvgContent] = useState<string>('');
  const [renderError, setRenderError] = useState<string | null>(null);
  const [copied, setCopied] = useState<boolean>(false);

  useEffect(() => {
    mermaid.initialize({
      startOnLoad: false,
      theme: 'neutral',
      securityLevel: 'loose',
      fontFamily: 'ui-sans-serif, system-ui, sans-serif',
      er: {
        useMaxWidth: true,
        entityPadding: 15,
        stroke: '#4f46e5',
        fill: '#f8fafc',
        fontSize: 12,
      },
    });
  }, []);

  useEffect(() => {
    let isMounted = true;

    const renderChart = async () => {
      if (!chart || !chart.trim()) {
        setSvgContent('');
        setRenderError(null);
        return;
      }

      setRenderError(null);
      const uniqueId = `mermaid-er-${Math.random().toString(36).substring(2, 9)}`;

      try {
        const { svg } = await mermaid.render(uniqueId, chart.trim());
        if (isMounted) {
          setSvgContent(svg);
        }
      } catch (err: any) {
        if (isMounted) {
          setRenderError(err?.message || 'Failed to render Mermaid ER diagram syntax.');
        }
      }
    };

    renderChart();

    return () => {
      isMounted = false;
    };
  }, [chart]);

  const handleCopyCode = async () => {
    try {
      await navigator.clipboard.writeText(chart);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  };

  const handleDownloadSvg = () => {
    if (!svgContent) return;
    const blob = new Blob([svgContent], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'database-er-diagram.svg';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  if (renderError) {
    return (
      <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-800">
        <div className="flex items-center gap-2 font-semibold mb-1">
          <AlertTriangle className="h-4 w-4 text-amber-600" />
          <span>Diagram Rendering Notice</span>
        </div>
        <p className="text-xs mb-3 font-mono">{renderError}</p>
        <div className="bg-slate-900 text-slate-100 p-3 rounded-lg text-xs font-mono overflow-x-auto">
          <pre>{chart}</pre>
        </div>
      </div>
    );
  }

  return (
    <div className={`relative bg-slate-50/70 border border-slate-200 rounded-xl overflow-hidden ${className}`}>
      {/* Diagram Toolbar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-slate-200 bg-white text-xs">
        <span className="font-semibold text-slate-600 flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-indigo-500 animate-pulse" />
          Entity-Relationship Diagram (Interactive)
        </span>
        <div className="flex items-center gap-2">
          <button
            onClick={handleCopyCode}
            type="button"
            className="flex items-center gap-1 px-2.5 py-1 text-slate-600 hover:text-indigo-600 hover:bg-slate-100 rounded transition-colors"
            title="Copy Mermaid Code"
          >
            {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
            <span>{copied ? 'Copied' : 'Copy Mermaid'}</span>
          </button>
          <button
            onClick={handleDownloadSvg}
            disabled={!svgContent}
            type="button"
            className="flex items-center gap-1 px-2.5 py-1 text-slate-600 hover:text-indigo-600 hover:bg-slate-100 rounded transition-colors disabled:opacity-50"
            title="Download SVG"
          >
            <Download className="h-3.5 w-3.5" />
            <span>Download SVG</span>
          </button>
        </div>
      </div>

      {/* SVG Canvas */}
      <div
        ref={containerRef}
        className="p-6 overflow-x-auto flex justify-center items-center min-h-[300px]"
        dangerouslySetInnerHTML={{ __html: svgContent }}
      />
    </div>
  );
};
