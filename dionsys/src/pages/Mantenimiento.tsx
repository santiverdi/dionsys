import { useState, useMemo } from 'react'
import { Plus, ClipboardList, History, Clock, CheckCircle2, MapPin, AlertTriangle } from 'lucide-react'
import { useMaintenance } from '../context/MaintenanceContext'
import { useAuth } from '../context/AuthContext'
import type { MaintenanceTask } from '../types'
import TaskCreateForm from '../components/maintenance/TaskCreateForm'
import TaskCompleteForm from '../components/maintenance/TaskCompleteForm'
import TaskDetail from '../components/maintenance/TaskDetail'
import ConfirmDialog from '../components/ConfirmDialog'

type View = 'list' | 'create' | 'detail' | 'complete'
type Tab = 'pendientes' | 'historial'
type HistoryFilter = 'todos' | 'pendiente' | 'completado'

function StatusBadge({ status }: { status: MaintenanceTask['status'] }) {
  const styles = {
    pendiente: 'bg-amber-100 text-amber-700',
    en_progreso: 'bg-blue-100 text-blue-700',
    completado: 'bg-green-100 text-green-700',
  }
  const labels = {
    pendiente: 'Pendiente',
    en_progreso: 'En progreso',
    completado: 'Completado',
  }
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${styles[status]}`}>
      {labels[status]}
    </span>
  )
}

function TaskCard({ task, onClick }: { task: MaintenanceTask; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="w-full bg-white rounded-xl p-4 shadow-sm border border-navy-100 hover:border-gold-400 hover:shadow-md transition-all text-left"
    >
      <div className="flex gap-3">
        <img src={task.issuePhoto} alt="" className="w-16 h-16 object-cover rounded-lg shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2 mb-1">
            <p className="text-sm font-medium text-navy-800 truncate">{task.description}</p>
            <StatusBadge status={task.status} />
          </div>
          <div className="flex flex-wrap gap-2 text-xs text-navy-400">
            <span className="flex items-center gap-1">
              <Clock size={10} />
              {new Date(task.createdAt).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })}
            </span>
            {task.location && (
              <span className="flex items-center gap-1"><MapPin size={10} />{task.location}</span>
            )}
            <span>{task.createdBy}</span>
          </div>
          {task.selfInitiated && (
            <span className="text-xs text-blue-500 font-medium mt-1 inline-block">Registro propio</span>
          )}
        </div>
      </div>
    </button>
  )
}

export default function Mantenimiento() {
  const { tasks, deleteTask } = useMaintenance()
  const { employee } = useAuth()

  const [view, setView] = useState<View>('list')
  const [tab, setTab] = useState<Tab>('pendientes')
  const [selectedTask, setSelectedTask] = useState<MaintenanceTask | null>(null)
  const [historyFilter, setHistoryFilter] = useState<HistoryFilter>('todos')
  const [confirmDelete, setConfirmDelete] = useState(false)

  const pendientes = useMemo(
    () => tasks.filter(t => t.status === 'pendiente' || t.status === 'en_progreso'),
    [tasks]
  )

  const historyTasks = useMemo(() => {
    if (historyFilter === 'todos') return tasks
    return tasks.filter(t => t.status === historyFilter)
  }, [tasks, historyFilter])

  const monthCosts = useMemo(() => {
    const now = new Date()
    const thisMonth = tasks.filter(t => {
      const d = new Date(t.createdAt)
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear() && t.status === 'completado'
    })
    return thisMonth.reduce((sum, t) => {
      const taskCost = (t.materials ?? [])
        .filter(m => m.source === 'compra_externa')
        .reduce((s, m) => s + (m.cost ?? 0), 0)
      return sum + taskCost
    }, 0)
  }, [tasks])

  const monthCompleted = useMemo(() => {
    const now = new Date()
    return tasks.filter(t => {
      if (t.status !== 'completado' || !t.completedAt) return false
      const d = new Date(t.completedAt)
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
    }).length
  }, [tasks])

  function handleTaskClick(task: MaintenanceTask) {
    setSelectedTask(task)
    setView('detail')
  }

  function handleDeleteRequest() {
    setConfirmDelete(true)
  }

  function handleDeleteConfirm() {
    if (!selectedTask || !employee) return
    deleteTask(selectedTask.id, employee.name)
    setConfirmDelete(false)
    setSelectedTask(null)
    setView('list')
  }

  // --- Sub-views ---
  if (view === 'create') {
    return (
      <TaskCreateForm
        onBack={() => setView('list')}
        onCreated={() => setView('list')}
      />
    )
  }

  if (view === 'complete' && selectedTask) {
    return (
      <TaskCompleteForm
        task={selectedTask}
        onBack={() => setView('detail')}
        onCompleted={() => {
          setSelectedTask(null)
          setView('list')
        }}
      />
    )
  }

  if (view === 'detail' && selectedTask) {
    // Refresh task data from context
    const freshTask = tasks.find(t => t.id === selectedTask.id)
    if (!freshTask) {
      setView('list')
      return null
    }
    return (
      <>
        <TaskDetail
          task={freshTask}
          onBack={() => {
            setSelectedTask(null)
            setView('list')
          }}
          onComplete={() => setView('complete')}
          onDelete={handleDeleteRequest}
        />
        <ConfirmDialog
          open={confirmDelete}
          title="Eliminar tarea"
          message="Esta tarea se eliminara permanentemente. Esta accion no se puede deshacer."
          onConfirm={handleDeleteConfirm}
          onCancel={() => setConfirmDelete(false)}
        />
      </>
    )
  }

  // --- Main list view ---
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-xl font-bold text-navy-800">Mantenimiento</h2>
        <button
          onClick={() => setView('create')}
          className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gold-400 text-navy-900 font-bold text-sm hover:bg-gold-500 transition-colors"
        >
          <Plus size={16} />
          Nueva tarea
        </button>
      </div>
      <p className="text-sm text-navy-500 mb-4">Control de tareas y arreglos del hotel.</p>

      {/* Tabs */}
      <div className="flex gap-1 mb-4 bg-navy-100 rounded-xl p-1">
        <button
          onClick={() => setTab('pendientes')}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-sm font-medium transition-all ${
            tab === 'pendientes' ? 'bg-white text-navy-800 shadow-sm' : 'text-navy-500 hover:text-navy-700'
          }`}
        >
          <ClipboardList size={16} />
          Pendientes
          {pendientes.length > 0 && (
            <span className="bg-amber-100 text-amber-700 text-xs px-1.5 py-0.5 rounded-full font-bold">
              {pendientes.length}
            </span>
          )}
        </button>
        <button
          onClick={() => setTab('historial')}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-sm font-medium transition-all ${
            tab === 'historial' ? 'bg-white text-navy-800 shadow-sm' : 'text-navy-500 hover:text-navy-700'
          }`}
        >
          <History size={16} />
          Historial
        </button>
      </div>

      {/* Pendientes tab */}
      {tab === 'pendientes' && (
        <div>
          {pendientes.length === 0 ? (
            <div className="text-center py-16">
              <CheckCircle2 size={48} className="mx-auto text-green-300 mb-3" />
              <p className="text-navy-400 font-medium">Todo al dia!</p>
              <p className="text-sm text-navy-300 mt-1">No hay tareas pendientes.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {pendientes.map(task => (
                <TaskCard key={task.id} task={task} onClick={() => handleTaskClick(task)} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Historial tab */}
      {tab === 'historial' && (
        <div>
          {/* Month summary */}
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div className="bg-green-50 border border-green-200 rounded-xl p-3 text-center">
              <p className="text-2xl font-bold text-green-700">{monthCompleted}</p>
              <p className="text-xs text-green-600">Completadas este mes</p>
            </div>
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-center">
              <p className="text-2xl font-bold text-amber-700">${monthCosts.toLocaleString('es-AR')}</p>
              <p className="text-xs text-amber-600">Gastos externos</p>
            </div>
          </div>

          {/* Filter pills */}
          <div className="flex gap-2 mb-4">
            {(['todos', 'pendiente', 'completado'] as HistoryFilter[]).map(f => (
              <button
                key={f}
                onClick={() => setHistoryFilter(f)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                  historyFilter === f
                    ? 'bg-navy-800 text-cream'
                    : 'bg-navy-100 text-navy-500 hover:bg-navy-200'
                }`}
              >
                {f === 'todos' ? 'Todos' : f === 'pendiente' ? 'Pendientes' : 'Completados'}
              </button>
            ))}
          </div>

          {historyTasks.length === 0 ? (
            <div className="text-center py-16">
              <AlertTriangle size={48} className="mx-auto text-navy-200 mb-3" />
              <p className="text-navy-400 font-medium">Sin registros</p>
              <p className="text-sm text-navy-300 mt-1">No hay tareas registradas aun.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {historyTasks.map(task => (
                <TaskCard key={task.id} task={task} onClick={() => handleTaskClick(task)} />
              ))}
            </div>
          )}
        </div>
      )}

      <ConfirmDialog
        open={confirmDelete}
        title="Eliminar tarea"
        message="Esta tarea se eliminara permanentemente. Esta accion no se puede deshacer."
        onConfirm={handleDeleteConfirm}
        onCancel={() => setConfirmDelete(false)}
      />
    </div>
  )
}
