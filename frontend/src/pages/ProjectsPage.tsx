import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { projectService } from '../services/project.service';
import type { Project } from '../types';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { FolderOpen, Plus, Calendar, Trash2, ArrowRight, Sparkles } from 'lucide-react';

export const ProjectsPage: React.FC = () => {
  const { user: currentUser } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fetchProjects = async () => {
    try {
      const data = await projectService.list();
      setProjects(data);
    } catch {
      setError('Failed to load projects');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProjects();
  }, []);

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (!confirm('Delete this project? This cannot be undone.')) return;
    setDeletingId(id);
    try {
      await projectService.delete(id);
      setProjects((p) => p.filter((proj) => proj.id !== id));
    } catch {
      setError('Failed to delete project');
    } finally {
      setDeletingId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <div className="animate-spin h-8 w-8 rounded-full border-4 border-indigo-600 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Projects</h1>
          <p className="text-slate-500 text-sm mt-0.5">
            {projects.length} project{projects.length !== 1 ? 's' : ''} • Select a project to analyze requirements
          </p>
        </div>
        <Link to="/projects/new">
          <Button>
            <Plus className="h-4 w-4" /> New Project
          </Button>
        </Link>
      </div>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>
      )}

      {projects.length === 0 ? (
        <Card className="text-center py-16">
          <FolderOpen className="h-12 w-12 text-slate-300 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-slate-900">No projects yet</h3>
          <p className="text-slate-500 text-sm mt-1 mb-6">Create your first database project to get started.</p>
          <Link to="/projects/new">
            <Button>
              <Plus className="h-4 w-4" /> Create Project
            </Button>
          </Link>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {projects.map((project) => (
            <Link
              key={project.id}
              to={`/projects/${project.id}`}
              className="block group focus:outline-none"
            >
              <Card className="h-full hover:shadow-md hover:border-indigo-200 transition-all flex flex-col justify-between">
                <div>
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <div className="p-2.5 bg-indigo-50 group-hover:bg-indigo-100 rounded-lg transition-colors">
                        <FolderOpen className="h-5 w-5 text-indigo-600" />
                      </div>
                      {currentUser?.role === 'ADMIN' && (
                        project.user_id === currentUser.id ? (
                          <span className="text-2xs bg-purple-100 text-purple-700 font-bold px-2 py-0.5 rounded-full border border-purple-200">
                            Your Project
                          </span>
                        ) : (
                          <span className="text-2xs bg-blue-100 text-blue-700 font-bold px-2 py-0.5 rounded-full border border-blue-200">
                            By {project.owner_name || 'Developer'} (Read-Only)
                          </span>
                        )
                      )}
                    </div>
                    {!(currentUser?.role === 'ADMIN' && project.user_id !== currentUser.id) && (
                      <button
                        onClick={(e) => handleDelete(project.id, e)}
                        disabled={deletingId === project.id}
                        className="text-slate-300 hover:text-red-500 transition-colors p-1.5 rounded"
                        title="Delete project"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                  <h3 className="font-semibold text-slate-900 group-hover:text-indigo-600 transition-colors mb-1">
                    {project.project_name}
                  </h3>
                  <p className="text-sm text-slate-500 line-clamp-2">
                    {project.description || 'No description provided.'}
                  </p>
                </div>

                <div className="pt-4 border-t border-slate-100 mt-4 flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-xs text-slate-400">
                    <Calendar className="h-3.5 w-3.5" />
                    {new Date(project.created_at).toLocaleDateString()}
                  </div>
                  <span className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 group-hover:translate-x-0.5 transition-transform">
                    <Sparkles className="h-3.5 w-3.5" /> Requirements <ArrowRight className="h-3.5 w-3.5" />
                  </span>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
};
