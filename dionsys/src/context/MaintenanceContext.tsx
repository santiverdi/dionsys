import { createContext, useContext, useState, useCallback, type ReactNode } from 'react'
import type { MaintenanceTask, MaintenanceMaterial, Role } from '../types'
import { generateId } from '../utils/imageCompressor'

const LS_KEY = 'dionsys_maintenance_tasks'

interface CreateTaskData {
  description: string
  issuePhoto: string
  location?: string
  createdBy: string
  createdByRole: Role
}

interface CompleteTaskData {
  taskId: string
  completedBy: string
  completionPhoto: string
  resolutionNotes: string
  materials: MaintenanceMaterial[]
}

interface CreateAndCompleteData {
  description: string
  issuePhoto: string
  location?: string
  completionPhoto: string
  resolutionNotes: string
  materials: MaintenanceMaterial[]
  createdBy: string
  createdByRole: Role
}

interface MaintenanceContextType {
  tasks: MaintenanceTask[]
  createTask: (data: CreateTaskData) => MaintenanceTask
  completeTask: (data: CompleteTaskData) => void
  createAndCompleteTask: (data: CreateAndCompleteData) => MaintenanceTask
  deleteTask: (id: string, deletedBy: string) => void
}

const MaintenanceContext = createContext<MaintenanceContextType | null>(null)

function loadTasks(): MaintenanceTask[] {
  try {
    return JSON.parse(localStorage.getItem(LS_KEY) || '[]')
  } catch {
    return []
  }
}

function saveTasks(tasks: MaintenanceTask[]): boolean {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(tasks))
    return true
  } catch {
    alert('Error: No hay espacio para guardar. Elimina tareas viejas del historial.')
    return false
  }
}

export function MaintenanceProvider({ children }: { children: ReactNode }) {
  const [tasks, setTasks] = useState<MaintenanceTask[]>(loadTasks)

  const createTask = useCallback((data: CreateTaskData): MaintenanceTask => {
    const task: MaintenanceTask = {
      id: generateId(),
      createdBy: data.createdBy,
      createdByRole: data.createdByRole,
      createdAt: new Date().toISOString(),
      description: data.description,
      issuePhoto: data.issuePhoto,
      location: data.location || undefined,
      selfInitiated: false,
      status: 'pendiente',
    }
    setTasks(prev => {
      const updated = [task, ...prev]
      saveTasks(updated)
      return updated
    })
    return task
  }, [])

  const completeTask = useCallback((data: CompleteTaskData) => {
    setTasks(prev => {
      const updated = prev.map(t =>
        t.id === data.taskId
          ? {
              ...t,
              status: 'completado' as const,
              completedBy: data.completedBy,
              completedAt: new Date().toISOString(),
              completionPhoto: data.completionPhoto,
              resolutionNotes: data.resolutionNotes,
              materials: data.materials,
            }
          : t
      )
      saveTasks(updated)
      return updated
    })
  }, [])

  const createAndCompleteTask = useCallback((data: CreateAndCompleteData): MaintenanceTask => {
    const task: MaintenanceTask = {
      id: generateId(),
      createdBy: data.createdBy,
      createdByRole: data.createdByRole,
      createdAt: new Date().toISOString(),
      description: data.description,
      issuePhoto: data.issuePhoto,
      location: data.location || undefined,
      selfInitiated: true,
      status: 'completado',
      completedBy: data.createdBy,
      completedAt: new Date().toISOString(),
      completionPhoto: data.completionPhoto,
      resolutionNotes: data.resolutionNotes,
      materials: data.materials,
    }
    setTasks(prev => {
      const updated = [task, ...prev]
      saveTasks(updated)
      return updated
    })
    return task
  }, [])

  const deleteTask = useCallback((id: string, _deletedBy: string) => {
    setTasks(prev => {
      const updated = prev.filter(t => t.id !== id)
      saveTasks(updated)
      return updated
    })
  }, [])

  return (
    <MaintenanceContext.Provider value={{ tasks, createTask, completeTask, createAndCompleteTask, deleteTask }}>
      {children}
    </MaintenanceContext.Provider>
  )
}

export function useMaintenance() {
  const ctx = useContext(MaintenanceContext)
  if (!ctx) throw new Error('useMaintenance must be used within MaintenanceProvider')
  return ctx
}
