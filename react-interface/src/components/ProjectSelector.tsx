import React, { useState, useEffect } from 'react';
import { Plus, Loader2 } from 'lucide-react';
import { listProjects, getActiveProject, activateProject, Project } from '../services/projectService';
import ProjectModal from './ProjectModal';

interface ProjectSelectorProps {
  onProjectSelected: (projectId: string) => void;
}

const ProjectSelector: React.FC<ProjectSelectorProps> = ({ onProjectSelected }) => {
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadProjects = async () => {
      try {
        setIsLoading(true);
        setError(null);
        
        // Verifica projeto ativo
        const activeProject = await getActiveProject();
        if (activeProject) {
          setActiveProjectId(activeProject.id);
        }
        
        // Lista todos os projetos para o usuário escolher
        const allProjects = await listProjects();
        setProjects(allProjects);
        
        // Se não há projetos, mostra modal de criação
        if (allProjects.length === 0) {
          setShowCreateModal(true);
        }
      } catch (err) {
        console.error('Erro ao carregar projetos:', err);
        setError('Erro ao carregar projetos. Verifique se o backend está rodando.');
        // Em caso de erro, permite criar novo projeto
        setShowCreateModal(true);
      } finally {
        setIsLoading(false);
      }
    };
    
    loadProjects();
  }, []);

  const handleProjectClick = async (project: Project) => {
    try {
      await activateProject(project.id);
      onProjectSelected(project.id);
    } catch (err) {
      console.error('Erro ao ativar projeto:', err);
      setError('Erro ao selecionar projeto. Tente novamente.');
    }
  };

  const handleCreateProject = async (projectId: string) => {
    setShowCreateModal(false);
    onProjectSelected(projectId);
  };

  if (isLoading) {
    return (
      <div
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: '#0a0a0a',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 10000,
        }}
      >
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '16px',
            color: '#9ca3af',
          }}
        >
          <Loader2 size={32} style={{ animation: 'spin 1s linear infinite' }} />
          <div style={{ fontSize: '14px' }}>Carregando projetos...</div>
        </div>
      </div>
    );
  }

  // Se o modal de criação está aberto, mostra apenas o modal
  if (showCreateModal) {
    return (
      <ProjectModal
        isOpen={showCreateModal}
        onClose={() => {
          // Se não há projetos, não permite fechar sem criar
          if (projects.length === 0) {
            return;
          }
          setShowCreateModal(false);
        }}
        onProjectCreated={handleCreateProject}
      />
    );
  }

  return (
    <>
      <div
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: '#0a0a0a',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 10000,
          padding: '20px',
        }}
      >
        <div
          style={{
            backgroundColor: '#1a1a1a',
            borderRadius: '12px',
            padding: '32px',
            width: '100%',
            maxWidth: '600px',
            border: '1px solid #2a2a2a',
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5)',
          }}
        >
          <h2
            style={{
              margin: '0 0 24px 0',
              fontSize: '24px',
              fontWeight: 600,
              color: '#ffffff',
            }}
          >
            Selecione um Projeto
          </h2>

          {error && (
            <div
              style={{
                marginBottom: '20px',
                padding: '12px',
                backgroundColor: 'rgba(239, 68, 68, 0.1)',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                borderRadius: '8px',
                color: '#ef4444',
                fontSize: '14px',
              }}
            >
              {error}
            </div>
          )}

          {projects.length > 0 ? (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '12px',
                marginBottom: '20px',
                maxHeight: '400px',
                overflowY: 'auto',
              }}
            >
              {projects.map((project) => {
                const isActive = activeProjectId === project.id;
                return (
                  <div
                    key={project.id}
                    onClick={() => handleProjectClick(project)}
                    style={{
                      padding: '16px',
                      backgroundColor: isActive ? '#1e3a5f' : '#0a0a0a',
                      border: `1px solid ${isActive ? '#3b82f6' : '#2a2a2a'}`,
                      borderRadius: '8px',
                      cursor: 'pointer',
                      transition: 'all 0.2s',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = isActive ? '#2563eb' : '#151515';
                      e.currentTarget.style.borderColor = '#3b82f6';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = isActive ? '#1e3a5f' : '#0a0a0a';
                      e.currentTarget.style.borderColor = isActive ? '#3b82f6' : '#2a2a2a';
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                      <div
                        style={{
                          fontSize: '16px',
                          fontWeight: 500,
                          color: '#ffffff',
                        }}
                      >
                        {project.name}
                      </div>
                      {isActive && (
                        <span
                          style={{
                            fontSize: '12px',
                            padding: '2px 8px',
                            backgroundColor: '#3b82f6',
                            color: '#ffffff',
                            borderRadius: '4px',
                            fontWeight: 500,
                          }}
                        >
                          Ativo
                        </span>
                      )}
                    </div>
                    {project.description && (
                      <div
                        style={{
                          fontSize: '14px',
                          color: '#9ca3af',
                          marginTop: '4px',
                        }}
                      >
                        {project.description}
                      </div>
                    )}
                    <div
                      style={{
                        fontSize: '12px',
                        color: '#6b7280',
                        marginTop: '8px',
                      }}
                    >
                      Criado em: {new Date(project.createdAt).toLocaleDateString('pt-BR')}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div
              style={{
                padding: '24px',
                textAlign: 'center',
                color: '#9ca3af',
                marginBottom: '20px',
              }}
            >
              Nenhum projeto encontrado. Crie um novo projeto para começar.
            </div>
          )}

          <button
            onClick={() => setShowCreateModal(true)}
            style={{
              width: '100%',
              padding: '12px',
              backgroundColor: '#3b82f6',
              border: 'none',
              borderRadius: '8px',
              color: '#ffffff',
              fontSize: '14px',
              fontWeight: 500,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              transition: 'background-color 0.2s',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = '#2563eb';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = '#3b82f6';
            }}
          >
            <Plus size={18} />
            Criar Novo Projeto
          </button>
        </div>
      </div>
    </>
  );
};

export default ProjectSelector;

