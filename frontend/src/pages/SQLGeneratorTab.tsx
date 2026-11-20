import React, { useState, useEffect } from 'react';
import { sqlService } from '../services/sql.service';
import { schemaService } from '../services/schema.service';
import type { SchemaRecord, SQLValidationResult } from '../types';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { SQLEditor } from '../components/SQLEditor';
import {
  FileCode2,
  Database,
  Sparkles,
  AlertCircle,
  CheckCircle2,
  Settings2,
  ArrowRight,
} from 'lucide-react';

interface SQLGeneratorTabProps {
  projectId: string;
  onNavigateToSchema: () => void;
}

export const SQLGeneratorTab: React.FC<SQLGeneratorTabProps> = ({
  projectId,
  onNavigateToSchema,
}) => {
  const [schemaRecord, setSchemaRecord] = useState<SchemaRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [validating, setValidating] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // SQL State
  const [sqlContent, setSqlContent] = useState('');
  const [dialect, setDialect] = useState<'postgresql' | 'mysql'>('postgresql');
  const [validationResult, setValidationResult] = useState<SQLValidationResult | null>(null);

  // Generation options
  const [includeDb, setIncludeDb] = useState(true);
  const [includeDrop, setIncludeDrop] = useState(false);
  const [includeIdx, setIncludeIdx] = useState(true);

  useEffect(() => {
    loadSchema();
  }, [projectId]);

  const loadSchema = async () => {
    try {
      setLoading(true);
      const schemaData = await schemaService.getLatestByProject(projectId);
      if (schemaData) {
        setSchemaRecord(schemaData);
        const schemaDialect = (schemaData.database_dialect || 'postgresql').toLowerCase() as 'postgresql' | 'mysql';
        setDialect(schemaDialect);
        // Automatically generate initial SQL preview
        await generateSQL(schemaData.id, schemaDialect);
      }
    } catch (err: any) {
      setError(err?.response?.data?.detail || 'Failed to load project schema.');
    } finally {
      setLoading(false);
    }
  };

  const generateSQL = async (schemaId: string, targetDialect: string) => {
    setGenerating(true);
    setError('');
    setSuccessMsg('');

    try {
      const res = await sqlService.generate({
        schema_id: schemaId,
        database_dialect: targetDialect,
        include_database_creation: includeDb,
        include_drop_tables: includeDrop,
        include_indexes: includeIdx,
      });

      setSqlContent(res.generated_sql);
      setValidationResult(res.validation_result);
      setSuccessMsg(`SQL DDL successfully generated for ${targetDialect.toUpperCase()} and validated with SQLGlot!`);
    } catch (err: any) {
      setError(err?.response?.data?.detail || 'Failed to generate SQL.');
    } finally {
      setGenerating(false);
    }
  };

  const handleManualValidate = async () => {
    if (!sqlContent.trim()) return;

    setValidating(true);
    setError('');

    try {
      const result = await sqlService.validate({
        sql_content: sqlContent,
        database_dialect: dialect,
      });
      setValidationResult(result);
    } catch (err: any) {
      setError(err?.response?.data?.detail || 'Validation request failed.');
    } finally {
      setValidating(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <div className="animate-spin h-10 w-10 rounded-full border-4 border-indigo-600 border-t-transparent" />
      </div>
    );
  }

  if (!schemaRecord) {
    return (
      <Card className="text-center py-16">
        <Database className="h-12 w-12 text-slate-300 mx-auto mb-4" />
        <h3 className="text-lg font-bold text-slate-900">No Approved Schema Found</h3>
        <p className="text-sm text-slate-500 mt-1 mb-6 max-w-md mx-auto">
          Please design and review your relational database schema in Phase 3 before generating executable SQL scripts.
        </p>
        <Button onClick={onNavigateToSchema} className="gap-2 mx-auto">
          Go to Schema Designer <ArrowRight className="h-4 w-4" />
        </Button>
      </Card>
    );
  }

  return (
    <div className="space-y-6 pb-12">
      {/* Alerts */}
      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700 flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold">Notice</p>
            <p className="mt-0.5">{error}</p>
          </div>
        </div>
      )}

      {successMsg && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-sm text-emerald-700 flex items-center gap-3">
          <CheckCircle2 className="h-5 w-5 text-emerald-600 flex-shrink-0" />
          <p>{successMsg}</p>
        </div>
      )}

      {/* SQL Generator Control Banner */}
      <Card className="border-indigo-100 bg-gradient-to-r from-white via-indigo-50/10 to-white">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <FileCode2 className="h-5 w-5 text-indigo-600" />
              <h2 className="text-lg font-bold text-slate-900">SQL Generator & Validation Agent</h2>
            </div>
            <p className="text-sm text-slate-600 mt-1">
              Generates DDL scripts (CREATE DATABASE, CREATE TABLE, PRIMARY KEY, FOREIGN KEY, INDEX, CHECK)
              with real-time dialect validation via SQLGlot.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Dialect Switcher */}
            <div className="flex items-center bg-slate-100 p-1 rounded-lg border border-slate-200 text-xs font-semibold">
              <button
                type="button"
                onClick={() => {
                  setDialect('postgresql');
                  if (schemaRecord) generateSQL(schemaRecord.id, 'postgresql');
                }}
                className={`px-3 py-1.5 rounded-md transition-all ${
                  dialect === 'postgresql'
                    ? 'bg-white text-indigo-600 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                PostgreSQL
              </button>
              <button
                type="button"
                onClick={() => {
                  setDialect('mysql');
                  if (schemaRecord) generateSQL(schemaRecord.id, 'mysql');
                }}
                className={`px-3 py-1.5 rounded-md transition-all ${
                  dialect === 'mysql'
                    ? 'bg-white text-indigo-600 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                MySQL
              </button>
            </div>

            <Button
              type="button"
              onClick={() => schemaRecord && generateSQL(schemaRecord.id, dialect)}
              isLoading={generating}
              disabled={generating}
              className="gap-2"
            >
              <Sparkles className="h-4 w-4" />
              Regenerate SQL
            </Button>
          </div>
        </div>

        {/* Script Options Bar */}
        <div className="mt-4 pt-3 border-t border-slate-100 flex flex-wrap items-center gap-6 text-xs text-slate-600">
          <span className="font-semibold text-slate-700 flex items-center gap-1.5">
            <Settings2 className="h-3.5 w-3.5 text-slate-400" /> Options:
          </span>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={includeDb}
              onChange={(e) => setIncludeDb(e.target.checked)}
              className="rounded text-indigo-600 focus:ring-indigo-500 h-3.5 w-3.5"
            />
            <span>Include CREATE DATABASE</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={includeDrop}
              onChange={(e) => setIncludeDrop(e.target.checked)}
              className="rounded text-indigo-600 focus:ring-indigo-500 h-3.5 w-3.5"
            />
            <span>Include DROP TABLE IF EXISTS</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={includeIdx}
              onChange={(e) => setIncludeIdx(e.target.checked)}
              className="rounded text-indigo-600 focus:ring-indigo-500 h-3.5 w-3.5"
            />
            <span>Include Performance Indexes</span>
          </label>
        </div>
      </Card>

      {/* SQL Editor & Live SQLGlot Validation */}
      {sqlContent && (
        <SQLEditor
          sql={sqlContent}
          dialect={dialect}
          validationResult={validationResult}
          onSqlChange={(newSql) => setSqlContent(newSql)}
          onValidate={handleManualValidate}
          isValidating={validating}
        />
      )}
    </div>
  );
};
