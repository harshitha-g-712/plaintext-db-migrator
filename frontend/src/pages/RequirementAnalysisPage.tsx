import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { projectService } from '../services/project.service';
import { requirementService } from '../services/requirement.service';
import type { Project, Requirement, EntityDefinition, AttributeDefinition } from '../types';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { SchemaDesignerTab } from './SchemaDesignerTab';
import { SQLGeneratorTab } from './SQLGeneratorTab';
import { MigrationTab } from './MigrationTab';
import { AgentWorkflowTab } from './AgentWorkflowTab';
import {
  ArrowLeft,
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
  BookOpen,
  Layers,
  ArrowRight,
  GitBranch,
  FileCode2,
  Bot,
  Shield,
} from 'lucide-react';

const PRESETS = [
  {
    title: 'College Management System',
    text: `Create a college management database.
A student has student ID, name, email and phone number.
A department has department ID and department name.
Each student belongs to one department.
A department can have multiple students.`,
  },
  {
    title: 'E-Commerce Platform',
    text: `Create an e-commerce database.
A customer has customer ID, name, email and phone number.
A product has product ID, product name, price and stock quantity.
An order belongs to one customer.
A customer can place multiple orders.
Each order can contain multiple products.
A product can belong to multiple orders.
Every order has an order date and order status.
Each order has payment information.`,
  },
  {
    title: 'Hospital & Healthcare',
    text: `Create a hospital management database.
A doctor has doctor ID, full name, specialization and license number.
A patient has patient ID, full name, date of birth, gender and blood group.
An appointment links one doctor and one patient with appointment date, time, reason and status.
Each patient can have multiple appointments.
A doctor can treat multiple patients.`,
  },
];

const SQL_TYPES = [
  'INTEGER',
  'BIGINT',
  'VARCHAR(255)',
  'VARCHAR(50)',
  'TEXT',
  'BOOLEAN',
  'NUMERIC(10,2)',
  'TIMESTAMP',
  'DATE',
  'UUID',
];

