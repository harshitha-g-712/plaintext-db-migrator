import React, { useState, useEffect } from 'react';
import { agentService } from '../services/agent.service';
import { schemaService } from '../services/schema.service';
import type { SchemaRecord, WorkflowStatusResponse, WorkflowStepLog } from '../types';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { SQLEditor } from '../components/SQLEditor';
import {
  Sparkles,
  Bot,
  FileCode2,
  CheckCircle2,
  AlertTriangle,
  ShieldCheck,
  ShieldAlert,
  AlertCircle,
  Play,
  RotateCcw,
  Check,
  X,
  History,
  Layers,
  ArrowRight,
  Clock,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';

interface AgentWorkflowTabProps {
  projectId: string;
  defaultRequirementText?: string;
  onNavigateToSchema?: () => void;
}

const AGENT_NODES = [
  { id: 'REQUIREMENT_ANALYSIS', label: '1. Requirement Analyzer', role: 'Entity & Relationship Extractor' },
  { id: 'SCHEMA_DESIGN', label: '2. Schema Designer', role: 'Normalizer & ER Architect' },
  { id: 'SQL_GENERATION', label: '3. SQL Generator', role: 'Topological DDL Synthesizer' },
  { id: 'VALIDATION', label: '4. SQL Validator', role: 'SQLGlot AST Inspector' },
  { id: 'REVIEW_AND_RISK', label: '5. Review Sentinel', role: 'Risk & Data Loss Evaluator' },
  { id: 'MIGRATION_GENERATION', label: '6. Migration Agent', role: 'Forward & Rollback Engineer' },
  { id: 'HUMAN_APPROVAL_GATE', label: '7. Approval Gate', role: 'Human-in-the-Loop Sentinel' },
];

export const AgentWorkflowTab: React.FC<AgentWorkflowTabProps> = ({
  projectId,
  defaultRequirementText = '',
  onNavigateToSchema,
}) => {
  const [schemas, setSchemas] = useState<SchemaRecord[]>([]);
  const [requirementsText, setRequirementsText] = useState(defaultRequirementText);
  const [dialect, setDialect] = useState<'postgresql' | 'mysql'>('postgresql');
  const [selectedBaselineId, setSelectedBaselineId] = useState<string>('none');
  const [autoApplyIfSafe, setAutoApplyIfSafe] = useState(false);

  const [running, setRunning] = useState(false);
  const [approving, setApproving] = useState(false);
  const [approvalNotes, setApprovalNotes] = useState('');
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const [activeWorkflow, setActiveWorkflow] = useState<WorkflowStatusResponse | null>(null);
  const [pastWorkflows, setPastWorkflows] = useState<WorkflowStatusResponse[]>([]);
  const [activeSubTab, setActiveSubTab] = useState<'logs' | 'review' | 'sql' | 'migration'>('logs');
  const [expandedLogIdx, setExpandedLogIdx] = useState<number | null>(null);

  // Load project schemas & previous workflow runs
  useEffect(() => {
    if (!projectId) return;

    const loadInitial = async () => {
      try {
        const [latestSchema, workflowsData] = await Promise.all([
          schemaService.getLatestByProject(projectId),
          agentService.getProjectWorkflows(projectId),
        ]);
        setSchemas(latestSchema ? [latestSchema] : []);
        setPastWorkflows(workflowsData || []);
        if (workflowsData && workflowsData.length > 0 && !activeWorkflow) {
          setActiveWorkflow(workflowsData[0]);
        }
      } catch (err) {
        console.error('Error loading workflow context:', err);
      }
    };

    loadInitial();
  }, [projectId]);

  // Synchronize default text if passed in
  useEffect(() => {
    if (defaultRequirementText && !requirementsText) {
      setRequirementsText(defaultRequirementText);
    }
  }, [defaultRequirementText]);

  const handleRunWorkflow = async () => {
    if (!requirementsText.trim()) {
      setError('Please provide plain English database requirements to launch the agent workflow.');
      return;
    }

    setError('');
    setSuccessMsg('');
    setRunning(true);

    try {
      const response = await agentService.runWorkflow({
        project_id: projectId,
        requirements_text: requirementsText.trim(),
        dialect,
        baseline_schema_id: selectedBaselineId === 'none' ? null : selectedBaselineId,
        auto_apply_if_safe: autoApplyIfSafe,
      });

      setActiveWorkflow(response);
      setPastWorkflows((prev) => [response, ...prev.filter((w) => w.id !== response.id)]);

      if (response.status === 'AWAITING_HUMAN_APPROVAL') {
        setSuccessMsg('Multi-agent pipeline succeeded! Execution paused safely at the Human Approval Gate.');
      } else if (response.status === 'COMPLETED') {
        setSuccessMsg('Multi-agent pipeline completed and automatically executed safe migration.');
      }
    } catch (err: any) {
      setError(err?.response?.data?.detail || 'Multi-agent orchestration failed.');
    } finally {
      setRunning(false);
    }
  };

  const handleApprovalDecision = async (approved: boolean) => {
    if (!activeWorkflow) return;

    setApproving(true);
    setError('');
    setSuccessMsg('');

    try {
      const response = await agentService.approveWorkflow(activeWorkflow.id, {
        approved,
        notes: approvalNotes.trim() || undefined,
        apply_migration: approved,
      });

      setActiveWorkflow(response);
      setPastWorkflows((prev) => prev.map((w) => (w.id === response.id ? response : w)));
      setSuccessMsg(
        approved
          ? 'Migration approved! Target schema created and migration registered in version control.'
          : 'Migration rejected. The operation was halted without modifying the database.'
      );
      setApprovalNotes('');
    } catch (err: any) {
      setError(err?.response?.data?.detail || 'Failed to submit approval decision.');
    } finally {
      setApproving(false);
    }
  };

  const getStepStatus = (stepId: string) => {
    if (!activeWorkflow) return 'PENDING';
    const log = activeWorkflow.steps_history.find((s) => s.step === stepId);
    if (!log) return 'PENDING';
    return log.status;
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <Card className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white border-0 shadow-lg">
        <div className="p-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 text-indigo-400 text-xs font-semibold uppercase tracking-wider mb-1">
                <Sparkles className="h-4 w-4" /> Autonomous Multi-Agent Orchestration (LangGraph)
              </div>
              <h2 className="text-2xl font-bold text-white flex items-center gap-2">
                <Bot className="h-7 w-7 text-indigo-400" /> AI Database Engineering Agents
              </h2>
              <p className="text-slate-300 text-sm mt-1 max-w-2xl">
                An intelligent pipeline of 6 specialized agents collaborating via state graphs to analyze,
                normalize, generate SQL, validate ASTs, evaluate risks, and enforce human approval before migration.
              </p>
            </div>
            <div className="flex flex-col sm:flex-row items-center gap-3">
              {onNavigateToSchema && (
                <Button
                  variant="secondary"
                  onClick={onNavigateToSchema}
                  className="bg-white/10 hover:bg-white/20 text-white border-white/20 text-xs px-3 py-2"
                >
                  <ArrowRight className="h-3.5 w-3.5 mr-1" /> View in Schema Designer
                </Button>
              )}
              <Button
                variant="primary"
                onClick={handleRunWorkflow}
                disabled={running}
                className="bg-indigo-600 hover:bg-indigo-500 shadow-md font-semibold px-5 w-full sm:w-auto"
              >
                {running ? (
                  <>
                    <div className="animate-spin h-4 w-4 rounded-full border-2 border-white border-t-transparent mr-2" />
                    Orchestrating Agents...
                  </>
                ) : (
                  <>
                    <Play className="h-4 w-4 mr-2" /> Run Multi-Agent Pipeline
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      </Card>

      {/* Alerts */}
      {error && (
        <div className="p-4 bg-rose-50 border border-rose-200 text-rose-800 rounded-lg text-sm flex items-start gap-2 shadow-sm">
          <AlertCircle className="h-5 w-5 text-rose-500 shrink-0 mt-0.5" />
          <div className="flex-1">{error}</div>
        </div>
      )}

      {successMsg && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg text-sm flex items-start gap-2 shadow-sm">
          <CheckCircle2 className="h-5 w-5 text-emerald-500 shrink-0 mt-0.5" />
          <div className="flex-1 font-medium">{successMsg}</div>
        </div>
      )}

      {/* Control Panel: Configuration & Requirements */}
      <Card>
        <div className="p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
            <h3 className="font-semibold text-slate-900 text-sm flex items-center gap-2">
              <Layers className="h-4 w-4 text-indigo-600" /> Pipeline Configuration
            </h3>
            <div className="flex items-center gap-4 text-xs">
              <div className="flex items-center gap-1.5">
                <span className="text-slate-500">Dialect:</span>
                <select
                  value={dialect}
                  onChange={(e) => setDialect(e.target.value as 'postgresql' | 'mysql')}
                  className="rounded border border-slate-300 py-1 px-2 text-xs font-medium text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                >
                  <option value="postgresql">PostgreSQL</option>
                  <option value="mysql">MySQL</option>
                </select>
              </div>

              <div className="flex items-center gap-1.5">
                <span className="text-slate-500">Baseline Schema:</span>
                <select
                  value={selectedBaselineId}
                  onChange={(e) => setSelectedBaselineId(e.target.value)}
                  className="rounded border border-slate-300 py-1 px-2 text-xs font-medium text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                >
                  <option value="none">None (Fresh Database)</option>
                  {schemas.map((s) => (
                    <option key={s.id} value={s.id}>
                      v{s.version} - {s.schema_name}
                    </option>
                  ))}
                </select>
              </div>

              <label className="flex items-center gap-1.5 cursor-pointer text-slate-600">
                <input
                  type="checkbox"
                  checked={autoApplyIfSafe}
                  onChange={(e) => setAutoApplyIfSafe(e.target.checked)}
                  className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 h-3.5 w-3.5"
                />
                <span>Auto-apply if SAFE</span>
              </label>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Plain English Database Requirements:
            </label>
            <textarea
              rows={4}
              value={requirementsText}
              onChange={(e) => setRequirementsText(e.target.value)}
              placeholder="E.g., Create an e-commerce database with customers, orders, and products. A customer can place multiple orders..."
              className="w-full text-xs font-mono rounded-lg border border-slate-200 p-3 text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
        </div>
      </Card>

      {/* Multi-Agent Visual Pipeline Graph */}
      <Card>
        <div className="p-5">
          <h3 className="font-semibold text-slate-900 text-sm mb-4 flex items-center justify-between">
            <span className="flex items-center gap-2">
              <Bot className="h-4 w-4 text-indigo-600" /> Autonomous Multi-Agent StateGraph
            </span>
            {activeWorkflow && (
              <span
                className={`text-xs px-2.5 py-0.5 rounded-full font-bold uppercase tracking-wider ${
                  activeWorkflow.status === 'COMPLETED'
                    ? 'bg-emerald-100 text-emerald-800'
                    : activeWorkflow.status === 'AWAITING_HUMAN_APPROVAL'
                    ? 'bg-amber-100 text-amber-800 animate-pulse'
                    : activeWorkflow.status === 'REJECTED'
                    ? 'bg-rose-100 text-rose-800'
                    : activeWorkflow.status === 'FAILED'
                    ? 'bg-rose-100 text-rose-800'
                    : 'bg-indigo-100 text-indigo-800'
                }`}
              >
                {activeWorkflow.status.replace(/_/g, ' ')}
              </span>
            )}
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-2.5">
            {AGENT_NODES.map((node, idx) => {
              const nodeStatus = getStepStatus(node.id);
              const isApprovalNode = node.id === 'HUMAN_APPROVAL_GATE';
              const isAwaitingApproval =
                isApprovalNode && activeWorkflow?.status === 'AWAITING_HUMAN_APPROVAL';

              let borderColor = 'border-slate-200 bg-white';
              let badgeColor = 'bg-slate-100 text-slate-500';

              if (nodeStatus === 'COMPLETED') {
                borderColor = 'border-emerald-300 bg-emerald-50/50';
                badgeColor = 'bg-emerald-100 text-emerald-800';
              } else if (nodeStatus === 'WARNING') {
                borderColor = 'border-amber-300 bg-amber-50/50';
                badgeColor = 'bg-amber-100 text-amber-800';
              } else if (nodeStatus === 'FAILED' || nodeStatus === 'REJECTED') {
                borderColor = 'border-rose-300 bg-rose-50/50';
                badgeColor = 'bg-rose-100 text-rose-800';
              } else if (isAwaitingApproval) {
                borderColor = 'border-amber-400 bg-amber-50 animate-pulse';
                badgeColor = 'bg-amber-200 text-amber-900';
              }

              return (
                <div
                  key={node.id}
                  className={`p-3 rounded-lg border text-left flex flex-col justify-between transition-all ${borderColor}`}
                >
                  <div>
                    <div className="flex items-center justify-between gap-1 mb-1">
                      <span className="text-2xs font-semibold text-slate-400 uppercase">
                        Step {idx + 1}
                      </span>
                      <span className={`text-3xs px-1.5 py-0.2 rounded font-bold uppercase ${badgeColor}`}>
                        {isAwaitingApproval ? 'ACTION REQ' : nodeStatus}
                      </span>
                    </div>
                    <div className="font-semibold text-xs text-slate-900">{node.label}</div>
                    <div className="text-3xs text-slate-500 mt-0.5 leading-tight">{node.role}</div>
                  </div>

                  <div className="mt-2 pt-2 border-t border-slate-100 flex items-center justify-between text-2xs text-slate-400">
                    <span>
                      {nodeStatus === 'COMPLETED' ? (
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 inline mr-1" />
                      ) : isAwaitingApproval ? (
                        <AlertTriangle className="h-3.5 w-3.5 text-amber-600 inline mr-1" />
                      ) : (
                        <Clock className="h-3.5 w-3.5 inline mr-1" />
                      )}
                      {nodeStatus === 'COMPLETED' ? 'Done' : isAwaitingApproval ? 'Pause' : 'Ready'}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </Card>

      {/* Human-in-the-Loop Approval Banner */}
      {activeWorkflow && activeWorkflow.status === 'AWAITING_HUMAN_APPROVAL' && (
        <Card className="border-2 border-amber-400 bg-gradient-to-br from-amber-50/60 to-white shadow-md">
          <div className="p-6 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-amber-200 pb-3">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-amber-100 text-amber-800 rounded-lg">
                  <ShieldAlert className="h-6 w-6" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                    Human-in-the-Loop Approval Required
                    <span
                      className={`text-xs px-2.5 py-0.5 rounded-full font-bold uppercase ${
                        activeWorkflow.risk_level === 'DESTRUCTIVE'
                          ? 'bg-rose-200 text-rose-900'
                          : activeWorkflow.risk_level === 'HIGH'
                          ? 'bg-rose-100 text-rose-800'
                          : activeWorkflow.risk_level === 'MEDIUM'
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-emerald-100 text-emerald-800'
                      }`}
                    >
                      Risk: {activeWorkflow.risk_level || 'SAFE'}
                    </span>
                  </h3>
                  <p className="text-xs text-slate-600 mt-0.5">
                    Autonomous agents have designed, validated, and synthesized migration DDL. Human approval
                    is mandatory before database execution.
                  </p>
                </div>
              </div>
            </div>

            {/* Review Findings & Warnings */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
              <div className="space-y-2 bg-white p-3 rounded-lg border border-amber-200">
                <div className="font-semibold text-slate-800 flex items-center gap-1.5">
                  <ShieldCheck className="h-4 w-4 text-emerald-600" /> Architectural Sentinel Findings:
                </div>
                <ul className="space-y-1 list-disc pl-4 text-slate-600 text-2xs">
                  {activeWorkflow.review_report?.review_findings?.map((f, i) => (
                    <li key={i}>{f}</li>
                  ))}
                </ul>
              </div>

              <div className="space-y-2 bg-white p-3 rounded-lg border border-amber-200">
                <div className="font-semibold text-slate-800 flex items-center gap-1.5">
                  <AlertTriangle className="h-4 w-4 text-amber-600" /> Safety & Data Loss Warnings:
                </div>
                {activeWorkflow.review_report?.data_loss_warnings &&
                activeWorkflow.review_report.data_loss_warnings.length > 0 ? (
                  <ul className="space-y-1 list-disc pl-4 text-amber-800 text-2xs font-medium">
                    {activeWorkflow.review_report.data_loss_warnings.map((w, i) => (
                      <li key={i}>{w}</li>
                    ))}
                  </ul>
                ) : (
                  <div className="text-2xs text-emerald-700 flex items-center gap-1 pt-1">
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                    No destructive operations or data loss risks detected. 100% backward compatible.
                  </div>
                )}
              </div>
            </div>

            {/* Decision Notes & Action Buttons */}
            <div className="pt-2 flex flex-col sm:flex-row items-end gap-3">
              <div className="flex-1 w-full">
                <label className="block text-2xs font-medium text-slate-700 mb-1">
                  Reviewer Audit Notes / Instructions (Optional):
                </label>
                <input
                  type="text"
                  value={approvalNotes}
                  onChange={(e) => setApprovalNotes(e.target.value)}
                  placeholder="E.g., Approved for production maintenance window. Verified table normalization."
                  className="w-full text-xs rounded border border-slate-300 p-2 text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>

              <div className="flex items-center gap-2 w-full sm:w-auto">
                <Button
                  variant="secondary"
                  onClick={() => handleApprovalDecision(false)}
                  disabled={approving}
                  className="border-rose-300 text-rose-700 hover:bg-rose-50 text-xs px-4 py-2"
                >
                  <X className="h-4 w-4 mr-1 text-rose-600" /> Reject Migration
                </Button>

                <Button
                  variant="primary"
                  onClick={() => handleApprovalDecision(true)}
                  disabled={approving}
                  className="bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs px-5 py-2 shadow"
                >
                  {approving ? (
                    <div className="animate-spin h-3.5 w-3.5 rounded-full border-2 border-white border-t-transparent mr-1.5" />
                  ) : (
                    <Check className="h-4 w-4 mr-1" />
                  )}
                  Approve & Execute Migration
                </Button>
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* Artifacts & Audit Logs Section */}
      {activeWorkflow && (
        <Card>
          <div className="border-b border-slate-200">
            <nav className="flex space-x-6 px-5 pt-3 text-xs font-semibold">
              <button
                onClick={() => setActiveSubTab('logs')}
                className={`pb-3 border-b-2 flex items-center gap-1.5 transition-colors ${
                  activeSubTab === 'logs'
                    ? 'border-indigo-600 text-indigo-600 font-bold'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                <History className="h-3.5 w-3.5" /> Execution Log ({activeWorkflow.steps_history.length})
              </button>

              <button
                onClick={() => setActiveSubTab('review')}
                className={`pb-3 border-b-2 flex items-center gap-1.5 transition-colors ${
                  activeSubTab === 'review'
                    ? 'border-indigo-600 text-indigo-600 font-bold'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                <ShieldCheck className="h-3.5 w-3.5" /> Review & Architecture
              </button>

              <button
                onClick={() => setActiveSubTab('sql')}
                className={`pb-3 border-b-2 flex items-center gap-1.5 transition-colors ${
                  activeSubTab === 'sql'
                    ? 'border-indigo-600 text-indigo-600 font-bold'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                <FileCode2 className="h-3.5 w-3.5" /> Generated DDL Script
              </button>

              <button
                onClick={() => setActiveSubTab('migration')}
                className={`pb-3 border-b-2 flex items-center gap-1.5 transition-colors ${
                  activeSubTab === 'migration'
                    ? 'border-indigo-600 text-indigo-600 font-bold'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                <RotateCcw className="h-3.5 w-3.5" /> Forward & Rollback SQL
              </button>
            </nav>
          </div>

          <div className="p-5">
            {/* Sub-tab 1: Steps & Execution Log */}
            {activeSubTab === 'logs' && (
              <div className="space-y-3">
                {activeWorkflow.steps_history.map((step: WorkflowStepLog, idx: number) => {
                  const isExpanded = expandedLogIdx === idx;
                  return (
                    <div
                      key={idx}
                      className="border border-slate-200 rounded-lg p-3 bg-white hover:border-slate-300 transition-colors"
                    >
                      <div
                        className="flex items-center justify-between cursor-pointer"
                        onClick={() => setExpandedLogIdx(isExpanded ? null : idx)}
                      >
                        <div className="flex items-center gap-2.5">
                          <span
                            className={`text-3xs px-2 py-0.5 rounded font-bold uppercase ${
                              step.status === 'COMPLETED'
                                ? 'bg-emerald-100 text-emerald-800'
                                : step.status === 'WARNING'
                                ? 'bg-amber-100 text-amber-800'
                                : step.status === 'FAILED' || step.status === 'REJECTED'
                                ? 'bg-rose-100 text-rose-800'
                                : 'bg-slate-100 text-slate-700'
                            }`}
                          >
                            {step.status}
                          </span>
                          <span className="font-semibold text-xs text-slate-900">{step.agent}</span>
                          <span className="text-2xs text-slate-400">({step.step})</span>
                        </div>
                        <div className="flex items-center gap-3 text-2xs text-slate-400">
                          <span>{new Date(step.timestamp).toLocaleTimeString()}</span>
                          {isExpanded ? (
                            <ChevronUp className="h-3.5 w-3.5" />
                          ) : (
                            <ChevronDown className="h-3.5 w-3.5" />
                          )}
                        </div>
                      </div>

                      <div className="text-xs text-slate-600 mt-1 pl-1">{step.summary}</div>

                      {isExpanded && step.details && Object.keys(step.details).length > 0 && (
                        <div className="mt-2.5 p-2.5 bg-slate-50 rounded border border-slate-200 text-2xs font-mono overflow-x-auto text-slate-800">
                          <pre>{JSON.stringify(step.details, null, 2)}</pre>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Sub-tab 2: Review & Architecture */}
            {activeSubTab === 'review' && (
              <div className="space-y-4 text-xs">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
                    <div className="text-2xs text-slate-500 font-semibold uppercase">Architecture Rating</div>
                    <div className="text-lg font-bold text-emerald-700 mt-1">
                      {activeWorkflow.review_report?.architecture_rating || 'OPTIMAL'}
                    </div>
                  </div>
                  <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
                    <div className="text-2xs text-slate-500 font-semibold uppercase">Risk Classification</div>
                    <div className="text-lg font-bold text-slate-900 mt-1">
                      {activeWorkflow.risk_level || 'SAFE'}
                    </div>
                  </div>
                  <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
                    <div className="text-2xs text-slate-500 font-semibold uppercase">Destructive Changes</div>
                    <div className="text-lg font-bold text-rose-600 mt-1">
                      {activeWorkflow.review_report?.destructive_changes_count || 0}
                    </div>
                  </div>
                </div>

                <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg space-y-2">
                  <div className="font-semibold text-slate-900">Review Findings:</div>
                  <ul className="list-disc pl-5 space-y-1 text-slate-700 text-2xs">
                    {activeWorkflow.review_report?.review_findings?.map((f, i) => (
                      <li key={i}>{f}</li>
                    ))}
                  </ul>
                </div>
              </div>
            )}

            {/* Sub-tab 3: Generated DDL */}
            {activeSubTab === 'sql' && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
                  <span>Complete DDL generated by SQL Generator Agent:</span>
                  <span className="font-mono text-2xs">{activeWorkflow.dialect.toUpperCase()}</span>
                </div>
                <SQLEditor
                  sql={activeWorkflow.generated_sql || '-- No SQL generated yet.'}
                  dialect={activeWorkflow.dialect}
                />
              </div>
            )}

            {/* Sub-tab 4: Migration & Rollback SQL */}
            {activeSubTab === 'migration' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <div className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                    <ArrowRight className="h-3.5 w-3.5 text-indigo-600" /> Forward Migration DDL
                  </div>
                  <SQLEditor
                    sql={activeWorkflow.migration_sql || '-- No migration SQL available.'}
                    dialect={activeWorkflow.dialect}
                  />
                </div>
                <div className="space-y-1">
                  <div className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                    <RotateCcw className="h-3.5 w-3.5 text-amber-600" /> Reversible Rollback DDL
                  </div>
                  <SQLEditor
                    sql={activeWorkflow.rollback_sql || '-- No rollback SQL available.'}
                    dialect={activeWorkflow.dialect}
                  />
                </div>
              </div>
            )}
          </div>
        </Card>
      )}

      {/* Past Executions History */}
      {pastWorkflows.length > 1 && (
        <Card>
          <div className="p-5">
            <h3 className="font-semibold text-slate-900 text-xs uppercase tracking-wider mb-3 flex items-center gap-2">
              <History className="h-4 w-4 text-slate-500" /> Prior Agent Orchestration Runs
            </h3>
            <div className="divide-y divide-slate-100">
              {pastWorkflows.map((w) => (
                <div
                  key={w.id}
                  onClick={() => setActiveWorkflow(w)}
                  className={`py-2.5 px-3 rounded flex items-center justify-between text-xs cursor-pointer transition-colors ${
                    activeWorkflow?.id === w.id ? 'bg-indigo-50 font-semibold' : 'hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <span
                      className={`text-3xs px-2 py-0.5 rounded font-bold uppercase ${
                        w.status === 'COMPLETED'
                          ? 'bg-emerald-100 text-emerald-800'
                          : w.status === 'AWAITING_HUMAN_APPROVAL'
                          ? 'bg-amber-100 text-amber-800'
                          : w.status === 'REJECTED'
                          ? 'bg-rose-100 text-rose-800'
                          : 'bg-slate-100 text-slate-700'
                      }`}
                    >
                      {w.status}
                    </span>
                    <span className="text-slate-800">{w.requirements_text.slice(0, 60)}...</span>
                  </div>
                  <div className="text-2xs text-slate-400">
                    {new Date(w.created_at).toLocaleString()}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </Card>
      )}
    </div>
  );
};
