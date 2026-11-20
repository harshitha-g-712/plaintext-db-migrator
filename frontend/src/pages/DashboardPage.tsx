import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { projectService } from '../services/project.service';
import { schemaService } from '../services/schema.service';
import api from '../services/api';
import type { Project } from '../types';
import {
  FolderOpen,
  Database,
  GitBranch,
  Shield,
  ArrowRight,
  Sparkles,
  Layers,
  CheckCircle2,
} from 'lucide-react';

const featureCards = [
  {
    icon: Sparkles,
    title: 'NL to Schema',
    description: 'Describe your database in plain English. AI extracts entities, attributes and relationships.',
    color: 'text-purple-600 bg-purple-50',
    phase: 'Phase 2',
  },
  {
    icon: Database,
    title: 'SQL Generation',
    description: 'Generate validated SQL for MySQL and PostgreSQL with syntax checking.',
    color: 'text-blue-600 bg-blue-50',
    phase: 'Phase 4',
  },
  {
    icon: GitBranch,
    title: 'Migration Scripts',
    description: 'Compare schemas, detect differences and generate migration and rollback scripts.',
    color: 'text-green-600 bg-green-50',
    phase: 'Phase 5',
  },
  {
    icon: Shield,
    title: 'Human Approval',
    description: 'Review AI-generated migrations before execution. Full audit trail and version history.',
    color: 'text-orange-600 bg-orange-50',
    phase: 'Phase 6',
  },
];

export const DashboardPage: React.FC = () => {
  const { user } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [schemaCount, setSchemaCount] = useState<number | null>(null);
  const [migrationCount, setMigrationCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        setLoading(true);
        const projs = await projectService.list();
        setProjects(projs);

        // Fetch migrations count for current user
        try {
          const { data: migs } = await api.get<any[]>('/api/migrations/');
          setMigrationCount(migs?.length ?? 0);
        } catch {
          setMigrationCount(0);
        }

        // Fetch schemas count across all projects
        try {
          if (projs.length > 0) {
            const schemas = await Promise.all(
              projs.map((p) => schemaService.getLatestByProject(p.id).catch(() => null))
            );
            setSchemaCount(schemas.filter(Boolean).length);
          } else {
            setSchemaCount(0);
          }
        } catch {
          setSchemaCount(0);
        }
      } catch (err) {
        console.error('Failed to load dashboard metrics', err);
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
  }, []);

  return (
    <div className="space-y-8">
      {/* Welcome header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            Welcome back, {user?.name?.split(' ')[0]}! 👋
          </h1>
          <p className="text-slate-500 mt-1">
            Your AI-powered database engineering workspace
          </p>
        </div>
        <Link to="/projects/new">
          <Button size="md">
            <FolderOpen className="h-4 w-4" />
            New Project
          </Button>
        </Link>
      </div>

      {/* Stats row - Live Data */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Link to="/projects" className="block transition-transform hover:-translate-y-0.5">
          <Card className="hover:border-indigo-200 hover:shadow-md transition-all">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-slate-500">Projects</p>
              <span className="p-2 bg-indigo-50 text-indigo-600 rounded-lg">
                <Layers className="h-4 w-4" />
              </span>
            </div>
            <p className="text-3xl font-bold text-slate-900 mt-2">
              {loading ? (
                <span className="inline-block animate-pulse text-slate-300">...</span>
              ) : (
                projects.length
              )}
            </p>
            <p className="text-xs text-indigo-600 font-medium mt-2 flex items-center gap-1">
              View all projects <ArrowRight className="h-3 w-3" />
            </p>
          </Card>
        </Link>

        <Card>
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-slate-500">Schemas Generated</p>
            <span className="p-2 bg-purple-50 text-purple-600 rounded-lg">
              <Database className="h-4 w-4" />
            </span>
          </div>
          <p className="text-3xl font-bold text-slate-900 mt-2">
            {loading ? (
              <span className="inline-block animate-pulse text-slate-300">...</span>
            ) : (
              schemaCount ?? 0
            )}
          </p>
          <p className="text-xs text-slate-400 mt-2">Active schema designs across projects</p>
        </Card>

        <Card>
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-slate-500">Migrations Run</p>
            <span className="p-2 bg-emerald-50 text-emerald-600 rounded-lg">
              <GitBranch className="h-4 w-4" />
            </span>
          </div>
          <p className="text-3xl font-bold text-slate-900 mt-2">
            {loading ? (
              <span className="inline-block animate-pulse text-slate-300">...</span>
            ) : (
              migrationCount ?? 0
            )}
          </p>
          <p className="text-xs text-slate-400 mt-2">Executed & registered in version control</p>
        </Card>
      </div>

      {/* Recent Projects Quick Access */}
      {projects.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-slate-900">Your Recent Projects</h2>
            <Link to="/projects" className="text-xs text-indigo-600 hover:text-indigo-800 font-medium">
              View all ({projects.length})
            </Link>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            {projects.slice(0, 3).map((p) => (
              <Link key={p.id} to={`/projects/${p.id}`} className="block group">
                <Card className="h-full group-hover:border-indigo-300 group-hover:shadow-md transition-all">
                  <div className="flex items-start justify-between">
                    <h3 className="font-semibold text-slate-900 group-hover:text-indigo-600 transition-colors">
                      {p.project_name}
                    </h3>
                    <CheckCircle2 className="h-4 w-4 text-emerald-500 flex-shrink-0" />
                  </div>
                  <p className="text-xs text-slate-500 mt-2 line-clamp-2">
                    {p.description || 'No description provided.'}
                  </p>
                  <p className="text-[11px] text-slate-400 mt-4">
                    Created: {new Date(p.created_at).toLocaleDateString()}
                  </p>
                </Card>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Feature overview */}
      <div>
        <h2 className="text-lg font-semibold text-slate-900 mb-4">Platform Capabilities</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {featureCards.map(({ icon: Icon, title, description, color, phase }) => (
            <Card key={title} className="hover:shadow-md transition-shadow">
              <div className="flex items-start gap-4">
                <div className={`p-2.5 rounded-lg ${color} flex-shrink-0`}>
                  <Icon className="h-5 w-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-semibold text-slate-900">{title}</h3>
                    <span className="text-xs text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">
                      {phase}
                    </span>
                  </div>
                  <p className="text-sm text-slate-500">{description}</p>
                </div>
              </div>
            </Card>
          ))}
        </div>
      </div>

      {/* Quick start */}
      <Card className="bg-indigo-50 border-indigo-100">
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
          <div className="flex-1">
            <h3 className="font-semibold text-indigo-900">Get started in 3 steps</h3>
            <ol className="text-sm text-indigo-700 mt-2 space-y-1 list-decimal list-inside">
              <li>Create a new project</li>
              <li>Describe your database requirements in plain English</li>
              <li>Review the generated schema, SQL and migration scripts</li>
            </ol>
          </div>
          <Link to="/projects/new">
            <Button>
              Start now <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
        </div>
      </Card>
    </div>
  );
};
