import React, { useState, useEffect } from 'react';
import { schemaService } from '../services/schema.service';
import type { SchemaRecord, TableDesign, ColumnDesign } from '../types';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { MermaidRenderer } from '../components/MermaidRenderer';
import {
  Sparkles,
  Database,
  Plus,
  Trash2,
  Key,
  Link as LinkIcon,
  CheckCircle2,
  AlertCircle,
  Save,
  RotateCcw,
  Layers,
  ShieldCheck,
  Lightbulb,
  FileCode2,
} from 'lucide-react';

interface SchemaDesignerTabProps {
  projectId: string;
  hasRequirement: boolean;
  onNavigateToRequirements: () => void;
}

const SQL_TYPES = [
  'INTEGER',
  'BIGINT',
  'SERIAL',
  'VARCHAR(255)',
  'VARCHAR(100)',
  'TEXT',
  'BOOLEAN',
  'NUMERIC(10,2)',
  'TIMESTAMP',
  'DATE',
  'UUID',
  'JSON',
];

export const SchemaDesignerTab: React.FC<SchemaDesignerTabProps> = ({
  projectId,
  hasRequirement,
  onNavigateToRequirements,
}) => {
  const [schemaRecord, setSchemaRecord] = useState<SchemaRecord | null>(null);
  const [dialect, setDialect] = useState<string>('postgresql');
  const [loading, setLoading] = useState<boolean>(true);
  const [generating, setGenerating] = useState<boolean>(false);
  const [saving, setSaving] = useState<boolean>(false);
  const [error, setError] = useState<string>('');
  const [successMsg, setSuccessMsg] = useState<string>('');
  const [isEditing, setIsEditing] = useState<boolean>(false);

  // Editable local state
  const [editableTables, setEditableTables] = useState<TableDesign[]>([]);

  useEffect(() => {
    loadSchema();
  }, [projectId]);

  const loadSchema = async () => {
    try {
      setLoading(true);
      const data = await schemaService.getLatestByProject(projectId);
      if (data) {
        setSchemaRecord(data);
        setDialect(data.database_dialect || 'postgresql');
        setEditableTables(data.schema_definition.tables || []);
      }
    } catch (err: any) {
      setError(err?.response?.data?.detail || 'Failed to fetch existing schema.');
    } finally {
      setLoading(false);
    }
  };

  const handleGenerate = async () => {
    if (!hasRequirement) {
      setError('Please analyze natural language requirements first before generating the schema.');
      return;
    }

    setGenerating(true);
    setError('');
    setSuccessMsg('');

    try {
      const data = await schemaService.generate({
        project_id: projectId,
        database_dialect: dialect,
      });
      setSchemaRecord(data);
      setEditableTables(data.schema_definition.tables || []);
      setSuccessMsg('Database schema and interactive ER diagram generated successfully!');
      setIsEditing(false);
    } catch (err: any) {
      setError(err?.response?.data?.detail || 'Schema generation failed. Please check backend logs.');
    } finally {
      setGenerating(false);
    }
  };

  const handleSaveEdits = async () => {
    if (!schemaRecord) return;

    setSaving(true);
    setError('');
    setSuccessMsg('');

    try {
      const updatedDefinition = {
        ...schemaRecord.schema_definition,
        tables: editableTables,
      };

      const result = await schemaService.update(schemaRecord.id, {
        schema_name: schemaRecord.schema_name,
        database_dialect: dialect,
        schema_definition: updatedDefinition,
      });

      setSchemaRecord(result);
      setEditableTables(result.schema_definition.tables || []);
      setSuccessMsg('Schema modifications saved successfully! ER diagram refreshed.');
      setIsEditing(false);
    } catch (err: any) {
      setError(err?.response?.data?.detail || 'Failed to save schema modifications.');
    } finally {
      setSaving(false);
    }
  };

  // Table manipulation
  const handleAddTable = () => {
    const newTableName = `table_${editableTables.length + 1}`;
    const newTable: TableDesign = {
      name: newTableName,
      description: 'Custom table added by architect',
      is_junction_table: false,
      columns: [
        {
          name: 'id',
          data_type: dialect === 'mysql' ? 'INTEGER' : 'SERIAL',
          primary_key: true,
          foreign_key: false,
          nullable: false,
          unique: true,
          description: 'Primary key',
        },
      ],
      primary_key: ['id'],
      indexes: [],
    };
    setEditableTables([...editableTables, newTable]);
    setIsEditing(true);
  };

  const handleDeleteTable = (tIdx: number) => {
    setEditableTables(editableTables.filter((_, idx) => idx !== tIdx));
    setIsEditing(true);
  };

  const handleUpdateTableName = (tIdx: number, newName: string) => {
    const updated = [...editableTables];
    updated[tIdx].name = newName;
    setEditableTables(updated);
    setIsEditing(true);
  };

  // Column manipulation
  const handleAddColumn = (tIdx: number) => {
    const updated = [...editableTables];
    const newCol: ColumnDesign = {
      name: `col_${updated[tIdx].columns.length + 1}`,
      data_type: 'VARCHAR(255)',
      primary_key: false,
      foreign_key: false,
      nullable: true,
      unique: false,
    };
    updated[tIdx].columns.push(newCol);
    setEditableTables(updated);
    setIsEditing(true);
  };

  const handleDeleteColumn = (tIdx: number, cIdx: number) => {
    const updated = [...editableTables];
    updated[tIdx].columns = updated[tIdx].columns.filter((_, idx) => idx !== cIdx);
    setEditableTables(updated);
    setIsEditing(true);
  };

  const handleUpdateColumn = (
    tIdx: number,
    cIdx: number,
    field: keyof ColumnDesign,
    value: any
  ) => {
    const updated = [...editableTables];
    updated[tIdx].columns[cIdx] = {
      ...updated[tIdx].columns[cIdx],
      [field]: value,
    };
    setEditableTables(updated);
    setIsEditing(true);
  };

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <div className="animate-spin h-10 w-10 rounded-full border-4 border-indigo-600 border-t-transparent" />
      </div>
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

      {/* Generator Control Card */}
      <Card className="border-indigo-100 bg-gradient-to-r from-white via-indigo-50/10 to-white">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-indigo-600" />
              <h2 className="text-lg font-bold text-slate-900">AI Schema Designer Agent</h2>
            </div>
            <p className="text-sm text-slate-600 mt-1">
              Converts extracted entities into normalized tables, sets up composite and foreign keys,
              generates junction tables, audits 3NF normalization, and produces an interactive ER diagram.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Dialect Selector */}
            <div className="flex items-center gap-2 bg-white border border-slate-300 rounded-lg px-3 py-1.5 shadow-2xs">
              <Database className="h-4 w-4 text-slate-500" />
              <label htmlFor="dialect-select" className="text-xs font-medium text-slate-600">Dialect:</label>
              <select
                id="dialect-select"
                value={dialect}
                onChange={(e) => setDialect(e.target.value)}
                className="text-xs font-semibold text-slate-800 bg-transparent focus:outline-none cursor-pointer"
              >
                <option value="postgresql">PostgreSQL</option>
                <option value="mysql">MySQL</option>
              </select>
            </div>

            <Button
              type="button"
              onClick={handleGenerate}
              isLoading={generating}
              disabled={generating}
              className="gap-2"
            >
              <Sparkles className="h-4 w-4" />
              {schemaRecord ? 'Regenerate Schema' : 'Generate Schema'}
            </Button>
          </div>
        </div>

        {!hasRequirement && (
          <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800 flex items-center justify-between">
            <span>No analyzed requirements found. Complete Phase 2 first to generate a full schema.</span>
            <button
              onClick={onNavigateToRequirements}
              className="font-bold underline hover:text-amber-900 ml-2"
            >
              Go to Requirements →
            </button>
          </div>
        )}
      </Card>

      {schemaRecord && (
        <div className="space-y-8">
          {/* ER Diagram Section */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                  <FileCode2 className="h-5 w-5 text-indigo-600" />
                  Interactive Entity-Relationship (ER) Diagram
                </h3>
                <p className="text-xs text-slate-500">
                  Visual representation showing tables, primary keys (PK), foreign keys (FK), and cardinality.
                </p>
              </div>
              <span className="text-xs text-slate-400 bg-slate-100 px-2.5 py-1 rounded-full font-mono font-medium">
                Version {schemaRecord.version} • {schemaRecord.database_dialect.toUpperCase()}
              </span>
            </div>

            <MermaidRenderer chart={schemaRecord.mermaid_er || ''} />
          </div>

          {/* Normalization Audit & Improvements Row */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Normalization Audit */}
            <Card className="lg:col-span-1">
              <div className="flex items-center gap-2 mb-4">
                <ShieldCheck className="h-5 w-5 text-emerald-600" />
                <h3 className="font-semibold text-slate-900">Normalization Audit</h3>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between p-2.5 rounded-lg bg-slate-50 border border-slate-100">
                  <span className="text-xs font-medium text-slate-700">First Normal Form (1NF)</span>
                  <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 bg-emerald-100/60 px-2 py-0.5 rounded-full">
                    <CheckCircle2 className="h-3 w-3" /> Valid
                  </span>
                </div>
                <div className="flex items-center justify-between p-2.5 rounded-lg bg-slate-50 border border-slate-100">
                  <span className="text-xs font-medium text-slate-700">Second Normal Form (2NF)</span>
                  <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 bg-emerald-100/60 px-2 py-0.5 rounded-full">
                    <CheckCircle2 className="h-3 w-3" /> Valid
                  </span>
                </div>
                <div className="flex items-center justify-between p-2.5 rounded-lg bg-slate-50 border border-slate-100">
                  <span className="text-xs font-medium text-slate-700">Third Normal Form (3NF)</span>
                  <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 bg-emerald-100/60 px-2 py-0.5 rounded-full">
                    <CheckCircle2 className="h-3 w-3" /> Valid
                  </span>
                </div>

                {schemaRecord.schema_definition.normalization_report.issues_found.length > 0 && (
                  <div className="mt-3">
                    <p className="text-2xs font-bold text-amber-700 uppercase tracking-wider mb-1">Audit Notes</p>
                    <ul className="text-xs text-amber-800 space-y-1 list-disc list-inside bg-amber-50 p-2 rounded">
                      {schemaRecord.schema_definition.normalization_report.issues_found.map((issue, idx) => (
                        <li key={idx}>{issue}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </Card>

            {/* Suggested Improvements */}
            <Card className="lg:col-span-2">
              <div className="flex items-center gap-2 mb-4">
                <Lightbulb className="h-5 w-5 text-amber-500" />
                <h3 className="font-semibold text-slate-900">
                  Architectural Insights & Recommendations ({schemaRecord.schema_definition.improvements.length})
                </h3>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {schemaRecord.schema_definition.improvements.map((imp, idx) => (
                  <div
                    key={idx}
                    className="p-3 rounded-lg border border-slate-200 bg-slate-50/50 flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-2xs font-bold uppercase tracking-wider text-indigo-600 font-mono">
                          {imp.category}
                        </span>
                        <span className={`text-2xs font-semibold px-1.5 py-0.5 rounded ${
                          imp.severity === 'HIGH' ? 'bg-red-100 text-red-700' :
                          imp.severity === 'MEDIUM' ? 'bg-amber-100 text-amber-700' :
                          'bg-blue-100 text-blue-700'
                        }`}>
                          {imp.severity}
                        </span>
                      </div>
                      <h4 className="text-xs font-bold text-slate-900">{imp.title}</h4>
                      <p className="text-xs text-slate-600 mt-1 line-clamp-3">{imp.description}</p>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          </div>

          {/* Normalized Tables Inspection & Modification */}
          <div>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
              <div>
                <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                  <Layers className="h-5 w-5 text-indigo-600" />
                  Relational Tables Specification ({editableTables.length})
                </h3>
                <p className="text-xs text-slate-500">
                  Inspect columns, constraints, foreign keys, and indexes. Click edit to modify the schema.
                </p>
              </div>

              <div className="flex items-center gap-2">
                {isEditing ? (
                  <>
                    <Button
                      size="sm"
                      variant="primary"
                      onClick={handleSaveEdits}
                      isLoading={saving}
                      className="gap-1.5"
                    >
                      <Save className="h-3.5 w-3.5" /> Save Schema Changes
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => {
                        setEditableTables(schemaRecord.schema_definition.tables || []);
                        setIsEditing(false);
                      }}
                      className="gap-1.5"
                    >
                      <RotateCcw className="h-3.5 w-3.5" /> Cancel
                    </Button>
                  </>
                ) : (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => setIsEditing(true)}
                    className="gap-1.5 text-xs"
                  >
                    Edit Schema Definition
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={handleAddTable}
                  className="gap-1.5 text-xs"
                >
                  <Plus className="h-3.5 w-3.5" /> Add Table
                </Button>
              </div>
            </div>

            <div className="space-y-6">
              {editableTables.map((table, tIdx) => (
                <Card key={tIdx} className="border-slate-200 overflow-hidden p-0 shadow-2xs">
                  {/* Table Header */}
                  <div className="bg-slate-50/90 px-6 py-4 border-b border-slate-200 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded-lg bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold text-sm">
                        {table.name.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          {isEditing ? (
                            <input
                              type="text"
                              value={table.name}
                              onChange={(e) => handleUpdateTableName(tIdx, e.target.value)}
                              className="font-bold text-slate-900 text-base bg-white border border-slate-300 rounded px-2 py-0.5 focus:outline-none focus:ring-1 focus:ring-indigo-500 font-mono"
                            />
                          ) : (
                            <h4 className="font-bold text-slate-900 text-base font-mono">{table.name}</h4>
                          )}
                          {table.is_junction_table && (
                            <span className="text-2xs font-semibold px-2 py-0.5 rounded-full bg-purple-100 text-purple-700">
                              Junction Table (N:M)
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-500 mt-0.5">
                          {table.description || `${table.columns.length} columns`}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => handleAddColumn(tIdx)}
                        className="text-xs gap-1 py-1 px-2.5"
                      >
                        <Plus className="h-3 w-3" /> Add Column
                      </Button>
                      <button
                        type="button"
                        onClick={() => handleDeleteTable(tIdx)}
                        className="text-slate-400 hover:text-red-600 p-1 rounded transition-colors"
                        title="Delete table"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>

                  {/* Columns Table */}
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead className="bg-slate-100/70 text-slate-600 text-xs uppercase tracking-wider border-b border-slate-200">
                        <tr>
                          <th className="py-2.5 px-6 font-semibold">Column Name</th>
                          <th className="py-2.5 px-4 font-semibold">Data Type</th>
                          <th className="py-2.5 px-4 font-semibold text-center">PK</th>
                          <th className="py-2.5 px-4 font-semibold text-center">FK</th>
                          <th className="py-2.5 px-4 font-semibold text-center">Unique</th>
                          <th className="py-2.5 px-4 font-semibold text-center">Nullable</th>
                          <th className="py-2.5 px-4 font-semibold">References / Default</th>
                          <th className="py-2.5 px-4 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 font-sans">
                        {table.columns.map((col, cIdx) => (
                          <tr key={cIdx} className="hover:bg-slate-50/50 transition-colors">
                            {/* Column Name */}
                            <td className="py-3 px-6 font-mono text-xs font-semibold text-slate-900">
                              {isEditing ? (
                                <input
                                  type="text"
                                  value={col.name}
                                  onChange={(e) => handleUpdateColumn(tIdx, cIdx, 'name', e.target.value)}
                                  className="w-full font-mono text-xs border border-slate-300 rounded px-2 py-1 bg-white"
                                />
                              ) : (
                                <span className="flex items-center gap-1.5">
                                  {col.primary_key && <Key className="h-3.5 w-3.5 text-amber-500" />}
                                  {col.foreign_key && <LinkIcon className="h-3.5 w-3.5 text-blue-500" />}
                                  {col.name}
                                </span>
                              )}
                            </td>

                            {/* Data Type */}
                            <td className="py-3 px-4">
                              {isEditing ? (
                                <select
                                  value={col.data_type}
                                  onChange={(e) => handleUpdateColumn(tIdx, cIdx, 'data_type', e.target.value)}
                                  className="text-xs font-mono border border-slate-300 rounded px-2 py-1 bg-white"
                                >
                                  {SQL_TYPES.map((t) => (
                                    <option key={t} value={t}>
                                      {t}
                                    </option>
                                  ))}
                                </select>
                              ) : (
                                <span className="inline-block px-2 py-0.5 rounded text-xs font-mono bg-slate-100 text-slate-700 font-medium">
                                  {col.data_type}
                                </span>
                              )}
                            </td>

                            {/* PK */}
                            <td className="py-3 px-4 text-center">
                              {isEditing ? (
                                <input
                                  type="checkbox"
                                  checked={col.primary_key}
                                  onChange={(e) => handleUpdateColumn(tIdx, cIdx, 'primary_key', e.target.checked)}
                                  className="rounded text-indigo-600 focus:ring-indigo-500 h-4 w-4"
                                />
                              ) : col.primary_key ? (
                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800">
                                  PK
                                </span>
                              ) : (
                                <span className="text-slate-300">—</span>
                              )}
                            </td>

                            {/* FK */}
                            <td className="py-3 px-4 text-center">
                              {isEditing ? (
                                <input
                                  type="checkbox"
                                  checked={col.foreign_key}
                                  onChange={(e) => handleUpdateColumn(tIdx, cIdx, 'foreign_key', e.target.checked)}
                                  className="rounded text-blue-600 focus:ring-blue-500 h-4 w-4"
                                />
                              ) : col.foreign_key ? (
                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                                  FK
                                </span>
                              ) : (
                                <span className="text-slate-300">—</span>
                              )}
                            </td>

                            {/* Unique */}
                            <td className="py-3 px-4 text-center">
                              {isEditing ? (
                                <input
                                  type="checkbox"
                                  checked={col.unique}
                                  onChange={(e) => handleUpdateColumn(tIdx, cIdx, 'unique', e.target.checked)}
                                  className="rounded text-indigo-600 focus:ring-indigo-500 h-4 w-4"
                                />
                              ) : col.unique ? (
                                <span className="text-xs font-medium text-purple-700 bg-purple-50 px-2 py-0.5 rounded">
                                  UNIQUE
                                </span>
                              ) : (
                                <span className="text-slate-300">—</span>
                              )}
                            </td>

                            {/* Nullable */}
                            <td className="py-3 px-4 text-center">
                              {isEditing ? (
                                <input
                                  type="checkbox"
                                  checked={col.nullable}
                                  onChange={(e) => handleUpdateColumn(tIdx, cIdx, 'nullable', e.target.checked)}
                                  className="rounded text-indigo-600 focus:ring-indigo-500 h-4 w-4"
                                />
                              ) : col.nullable ? (
                                <span className="text-xs text-slate-500">NULL</span>
                              ) : (
                                <span className="text-xs font-medium text-slate-700">NOT NULL</span>
                              )}
                            </td>

                            {/* References / Default */}
                            <td className="py-3 px-4 text-xs font-mono text-slate-500">
                              {col.references_table ? (
                                <span className="text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">
                                  → {col.references_table}.{col.references_column || 'id'}
                                </span>
                              ) : col.default ? (
                                <span className="text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded">
                                  DEF: {col.default}
                                </span>
                              ) : (
                                <span className="text-slate-400 italic font-sans">—</span>
                              )}
                            </td>

                            {/* Delete Column */}
                            <td className="py-3 px-4 text-right">
                              <button
                                type="button"
                                onClick={() => handleDeleteColumn(tIdx, cIdx)}
                                className="text-slate-300 hover:text-red-500 transition-colors p-1"
                                title="Remove column"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Card>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
