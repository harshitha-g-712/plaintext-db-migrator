import React, { useState, useEffect } from 'react';
import { migrationService } from '../services/migration.service';
import { schemaService } from '../services/schema.service';
import type { SchemaRecord, MigrationRecord, SchemaDiffReport } from '../types';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { SQLEditor } from '../components/SQLEditor';
import {
  GitBranch,
  Database,
  ArrowRight,
  AlertTriangle,
  ShieldAlert,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  Play,
  RotateCcw,
  History,
  Layers,
} from 'lucide-react';

interface MigrationTabProps {
  projectId: string;
  onNavigateToSchema: () => void;
}

export const MigrationTab: React.FC<MigrationTabProps> = ({
  projectId,
  onNavigateToSchema,
}) => {
  const [schemas, setSchemas] = useState<SchemaRecord[]>([]);
  const [activeSchema, setActiveSchema] = useState<SchemaRecord | null>(null);
  const [selectedSourceId, setSelectedSourceId] = useState<string>('none');

  const [loading, setLoading] = useState(true);
  const [comparing, setComparing] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [rollingBack, setRollingBack] = useState(false);

  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Active migration & diff
  const [activeMigration, setActiveMigration] = useState<MigrationRecord | null>(null);
  const [diffReport, setDiffReport] = useState<SchemaDiffReport | null>(null);
  const [migrationsList, setMigrationsList] = useState<MigrationRecord[]>([]);

  // Confirmation for destructive
  const [destructiveConfirmed, setDestructiveConfirmed] = useState(false);
  const [activeSqlTab, setActiveSqlTab] = useState<'migration' | 'rollback'>('migration');

  useEffect(() => {
    loadProjectData();
  }, [projectId]);

  const loadProjectData = async () => {
    try {
      setLoading(true);
      const latestSchema = await schemaService.getLatestByProject(projectId);
      if (latestSchema) {
        setActiveSchema(latestSchema);
        setSchemas([latestSchema]); // Latest active
      }

      const migs = await migrationService.listByProject(projectId);
      setMigrationsList(migs);
      if (migs.length > 0) {
        setActiveMigration(migs[0]);
        setDiffReport(migs[0].detected_diff);
      }
    } catch (err: any) {
      setError(err?.response?.data?.detail || 'Failed to load migration data.');
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateMigration = async () => {
    if (!activeSchema) return;

    setComparing(true);
    setError('');
    setSuccessMsg('');
    setDestructiveConfirmed(false);

    try {
      const sourceId = selectedSourceId === 'none' ? null : selectedSourceId;
      const res = await migrationService.generate({
        project_id: projectId,
        target_schema_id: activeSchema.id,
        source_schema_id: sourceId,
        database_dialect: activeSchema.database_dialect || 'postgresql',
      });

      setActiveMigration(res);
      setDiffReport(res.detected_diff);
      setMigrationsList([res, ...migrationsList.filter((m) => m.id !== res.id)]);
      setSuccessMsg('Schema comparison completed and migration script generated!');
    } catch (err: any) {
      setError(err?.response?.data?.detail || 'Failed to generate migration.');
    } finally {
      setComparing(false);
    }
  };

  const handleExecuteMigration = async () => {
    if (!activeMigration) return;

    if (activeMigration.risk_level === 'DESTRUCTIVE' && !destructiveConfirmed) {
      setError('Explicit confirmation required: Please acknowledge the data loss risk before proceeding.');
      return;
    }

    setExecuting(true);
    setError('');
    setSuccessMsg('');

    try {
      const updated = await migrationService.execute(activeMigration.id, {
        force_destructive: destructiveConfirmed,
      });
      setActiveMigration(updated);
      setMigrationsList(migrationsList.map((m) => (m.id === updated.id ? updated : m)));
      setSuccessMsg(`Migration successfully executed! Schema version recorded in history.`);
    } catch (err: any) {
      setError(err?.response?.data?.detail || 'Migration execution failed.');
    } finally {
      setExecuting(false);
    }
  };

  const handleRollback = async () => {
    if (!activeMigration) return;
    if (!confirm('Are you sure you want to rollback this migration? Reversible changes will be reverted.')) return;

    setRollingBack(true);
    setError('');
    setSuccessMsg('');

    try {
      const updated = await migrationService.rollback(activeMigration.id);
      setActiveMigration(updated);
      setMigrationsList(migrationsList.map((m) => (m.id === updated.id ? updated : m)));
      setSuccessMsg('Migration rolled back successfully. Status recorded in audit history.');
    } catch (err: any) {
      setError(err?.response?.data?.detail || 'Rollback failed.');
    } finally {
      setRollingBack(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <div className="animate-spin h-10 w-10 rounded-full border-4 border-indigo-600 border-t-transparent" />
      </div>
    );
  }

  if (!activeSchema) {
    return (
      <Card className="text-center py-16">
        <Database className="h-12 w-12 text-slate-300 mx-auto mb-4" />
        <h3 className="text-lg font-bold text-slate-900">No Target Schema Available</h3>
        <p className="text-sm text-slate-500 mt-1 mb-6 max-w-md mx-auto">
          Please generate an approved database schema in Phase 3 first to create migrations.
        </p>
        <Button onClick={onNavigateToSchema} className="gap-2 mx-auto">
          Go to Schema Designer <ArrowRight className="h-4 w-4" />
        </Button>
      </Card>
    );
  }

  return (
    <div className="space-y-8 pb-12">
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

      {/* Migration Generator Card */}
      <Card className="border-indigo-100 bg-gradient-to-r from-white via-indigo-50/10 to-white">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <GitBranch className="h-5 w-5 text-indigo-600" />
              <h2 className="text-lg font-bold text-slate-900">Migration Generator & Version Control</h2>
            </div>
            <p className="text-sm text-slate-600 mt-1">
              Compares existing database state with the proposed schema, evaluates data loss risks,
              and generates safe migration and reversible rollback scripts.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Source Schema Selector */}
            <div className="flex items-center gap-2 bg-white border border-slate-300 rounded-lg px-3 py-1.5 shadow-2xs text-xs">
              <span className="font-medium text-slate-500">Source:</span>
              <select
                value={selectedSourceId}
                onChange={(e) => setSelectedSourceId(e.target.value)}
                className="font-semibold text-slate-800 bg-transparent focus:outline-none cursor-pointer"
              >
                <option value="none">None (Fresh Baseline)</option>
                {schemas.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.schema_name} (v{s.version})
                  </option>
                ))}
              </select>
            </div>

            <Button
              type="button"
              onClick={handleGenerateMigration}
              isLoading={comparing}
              disabled={comparing}
              className="gap-2"
            >
              <GitBranch className="h-4 w-4" />
              Compare & Generate Migration
            </Button>
          </div>
        </div>
      </Card>

      {/* Diff & Risk Assessment Panel */}
      {diffReport && (
        <div className="space-y-6">
          {/* Risk Level Banner */}
          <div
            className={`p-5 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${
              diffReport.risk_level === 'DESTRUCTIVE'
                ? 'bg-red-50 border-red-300 text-red-900'
                : diffReport.risk_level === 'HIGH' || diffReport.risk_level === 'MEDIUM'
                ? 'bg-amber-50 border-amber-300 text-amber-900'
                : 'bg-emerald-50 border-emerald-300 text-emerald-900'
            }`}
          >
            <div className="flex items-start gap-3">
              {diffReport.risk_level === 'DESTRUCTIVE' ? (
                <ShieldAlert className="h-6 w-6 text-red-600 flex-shrink-0 mt-0.5" />
              ) : diffReport.risk_level === 'HIGH' || diffReport.risk_level === 'MEDIUM' ? (
                <AlertTriangle className="h-6 w-6 text-amber-600 flex-shrink-0 mt-0.5" />
              ) : (
                <ShieldCheck className="h-6 w-6 text-emerald-600 flex-shrink-0 mt-0.5" />
              )}
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-bold text-base">
                    Risk Assessment: {diffReport.risk_level}
                  </h3>
                  <span className={`text-2xs font-extrabold uppercase px-2 py-0.5 rounded-full ${
                    diffReport.risk_level === 'DESTRUCTIVE' ? 'bg-red-200 text-red-800' :
                    diffReport.risk_level === 'HIGH' ? 'bg-amber-200 text-amber-800' :
                    'bg-emerald-200 text-emerald-800'
                  }`}>
                    {diffReport.differences.length} Change(s)
                  </span>
                </div>
                <p className="text-xs opacity-90 mt-1">
                  {diffReport.risk_level === 'DESTRUCTIVE'
                    ? 'Destructive operations detected (dropped tables or columns). Human approval is mandatory.'
                    : 'Non-destructive operations: changes can be safely applied.'}
                </p>
              </div>
            </div>

            {/* Execution Status Badge */}
            {activeMigration && (
              <div className="flex items-center gap-2">
                <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${
                  activeMigration.status === 'EXECUTED' ? 'bg-emerald-600 text-white' :
                  activeMigration.status === 'ROLLED_BACK' ? 'bg-slate-700 text-white' :
                  'bg-amber-500 text-white'
                }`}>
                  Status: {activeMigration.status}
                </span>
              </div>
            )}
          </div>

          {/* Data Loss Warnings Card */}
          {diffReport.data_loss_warnings.length > 0 && (
            <div className="p-4 bg-red-100/80 border border-red-300 rounded-xl space-y-2 text-xs text-red-900">
              <p className="font-bold uppercase tracking-wider flex items-center gap-1.5 text-red-800">
                <AlertTriangle className="h-4 w-4" /> Data Loss & Destructive Warnings ({diffReport.data_loss_warnings.length})
              </p>
              <ul className="space-y-1 list-disc list-inside">
                {diffReport.data_loss_warnings.map((w, idx) => (
                  <li key={idx} className="font-medium">{w}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Detected Schema Differences Summary */}
          <Card>
            <h3 className="font-bold text-slate-900 text-base mb-3 flex items-center gap-2">
              <Layers className="h-4 w-4 text-indigo-600" />
              Detected Schema Differences ({diffReport.differences.length})
            </h3>

            {diffReport.differences.length === 0 ? (
              <p className="text-sm text-slate-400 italic">No schema differences detected between existing and proposed versions.</p>
            ) : (
              <div className="divide-y divide-slate-100 text-xs">
                {diffReport.differences.map((diff, idx) => (
                  <div key={idx} className="py-2.5 flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <span className={`px-2 py-0.5 rounded font-mono font-bold text-2xs ${
                        diff.change_type.includes('DROPPED') ? 'bg-red-100 text-red-700' :
                        diff.change_type.includes('ADDED') ? 'bg-emerald-100 text-emerald-700' :
                        'bg-blue-100 text-blue-700'
                      }`}>
                        {diff.change_type}
                      </span>
                      <span className="font-mono font-semibold text-slate-800">{diff.table_name}</span>
                      <span className="text-slate-600">{diff.details}</span>
                    </div>

                    {diff.is_destructive && (
                      <span className="text-2xs font-extrabold uppercase px-1.5 py-0.5 rounded bg-red-200 text-red-900">
                        DESTRUCTIVE
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* Migration & Rollback Scripts Preview */}
          {activeMigration && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                {/* Switcher between Migration SQL and Rollback SQL */}
                <div className="flex items-center bg-slate-100 p-1 rounded-lg border border-slate-200 text-xs font-semibold">
                  <button
                    type="button"
                    onClick={() => setActiveSqlTab('migration')}
                    className={`px-3 py-1.5 rounded-md transition-all ${
                      activeSqlTab === 'migration'
                        ? 'bg-white text-indigo-600 shadow-2xs font-bold'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Migration SQL (Forward)
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveSqlTab('rollback')}
                    className={`px-3 py-1.5 rounded-md transition-all ${
                      activeSqlTab === 'rollback'
                        ? 'bg-white text-indigo-600 shadow-2xs font-bold'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Rollback SQL (Reversible)
                  </button>
                </div>

                {/* Execution Controls */}
                <div className="flex items-center gap-3">
                  {activeMigration.status === 'EXECUTED' ? (
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={handleRollback}
                      isLoading={rollingBack}
                      className="gap-1.5 text-xs text-amber-700 hover:bg-amber-50 border-amber-300"
                    >
                      <RotateCcw className="h-3.5 w-3.5" /> Rollback Migration
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      onClick={handleExecuteMigration}
                      isLoading={executing}
                      disabled={activeMigration.risk_level === 'DESTRUCTIVE' && !destructiveConfirmed}
                      className="gap-1.5 text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
                    >
                      <Play className="h-3.5 w-3.5" /> Approve & Execute Migration
                    </Button>
                  )}
                </div>
              </div>

              {/* Destructive Warning Confirmation Checkbox */}
              {activeMigration.status !== 'EXECUTED' && activeMigration.risk_level === 'DESTRUCTIVE' && (
                <div className="p-3 bg-red-50 border border-red-300 rounded-lg flex items-center gap-2 text-xs text-red-900 font-medium">
                  <input
                    type="checkbox"
                    id="confirm-destructive"
                    checked={destructiveConfirmed}
                    onChange={(e) => setDestructiveConfirmed(e.target.checked)}
                    className="rounded text-red-600 focus:ring-red-500 h-4 w-4"
                  />
                  <label htmlFor="confirm-destructive" className="cursor-pointer">
                    I have reviewed the destructive changes and confirm that I wish to execute this migration (permanent data loss acknowledged).
                  </label>
                </div>
              )}

              {/* Code Preview */}
              <SQLEditor
                sql={activeSqlTab === 'migration' ? activeMigration.migration_sql : activeMigration.rollback_sql}
                dialect={activeMigration.database_dialect}
              />
            </div>
          )}

          {/* Schema Version Control Audit Trail */}
          <Card>
            <div className="flex items-center gap-2 mb-4">
              <History className="h-5 w-5 text-indigo-600" />
              <h3 className="font-bold text-slate-900">Schema Version Control & Migration History</h3>
            </div>

            {migrationsList.length === 0 ? (
              <p className="text-xs text-slate-400 italic">No migrations generated yet.</p>
            ) : (
              <div className="space-y-3">
                {migrationsList.map((mig) => (
                  <div
                    key={mig.id}
                    className="p-3 rounded-lg border border-slate-200 bg-slate-50/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                  >
                    <div>
                      <div className="flex items-center gap-2 font-mono font-semibold text-slate-900">
                        <span>Migration {mig.id.substring(0, 8)}...</span>
                        <span className={`px-2 py-0.5 rounded text-2xs font-extrabold uppercase ${
                          mig.status === 'EXECUTED' ? 'bg-emerald-100 text-emerald-800' :
                          mig.status === 'ROLLED_BACK' ? 'bg-slate-200 text-slate-800' :
                          'bg-amber-100 text-amber-800'
                        }`}>
                          {mig.status}
                        </span>
                        <span className="text-slate-400 font-normal">
                          Risk: {mig.risk_level}
                        </span>
                      </div>
                      <p className="text-2xs text-slate-500 mt-1">
                        Generated {new Date(mig.created_at).toLocaleString()}
                        {mig.executed_at && ` • Executed ${new Date(mig.executed_at).toLocaleString()}`}
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => {
                          setActiveMigration(mig);
                          setDiffReport(mig.detected_diff);
                        }}
                        className="text-2xs py-1 px-2.5"
                      >
                        Inspect Version
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      )}
    </div>
  );
};

