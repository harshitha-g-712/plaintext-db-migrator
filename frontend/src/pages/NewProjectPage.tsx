import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { projectService } from '../services/project.service';
import { Input } from '../components/Input';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { ArrowLeft, FolderOpen } from 'lucide-react';

export const NewProjectPage: React.FC = () => {
  const navigate = useNavigate();
  const [form, setForm] = useState({ project_name: '', description: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [apiError, setApiError] = useState('');

  const validate = () => {
    const errs: Record<string, string> = {};
    if (!form.project_name.trim()) errs.project_name = 'Project name is required';
    if (form.project_name.length > 255) errs.project_name = 'Name must be under 255 characters';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setApiError('');
    if (!validate()) return;
    setLoading(true);
    try {
      const project = await projectService.create({
        project_name: form.project_name.trim(),
        description: form.description.trim() || undefined,
      });
      navigate('/projects', { state: { created: project.project_name } });
    } catch (err: any) {
      setApiError(err?.response?.data?.detail || 'Failed to create project');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-6">
        <Link to="/projects" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700">
          <ArrowLeft className="h-4 w-4" /> Back to Projects
        </Link>
      </div>

      <Card>
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2.5 bg-indigo-50 rounded-lg">
            <FolderOpen className="h-5 w-5 text-indigo-600" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900">New Project</h1>
            <p className="text-sm text-slate-500">Create a database engineering project</p>
          </div>
        </div>

        {apiError && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
            {apiError}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            label="Project name"
            type="text"
            placeholder="e.g. E-Commerce Database"
            value={form.project_name}
            onChange={(e) => setForm((f) => ({ ...f, project_name: e.target.value }))}
            error={errors.project_name}
            required
          />
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-slate-700">Description (optional)</label>
            <textarea
              rows={4}
              placeholder="Describe what this database project is for..."
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              className="block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm shadow-xs focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
            />
          </div>
          <div className="flex gap-3 pt-2">
            <Button type="submit" isLoading={loading}>
              Create Project
            </Button>
            <Link to="/projects">
              <Button type="button" variant="secondary">Cancel</Button>
            </Link>
          </div>
        </form>
      </Card>
    </div>
  );
};
