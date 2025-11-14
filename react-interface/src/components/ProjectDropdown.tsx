import React, { useState, useEffect, useRef } from 'react';
import { ChevronsUpDown, Check, Plus } from 'lucide-react';
import { listProjects, getActiveProject, activateProject, Project, getProject } from '../services/projectService';
import ProjectModal from './ProjectModal';

interface ProjectDropdownProps {
  currentProject: Project | null;
  onProjectChanged: (project: Project) => void;
}

const ProjectDropdown: React.FC<ProjectDropdownProps> = ({ currentProject, onProjectChanged }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const loadProjects = async () => {
      try {
        setIsLoading(true);
        const allProjects = await listProjects();
        setProjects(allProjects);
      } catch (err) {
        console.error('Erro ao carregar projetos:', err);
      } finally {
        setIsLoading(false);
      }
    };

    if (isOpen) {
      loadProjects();
    }
  }, [isOpen]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const handleProjectSelect = async (project: Project) => {
    try {
      await activateProject(project.id);
      onProjectChanged(project);
      setIsOpen(false);
    } catch (err) {
      console.error('Erro ao ativar projeto:', err);
    }
  };

  const handleProjectCreated = async (projectId: string) => {
    try {
      const project = await getProject(projectId);
      await activateProject(project.id);
      onProjectChanged(project);
      setIsOpen(false);
      setShowCreateModal(false);
      // Recarrega a lista de projetos
      const allProjects = await listProjects();
      setProjects(allProjects);
    } catch (err) {
      console.error('Erro ao carregar projeto criado:', err);
    }
  };

  return (
    <div ref={dropdownRef} style={{ position: 'relative' }}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        style={{
          padding: '4px 10px',
          border: 'none',
          backgroundColor: '#2a2a2a',
          color: '#9ca3af',
          cursor: 'pointer',
          fontSize: '11px',
          fontWeight: 500,
          borderRadius: '6px',
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          transition: 'background-color 0.2s',
        }}
        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#3a3a3a'}
        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#2a2a2a'}
      >
        <span>{currentProject?.name || 'Nenhum projeto'}</span>
        <ChevronsUpDown size={12} />
      </button>

      {isOpen && (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            marginTop: '4px',
            backgroundColor: '#1a1a1a',
            border: '1px solid #2a2a2a',
            borderRadius: '8px',
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.5)',
            minWidth: '200px',
            maxWidth: '300px',
            maxHeight: '400px',
            overflowY: 'auto',
            zIndex: 1000,
          }}
        >
          {isLoading ? (
            <div style={{ padding: '16px', textAlign: 'center', color: '#9ca3af', fontSize: '14px' }}>
              Carregando...
            </div>
          ) : (
            <div style={{ padding: '4px' }}>
              {projects.length === 0 ? (
                <div style={{ padding: '12px', textAlign: 'center', color: '#9ca3af', fontSize: '13px' }}>
                  Nenhum projeto encontrado
                </div>
              ) : (
                projects.map((project) => {
                const isActive = currentProject?.id === project.id;
                return (
                  <div
                    key={project.id}
                    onClick={() => handleProjectSelect(project)}
                    style={{
                      padding: '10px 12px',
                      backgroundColor: isActive ? '#1e3a5f' : 'transparent',
                      color: '#ffffff',
                      cursor: 'pointer',
                      borderRadius: '6px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      transition: 'background-color 0.2s',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = isActive ? '#2563eb' : '#2a2a2a';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = isActive ? '#1e3a5f' : 'transparent';
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          fontSize: '13px',
                          fontWeight: 500,
                          color: '#ffffff',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                      >
                        {project.name}
                      </div>
                      {project.description && (
                        <div
                          style={{
                            fontSize: '11px',
                            color: '#9ca3af',
                            marginTop: '2px',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}
                        >
                          {project.description}
                        </div>
                      )}
                    </div>
                    {isActive && (
                      <Check size={16} color="#3b82f6" style={{ marginLeft: '8px', flexShrink: 0 }} />
                    )}
                  </div>
                );
                })
              )}
              
              {/* Separador */}
              {projects.length > 0 && (
                <div style={{
                  height: '1px',
                  backgroundColor: '#2a2a2a',
                  margin: '8px 4px',
                }} />
              )}
              
              {/* Botão Criar Novo Projeto */}
              <button
                onClick={() => {
                  setShowCreateModal(true);
                  setIsOpen(false);
                }}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  border: 'none',
                  backgroundColor: 'transparent',
                  color: '#9ca3af',
                  cursor: 'pointer',
                  borderRadius: '6px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  fontSize: '13px',
                  fontWeight: 500,
                  transition: 'background-color 0.2s, color 0.2s',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = '#2a2a2a';
                  e.currentTarget.style.color = '#ffffff';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'transparent';
                  e.currentTarget.style.color = '#9ca3af';
                }}
              >
                <Plus size={16} />
                Criar novo projeto
              </button>
            </div>
          )}
        </div>
      )}
      
      {/* Modal de criação de projeto */}
      <ProjectModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onProjectCreated={handleProjectCreated}
      />
    </div>
  );
};

export default ProjectDropdown;

