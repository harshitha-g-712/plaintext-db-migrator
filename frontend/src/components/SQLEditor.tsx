import React, { useEffect, useState } from 'react';
import Prism from 'prismjs';
import 'prismjs/components/prism-sql';
import { Copy, Check, Download, AlertCircle, CheckCircle2, AlertTriangle, ShieldCheck, RefreshCw } from 'lucide-react';
import type { SQLValidationResult } from '../types';

interface SQLEditorProps {
  sql: string;
  dialect: string;
  validationResult?: SQLValidationResult | null;
  onSqlChange?: (newSql: string) => void;
  onValidate?: () => void;
  isValidating?: boolean;
}

export const SQLEditor: React.FC<SQLEditorProps> = ({
  sql,
  dialect,
  validationResult,
  onSqlChange,
  onValidate,
  isValidating = false,
}) => {
  const [copied, setCopied] = useState(false);
  const [isEditable, setIsEditable] = useState(false);

  useEffect(() => {
    Prism.highlightAll();
  }, [sql, isEditable]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(sql);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  };

  const handleDownload = () => {
    const filename = `${dialect.toLowerCase()}_schema.sql`;
    const blob = new Blob([sql], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      {/* Editor Container */}
      <div className="rounded-xl border border-slate-700 bg-slate-900 overflow-hidden shadow-lg">
        {/* Top Header & Toolbar */}
        <div className="flex flex-wrap items-center justify-between px-4 py-2.5 bg-slate-800/90 border-b border-slate-700 text-xs">
          <div className="flex items-center gap-3">
            <span className="font-mono font-semibold text-slate-200 flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-indigo-400" />
              {dialect.toUpperCase()} DDL Preview
            </span>
            <span className="text-slate-400 font-mono">
              {sql.split('\n').length} lines
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setIsEditable(!isEditable)}
              className={`px-2.5 py-1 rounded text-2xs font-semibold transition-colors ${
                isEditable
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                  : 'bg-slate-700 text-slate-300 hover:text-white'
              }`}
            >
              {isEditable ? 'Editing Mode (Live)' : 'View Mode'}
            </button>

            {onValidate && (
              <button
                type="button"
                onClick={onValidate}
                disabled={isValidating}
                className="flex items-center gap-1 px-2.5 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded font-medium transition-colors disabled:opacity-50"
              >
                <RefreshCw className={`h-3 w-3 ${isValidating ? 'animate-spin' : ''}`} />
                <span>Validate with SQLGlot</span>
              </button>
            )}

            <button
              type="button"
              onClick={handleCopy}
              className="flex items-center gap-1 px-2.5 py-1 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded font-medium transition-colors"
            >
              {copied ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
              <span>{copied ? 'Copied' : 'Copy SQL'}</span>
            </button>

            <button
              type="button"
              onClick={handleDownload}
              className="flex items-center gap-1 px-2.5 py-1 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded font-medium transition-colors"
            >
              <Download className="h-3 w-3" />
              <span>Download .sql</span>
            </button>
          </div>
        </div>

        {/* Code Content */}
        <div className="p-4 overflow-x-auto max-h-[600px] font-mono text-xs text-slate-100">
          {isEditable ? (
            <textarea
              value={sql}
              onChange={(e) => onSqlChange && onSqlChange(e.target.value)}
              className="w-full h-[400px] bg-transparent text-slate-100 font-mono text-xs focus:outline-none resize-y leading-relaxed"
              spellCheck={false}
            />
          ) : (
            <pre className="!bg-transparent !p-0 !m-0 !overflow-visible">
              <code className="language-sql">{sql}</code>
            </pre>
          )}
        </div>
      </div>

      {/* Validation Status & SQLGlot Inspector */}
      {validationResult && (
        <div className="space-y-3">
          {/* Status Badge Banner */}
          <div
            className={`p-4 rounded-xl border flex items-center justify-between text-sm ${
              validationResult.is_valid
                ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                : 'bg-red-50 border-red-200 text-red-800'
            }`}
          >
            <div className="flex items-center gap-2.5">
              {validationResult.is_valid ? (
                <ShieldCheck className="h-5 w-5 text-emerald-600 flex-shrink-0" />
              ) : (
                <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0" />
              )}
              <div>
                <p className="font-bold">
                  {validationResult.is_valid
                    ? 'SQLGlot Validation Passed: Valid DDL & Relational Schema'
                    : 'SQL Validation Detected Issues'}
                </p>
                <p className="text-xs opacity-90 mt-0.5">
                  Dialect: {validationResult.dialect.toUpperCase()} • Statements analyzed: {validationResult.total_statements} • Tables: {validationResult.tables_validated.join(', ') || 'None'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 text-xs font-semibold">
              <span className={`px-2 py-0.5 rounded-full ${validationResult.syntax_valid ? 'bg-emerald-200/60 text-emerald-900' : 'bg-red-200/60 text-red-900'}`}>
                Syntax: {validationResult.syntax_valid ? 'OK' : 'ERROR'}
              </span>
              <span className={`px-2 py-0.5 rounded-full ${validationResult.design_valid ? 'bg-emerald-200/60 text-emerald-900' : 'bg-amber-200/60 text-amber-900'}`}>
                Integrity: {validationResult.design_valid ? 'OK' : 'DEFECTS'}
              </span>
            </div>
          </div>

          {/* Errors List */}
          {validationResult.errors.length > 0 && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-xl space-y-2 text-xs text-red-800">
              <p className="font-bold uppercase tracking-wider text-red-700 flex items-center gap-1.5">
                <AlertCircle className="h-4 w-4" /> Validation Errors ({validationResult.errors.length})
              </p>
              <div className="space-y-1.5 divide-y divide-red-100">
                {validationResult.errors.map((err, idx) => (
                  <div key={idx} className="pt-1.5 flex items-start justify-between">
                    <div>
                      <span className="font-semibold">{err.message}</span>
                      {err.table && <span className="ml-2 font-mono text-red-600 bg-red-100 px-1 py-0.5 rounded">Table: {err.table}</span>}
                      {err.column && <span className="ml-2 font-mono text-red-600 bg-red-100 px-1 py-0.5 rounded">Col: {err.column}</span>}
                    </div>
                    {err.line && <span className="text-red-500 font-mono">Line {err.line}</span>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Warnings List */}
          {validationResult.warnings.length > 0 && (
            <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl space-y-2 text-xs text-amber-800">
              <p className="font-bold uppercase tracking-wider text-amber-700 flex items-center gap-1.5">
                <AlertTriangle className="h-4 w-4" /> Dialect & Integrity Warnings ({validationResult.warnings.length})
              </p>
              <ul className="space-y-1 list-disc list-inside">
                {validationResult.warnings.map((warn, idx) => (
                  <li key={idx}>
                    <span>{warn.message}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Suggested Corrections */}
          {validationResult.suggested_corrections.length > 0 && (
            <div className="p-4 bg-indigo-50/70 border border-indigo-100 rounded-xl space-y-2 text-xs text-indigo-900">
              <p className="font-bold uppercase tracking-wider text-indigo-700 flex items-center gap-1.5">
                <CheckCircle2 className="h-4 w-4" /> Suggested Corrections ({validationResult.suggested_corrections.length})
              </p>
              <ul className="space-y-1 list-disc list-inside text-slate-700">
                {validationResult.suggested_corrections.map((corr, idx) => (
                  <li key={idx}>{corr}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