export const RequirementAnalysisPage: React.FC = () => {
  const { projectId } = useParams<{ projectId: string }>();
  const { user: currentUser } = useAuth();
  const [activeTab, setActiveTab] = useState<'requirements' | 'schema' | 'sql' | 'migrations' | 'agents'>('requirements');
  const [project, setProject] = useState<Project | null>(null);
  const [requirement, setRequirement] = useState<Requirement | null>(null);
  const [inputText, setInputText] = useState('');
  const [loadingProject, setLoadingProject] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [isEditing, setIsEditing] = useState(false);

  // Editable local state for entities
  const [editableEntities, setEditableEntities] = useState<EntityDefinition[]>([]);

  const isReadOnly = currentUser?.role === 'ADMIN' && !!project && project.user_id !== currentUser.id;

  useEffect(() => {
    if (!projectId) return;

    const loadData = async () => {
      try {
        setLoadingProject(true);
        const projData = await projectService.get(projectId);
        setProject(projData);

        const reqData = await requirementService.getByProject(projectId);
        if (reqData) {
          setRequirement(reqData);
          setInputText(reqData.original_text);
          setEditableEntities(reqData.analyzed_data.entities || []);
        }
      } catch (err: any) {
        setError(err?.response?.data?.detail || 'Failed to load project requirements.');
      } finally {
        setLoadingProject(false);
      }
    };

    loadData();
  }, [projectId]);

  const handleAnalyze = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!projectId || !inputText.trim()) return;

    setError('');
    setSuccessMsg('');
    setAnalyzing(true);

    try {
      const result = await requirementService.analyze({
        project_id: projectId,
        requirements_text: inputText.trim(),
      });
      setRequirement(result);
      setEditableEntities(result.analyzed_data.entities || []);
      setSuccessMsg('Requirements analyzed successfully! Review the extracted entities and schema below.');
      setIsEditing(false);
    } catch (err: any) {
      setError(err?.response?.data?.detail || 'Analysis failed. Please check your requirement text or backend logs.');
    } finally {
      setAnalyzing(false);
    }
  };

  const handleSaveEdits = async () => {
    if (!requirement) return;

    setSaving(true);
    setError('');
    setSuccessMsg('');

    try {
      const updatedData = {
        ...requirement.analyzed_data,
        entities: editableEntities,
      };

      const result = await requirementService.update(requirement.id, {
        original_text: inputText,
        analyzed_data: updatedData,
      });

      setRequirement(result);
      setEditableEntities(result.analyzed_data.entities || []);
      setSuccessMsg('Your manual schema adjustments were saved successfully!');
      setIsEditing(false);
    } catch (err: any) {
      setError(err?.response?.data?.detail || 'Failed to save changes.');
    } finally {
      setSaving(false);
    }
  };

  // Entity manipulation
  const handleAddEntity = () => {
    const newEntityName = `NewEntity_${editableEntities.length + 1}`;
    const newEntity: EntityDefinition = {
      name: newEntityName,
      description: 'Custom entity added by user',
      attributes: [
        {
          name: `${newEntityName.toLowerCase()}_id`,
          type: 'INTEGER',
          primary_key: true,
          foreign_key: false,
          nullable: false,
          unique: true,
        },
      ],
    };
    setEditableEntities([...editableEntities, newEntity]);
    setIsEditing(true);
  };

  const handleDeleteEntity = (entityIndex: number) => {
    setEditableEntities(editableEntities.filter((_, idx) => idx !== entityIndex));
    setIsEditing(true);
  };

  const handleUpdateEntityName = (entityIndex: number, newName: string) => {
    const updated = [...editableEntities];
    updated[entityIndex].name = newName;
    setEditableEntities(updated);
    setIsEditing(true);
  };

  // Attribute manipulation
  const handleAddAttribute = (entityIndex: number) => {
    const updated = [...editableEntities];
    const newAttr: AttributeDefinition = {
      name: `column_${updated[entityIndex].attributes.length + 1}`,
      type: 'VARCHAR(255)',
      primary_key: false,
      foreign_key: false,
      nullable: true,
      unique: false,
    };
    updated[entityIndex].attributes.push(newAttr);
    setEditableEntities(updated);
    setIsEditing(true);
  };

  const handleDeleteAttribute = (entityIndex: number, attrIndex: number) => {
    const updated = [...editableEntities];
    updated[entityIndex].attributes = updated[entityIndex].attributes.filter((_, idx) => idx !== attrIndex);
    setEditableEntities(updated);
    setIsEditing(true);
  };

  const handleUpdateAttribute = (
    entityIndex: number,
    attrIndex: number,
    field: keyof AttributeDefinition,
    value: any
  ) => {
    const updated = [...editableEntities];
    updated[entityIndex].attributes[attrIndex] = {
      ...updated[entityIndex].attributes[attrIndex],
      [field]: value,
    };
    setEditableEntities(updated);
    setIsEditing(true);
  };

  if (loadingProject) {
    return (
      <div className="flex justify-center py-20">
        <div className="animate-spin h-10 w-10 rounded-full border-4 border-indigo-600 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-16">
      {/* Navigation & Header */}
      <div>
        <Link to="/projects" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 mb-3 transition-colors">
          <ArrowLeft className="h-4 w-4" /> Back to Projects
        </Link>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2.5">
              <Database className="h-6 w-6 text-indigo-600" />
              {project?.project_name || 'Project Workspace'}
            </h1>
            <p className="text-sm text-slate-500 mt-1">
              AI-Powered Database Schema Platform
            </p>
          </div>
          {requirement && (
            <div className="flex items-center gap-2">
              <span className="text-xs bg-emerald-50 text-emerald-700 border border-emerald-200 px-2.5 py-1 rounded-full font-medium flex items-center gap-1">
                <CheckCircle2 className="h-3.5 w-3.5" /> Requirements Ready
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Admin Read-Only Notice */}
      {isReadOnly && (
        <div className="bg-amber-50 border border-amber-200 text-amber-900 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-sm shadow-xs">
          <div className="flex items-start sm:items-center gap-3">
            <Shield className="h-5 w-5 text-amber-600 shrink-0 mt-0.5 sm:mt-0" />
            <div>
              <span className="font-bold">Admin Inspection Mode (Read-Only)</span>:
              {' '}This project is owned by Developer{' '}
              <span className="font-semibold text-amber-950 underline decoration-amber-400">
                {project?.owner_name || project?.owner_email || 'Developer'}
              </span>
              . You have full visibility across requirements, schemas, ER diagrams, SQL, and migrations, but modifications are restricted to the project owner.
            </div>
          </div>
          <span className="bg-amber-200/90 text-amber-900 text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wider self-start sm:self-auto shrink-0 border border-amber-300">
            Read-Only
          </span>
        </div>
      )}

      {/* Workspace Tabs Navigation */}
      <div className="border-b border-slate-200">
        <nav className="flex space-x-6 text-sm font-medium">
          <button
            onClick={() => setActiveTab('requirements')}
            className={`pb-3 border-b-2 flex items-center gap-2 transition-colors ${
              activeTab === 'requirements'
                ? 'border-indigo-600 text-indigo-600 font-bold'
                : 'border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300'
            }`}
          >
            <Sparkles className="h-4 w-4" />
            <span>1. Natural Language Requirements</span>
            {requirement && (
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            )}
          </button>

          <button
            onClick={() => setActiveTab('schema')}
            className={`pb-3 border-b-2 flex items-center gap-2 transition-colors ${
              activeTab === 'schema'
                ? 'border-indigo-600 text-indigo-600 font-bold'
                : 'border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300'
            }`}
          >
            <Database className="h-4 w-4" />
            <span>2. Schema Designer & ER Diagram</span>
            <span className="text-2xs bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded-full font-semibold">
              Phase 3
            </span>
          </button>

          <button
            onClick={() => setActiveTab('sql')}
            className={`pb-3 border-b-2 flex items-center gap-2 transition-colors ${
              activeTab === 'sql'
                ? 'border-indigo-600 text-indigo-600 font-bold'
                : 'border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300'
            }`}
          >
            <FileCode2 className="h-4 w-4" />
            <span>3. SQL Generation & Validation</span>
            <span className="text-2xs bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded-full font-semibold">
              Phase 4
            </span>
          </button>

          <button
            onClick={() => setActiveTab('migrations')}
            className={`pb-3 border-b-2 flex items-center gap-2 transition-colors ${
              activeTab === 'migrations'
                ? 'border-indigo-600 text-indigo-600 font-bold'
                : 'border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300'
            }`}
          >
            <GitBranch className="h-4 w-4" />
            <span>4. Migrations & Versioning</span>
            <span className="text-2xs bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded-full font-semibold">
              Phase 5
            </span>
          </button>

          <button
            onClick={() => setActiveTab('agents')}
            className={`pb-3 border-b-2 flex items-center gap-2 transition-colors ${
              activeTab === 'agents'
                ? 'border-indigo-600 text-indigo-600 font-bold'
                : 'border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300'
            }`}
          >
            <Bot className="h-4 w-4" />
            <span>5. Autonomous Agents (LangGraph)</span>
            <span className="text-2xs bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded-full font-semibold">
              Phase 6
            </span>
          </button>
        </nav>
      </div>

      {/* Tab 5: Autonomous Multi-Agent Orchestration Tab */}
      {activeTab === 'agents' && (
        <AgentWorkflowTab
          projectId={projectId!}
          defaultRequirementText={inputText}
          onNavigateToSchema={() => setActiveTab('schema')}
          isReadOnly={isReadOnly}
        />
      )}

      {/* Tab 4: Migrations & Version Control Tab */}
      {activeTab === 'migrations' && (
        <MigrationTab
          projectId={projectId!}
          onNavigateToSchema={() => setActiveTab('schema')}
          isReadOnly={isReadOnly}
        />
      )}

      {/* Tab 3: SQL Generator Tab */}
      {activeTab === 'sql' && (
        <SQLGeneratorTab
          projectId={projectId!}
          onNavigateToSchema={() => setActiveTab('schema')}
          isReadOnly={isReadOnly}
        />
      )}

      {/* Tab 2: Schema Designer Tab */}
      {activeTab === 'schema' && (
        <SchemaDesignerTab
          projectId={projectId!}
          hasRequirement={!!requirement}
          onNavigateToRequirements={() => setActiveTab('requirements')}
          isReadOnly={isReadOnly}
        />
      )}

      {/* Tab 1: Requirements Analysis Tab */}
      {activeTab === 'requirements' && (
        <div className="space-y-8">
          {/* Alerts */}
          {error && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700 flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold">Analysis Notice</p>
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

          {/* Requirement Input Editor */}
          <Card className="border-indigo-100 bg-gradient-to-b from-white to-indigo-50/20">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-indigo-600" />
                <h2 className="text-lg font-semibold text-slate-900">Natural Language Database Specification</h2>
              </div>
              <span className="text-xs text-slate-400">OpenRouter AI Compatible</span>
            </div>

            <p className="text-sm text-slate-600 mb-4">
              Describe the tables, records, fields, and relationships you need in plain English.
              The AI agent analyzes your prose, extracts entities, data types, primary keys, and cardinality.
            </p>

            {/* Preset Buttons */}
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <span className="text-xs font-medium text-slate-500 flex items-center gap-1">
                <BookOpen className="h-3.5 w-3.5" /> Presets:
              </span>
              {PRESETS.map((preset) => (
                <button
                  key={preset.title}
                  type="button"
                  disabled={isReadOnly}
                  onClick={() => setInputText(preset.text)}
                  className={`text-xs px-2.5 py-1 rounded-md bg-white border border-slate-200 text-slate-700 transition-colors shadow-2xs ${
                    isReadOnly ? 'opacity-50 cursor-not-allowed' : 'hover:border-indigo-400 hover:text-indigo-600'
                  }`}
                >
                  {preset.title}
                </button>
              ))}
            </div>

            <form onSubmit={handleAnalyze} className="space-y-4">
              <div>
                <textarea
                  rows={6}
                  value={inputText}
                  readOnly={isReadOnly}
                  onChange={(e) => setInputText(e.target.value)}
                  placeholder="e.g. Create a college management database. A student has student ID, name, email and phone number. A department has department ID and department name. Each student belongs to one department..."
                  className={`block w-full rounded-xl border border-slate-300 p-3.5 text-sm font-sans shadow-xs focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 ${
                    isReadOnly ? 'bg-slate-50 text-slate-700 cursor-default' : 'bg-white'
                  }`}
                  required
                />
                <div className="flex items-center justify-between mt-1 text-xs text-slate-400 px-1">
                  <span>Supports complex relationships, junction tables, and business constraints.</span>
                  <span>{inputText.length} characters</span>
                </div>
              </div>

              <div className="flex items-center justify-between pt-1">
                <Button
                  type="submit"
                  size="md"
                  isLoading={analyzing}
                  disabled={analyzing || isReadOnly || !inputText.trim()}
                  className="gap-2"
                  title={isReadOnly ? 'Admins have read-only inspection access and cannot modify developer requirements.' : undefined}
                >
                  <Sparkles className="h-4 w-4" />
                  {isReadOnly ? 'Read-Only Mode' : analyzing ? 'Analyzing with AI...' : 'Analyze Requirements'}
                </Button>

                {requirement && (
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        setInputText(requirement.original_text);
                        setEditableEntities(requirement.analyzed_data.entities || []);
                        setIsEditing(false);
                      }}
                      className="gap-1.5 text-xs text-slate-600"
                    >
                      <RotateCcw className="h-3.5 w-3.5" /> Reset to Saved
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => setActiveTab('schema')}
                      className="gap-1.5 text-xs bg-indigo-600 hover:bg-indigo-700 text-white"
                    >
                      Design Schema →
                    </Button>
                  </div>
                )}
              </div>
            </form>
          </Card>

          {/* Analysis Results Display */}
          {requirement && (
            <div className="space-y-6">
              {/* Domain Summary & Actions */}
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
                <div>
                  <span className="text-xs font-semibold uppercase tracking-wider text-indigo-600">Domain Overview</span>
                  <p className="text-sm font-medium text-slate-800 mt-0.5">
                    {requirement.analyzed_data.summary || 'Database schema structure extracted from requirements.'}
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {!isReadOnly && (
                    isEditing ? (
                      <Button
                        size="sm"
                        variant="primary"
                        onClick={handleSaveEdits}
                        isLoading={saving}
                        className="gap-1.5"
                      >
                        <Save className="h-3.5 w-3.5" /> Save Corrections
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => setIsEditing(true)}
                        className="gap-1.5"
                      >
                        Edit Extracted Schema
                      </Button>
                    )
                  )}
                  <Button
                    size="sm"
                    onClick={() => setActiveTab('schema')}
                    className="gap-1.5"
                  >
                    Go to Schema Designer <ArrowRight className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>

              {/* Extracted Entities Section */}
              <div>
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
                      <Layers className="h-5 w-5 text-indigo-600" />
                      Identified Entities & Attributes ({editableEntities.length})
                    </h3>
                    <p className="text-xs text-slate-500">
                      Entities, primary keys, candidate types, and column constraints.
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={handleAddEntity}
                    className="gap-1.5 text-xs"
                  >
                    <Plus className="h-3.5 w-3.5" /> Add Entity
                  </Button>
                </div>

                <div className="grid grid-cols-1 gap-6">
                  {editableEntities.map((entity, entityIdx) => (
                    <Card key={entityIdx} className="border-slate-200 overflow-hidden p-0">
                      {/* Entity Header */}
                      <div className="bg-slate-50/80 px-6 py-4 border-b border-slate-200 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="h-8 w-8 rounded-lg bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold text-sm">
                            {entity.name.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            {isEditing ? (
                              <input
                                type="text"
                                value={entity.name}
                                onChange={(e) => handleUpdateEntityName(entityIdx, e.target.value)}
                                className="font-bold text-slate-900 text-base bg-white border border-slate-300 rounded px-2 py-0.5 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                              />
                            ) : (
                              <h4 className="font-bold text-slate-900 text-base">{entity.name}</h4>
                            )}
                            <p className="text-xs text-slate-500 mt-0.5">
                              {entity.description || `${entity.attributes.length} attributes`}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => handleAddAttribute(entityIdx)}
                            className="text-xs gap-1 py-1 px-2.5"
                          >
                            <Plus className="h-3 w-3" /> Add Attribute
                          </Button>
                          <button
                            type="button"
                            onClick={() => handleDeleteEntity(entityIdx)}
                            className="text-slate-400 hover:text-red-600 p-1 rounded transition-colors"
                            title="Delete entity"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>

                      {/* Attributes Table */}
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm">
                          <thead className="bg-slate-100/60 text-slate-600 text-xs uppercase tracking-wider border-b border-slate-200">
                            <tr>
                              <th className="py-2.5 px-6 font-semibold">Attribute Name</th>
                              <th className="py-2.5 px-4 font-semibold">SQL Type</th>
                              <th className="py-2.5 px-4 font-semibold text-center">Primary Key</th>
                              <th className="py-2.5 px-4 font-semibold text-center">Foreign Key</th>
                              <th className="py-2.5 px-4 font-semibold text-center">Unique</th>
                              <th className="py-2.5 px-4 font-semibold text-center">Nullable</th>
                              <th className="py-2.5 px-4 font-semibold">References / Info</th>
                              <th className="py-2.5 px-4 text-right">Actions</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 font-sans">
                            {entity.attributes.map((attr, attrIdx) => (
                              <tr key={attrIdx} className="hover:bg-slate-50/50 transition-colors">
                                {/* Attribute Name */}
                                <td className="py-3 px-6 font-mono text-xs font-semibold text-slate-900">
                                  {isEditing ? (
                                    <input
                                      type="text"
                                      value={attr.name}
                                      onChange={(e) =>
                                        handleUpdateAttribute(entityIdx, attrIdx, 'name', e.target.value)
                                      }
                                      className="w-full font-mono text-xs border border-slate-300 rounded px-2 py-1 bg-white"
                                    />
                                  ) : (
                                    <span className="flex items-center gap-1.5">
                                      {attr.primary_key && <Key className="h-3.5 w-3.5 text-amber-500" />}
                                      {attr.foreign_key && <LinkIcon className="h-3.5 w-3.5 text-blue-500" />}
                                      {attr.name}
                                    </span>
                                  )}
                                </td>

                                {/* SQL Type */}
                                <td className="py-3 px-4">
                                  {isEditing ? (
                                    <select
                                      value={attr.type}
                                      onChange={(e) =>
                                        handleUpdateAttribute(entityIdx, attrIdx, 'type', e.target.value)
                                      }
                                      className="text-xs border border-slate-300 rounded px-2 py-1 bg-white"
                                    >
                                      {SQL_TYPES.map((t) => (
                                        <option key={t} value={t}>
                                          {t}
                                        </option>
                                      ))}
                                    </select>
                                  ) : (
                                    <span className="inline-block px-2 py-0.5 rounded text-xs font-mono bg-slate-100 text-slate-700 font-medium">
                                      {attr.type}
                                    </span>
                                  )}
                                </td>

                                {/* Primary Key Checkbox */}
                                <td className="py-3 px-4 text-center">
                                  {isEditing ? (
                                    <input
                                      type="checkbox"
                                      checked={attr.primary_key}
                                      onChange={(e) =>
                                        handleUpdateAttribute(entityIdx, attrIdx, 'primary_key', e.target.checked)
                                      }
                                      className="rounded text-indigo-600 focus:ring-indigo-500 h-4 w-4"
                                    />
                                  ) : attr.primary_key ? (
                                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800">
                                      PK
                                    </span>
                                  ) : (
                                    <span className="text-slate-300">—</span>
                                  )}
                                </td>

                                {/* Foreign Key Checkbox */}
                                <td className="py-3 px-4 text-center">
                                  {isEditing ? (
                                    <input
                                      type="checkbox"
                                      checked={attr.foreign_key}
                                      onChange={(e) =>
                                        handleUpdateAttribute(entityIdx, attrIdx, 'foreign_key', e.target.checked)
                                      }
                                      className="rounded text-blue-600 focus:ring-blue-500 h-4 w-4"
                                    />
                                  ) : attr.foreign_key ? (
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
                                      checked={attr.unique}
                                      onChange={(e) =>
                                        handleUpdateAttribute(entityIdx, attrIdx, 'unique', e.target.checked)
                                      }
                                      className="rounded text-indigo-600 focus:ring-indigo-500 h-4 w-4"
                                    />
                                  ) : attr.unique ? (
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
                                      checked={attr.nullable}
                                      onChange={(e) =>
                                        handleUpdateAttribute(entityIdx, attrIdx, 'nullable', e.target.checked)
                                      }
                                      className="rounded text-indigo-600 focus:ring-indigo-500 h-4 w-4"
                                    />
                                  ) : attr.nullable ? (
                                    <span className="text-xs text-slate-500">NULL</span>
                                  ) : (
                                    <span className="text-xs font-medium text-slate-700">NOT NULL</span>
                                  )}
                                </td>

                                {/* References / Details */}
                                <td className="py-3 px-4 text-xs text-slate-500">
                                  {attr.references ? (
                                    <span className="font-mono text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">
                                      → {attr.references}
                                    </span>
                                  ) : attr.description ? (
                                    <span>{attr.description}</span>
                                  ) : (
                                    <span className="text-slate-400 italic">None</span>
                                  )}
                                </td>

                                {/* Delete attribute button */}
                                <td className="py-3 px-4 text-right">
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteAttribute(entityIdx, attrIdx)}
                                    className="text-slate-300 hover:text-red-500 transition-colors p-1"
                                    title="Remove attribute"
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

              {/* Relationships & Constraints Row */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Relationships Card */}
                <Card>
                  <div className="flex items-center gap-2 mb-4">
                    <LinkIcon className="h-5 w-5 text-indigo-600" />
                    <h3 className="font-semibold text-slate-900">
                      Identified Relationships ({requirement.analyzed_data.relationships.length})
                    </h3>
                  </div>

                  {requirement.analyzed_data.relationships.length === 0 ? (
                    <p className="text-sm text-slate-400 italic">No direct inter-entity relationships detected.</p>
                  ) : (
                    <div className="space-y-3">
                      {requirement.analyzed_data.relationships.map((rel, idx) => (
                        <div
                          key={idx}
                          className="p-3 rounded-lg border border-slate-200 bg-slate-50/50 flex flex-col gap-1.5"
                        >
                          <div className="flex items-center justify-between text-xs font-semibold">
                            <span className="text-slate-900 font-mono">
                              {rel.source_entity} <ArrowRight className="inline h-3 w-3 mx-1 text-slate-400" />{' '}
                              {rel.target_entity}
                            </span>
                            <span className="px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 text-2xs uppercase">
                              {rel.relationship_type}
                            </span>
                          </div>
                          {rel.foreign_key_column && (
                            <p className="text-2xs text-slate-500 font-mono">
                              FK Column: <span className="text-slate-800">{rel.foreign_key_column}</span>
                            </p>
                          )}
                          {rel.junction_table && (
                            <p className="text-2xs text-slate-500 font-mono">
                              Junction Table: <span className="text-slate-800">{rel.junction_table}</span>
                            </p>
                          )}
                          {rel.description && <p className="text-xs text-slate-600">{rel.description}</p>}
                        </div>
                      ))}
                    </div>
                  )}
                </Card>

                {/* Constraints & Business Rules Card */}
                <Card>
                  <div className="flex items-center gap-2 mb-4">
                    <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                    <h3 className="font-semibold text-slate-900">Constraints & Business Rules</h3>
                  </div>

                  <div className="space-y-4">
                    <div>
                      <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                        Key Constraints ({requirement.analyzed_data.constraints.length})
                      </h4>
                      <div className="space-y-1.5">
                        {requirement.analyzed_data.constraints.map((c, idx) => (
                          <div key={idx} className="flex items-center gap-2 text-xs text-slate-700 bg-slate-50 p-2 rounded">
                            <span className="font-semibold text-slate-900">{c.entity}:</span>
                            <span className="bg-slate-200 text-slate-800 px-1.5 py-0.5 rounded font-mono text-2xs">
                              {c.type}
                            </span>
                            <span className="font-mono text-slate-600">{c.columns.join(', ')}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div>
                      <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                        Domain Business Rules ({requirement.analyzed_data.business_rules.length})
                      </h4>
                      <ul className="text-xs text-slate-600 space-y-1.5 list-disc list-inside">
                        {requirement.analyzed_data.business_rules.map((rule, idx) => (
                          <li key={idx}>{rule}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </Card>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
