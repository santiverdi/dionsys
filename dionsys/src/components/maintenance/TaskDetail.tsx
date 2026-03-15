import { ArrowLeft, MapPin, User, Calendar, Wrench, Package, Receipt, Trash2 } from 'lucide-react'
import type { MaintenanceTask } from '../../types'
import { useAuth } from '../../context/AuthContext'

interface TaskDetailProps {
  task: MaintenanceTask
  onBack: () => void
  onComplete: () => void
  onDelete: () => void
}

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
    <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${styles[status]}`}>
      {labels[status]}
    </span>
  )
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('es-AR', {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

export default function TaskDetail({ task, onBack, onComplete, onDelete }: TaskDetailProps) {
  const { employee } = useAuth()
  const canComplete = (employee?.role === 'mantenimiento' || employee?.role === 'admin') && task.status === 'pendiente'
  const canDelete = employee?.role === 'admin'

  return (
    <div>
      <button onClick={onBack} className="flex items-center gap-2 text-navy-500 hover:text-navy-700 mb-4 transition-colors">
        <ArrowLeft size={18} />
        <span className="text-sm font-medium">Volver</span>
      </button>

      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold text-navy-800">Detalle de tarea</h2>
        <StatusBadge status={task.status} />
      </div>

      {task.selfInitiated && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 mb-4">
          <p className="text-xs text-blue-700 font-medium">Registro propio de mantenimiento</p>
        </div>
      )}

      {/* Issue section */}
      <div className="mb-6">
        <p className="text-xs font-semibold text-navy-500 uppercase tracking-wide mb-2">Problema reportado</p>
        <img src={task.issuePhoto} alt="Problema" className="w-full h-56 object-cover rounded-xl mb-3" />
        <p className="text-sm text-navy-800">{task.description}</p>

        <div className="flex flex-wrap gap-3 mt-3 text-xs text-navy-500">
          <span className="flex items-center gap-1"><User size={12} />{task.createdBy}</span>
          <span className="flex items-center gap-1"><Calendar size={12} />{formatDate(task.createdAt)}</span>
          {task.location && <span className="flex items-center gap-1"><MapPin size={12} />{task.location}</span>}
        </div>
      </div>

      {/* Completion section */}
      {task.status === 'completado' && (
        <div className="border-t border-navy-100 pt-4 mb-6">
          <p className="text-xs font-semibold text-green-600 uppercase tracking-wide mb-2 flex items-center gap-1">
            <Wrench size={12} /> Resolucion
          </p>

          {task.completionPhoto && (
            <img src={task.completionPhoto} alt="Arreglo" className="w-full h-56 object-cover rounded-xl mb-3" />
          )}

          {task.resolutionNotes && (
            <p className="text-sm text-navy-800 mb-3">{task.resolutionNotes}</p>
          )}

          <div className="flex flex-wrap gap-3 text-xs text-navy-500">
            <span className="flex items-center gap-1"><User size={12} />{task.completedBy}</span>
            {task.completedAt && <span className="flex items-center gap-1"><Calendar size={12} />{formatDate(task.completedAt)}</span>}
          </div>

          {/* Materials */}
          {task.materials && task.materials.length > 0 && (
            <div className="mt-4">
              <p className="text-xs font-semibold text-navy-500 uppercase tracking-wide mb-2 flex items-center gap-1">
                <Package size={12} /> Materiales usados
              </p>
              <div className="space-y-2">
                {task.materials.map(m => (
                  <div key={m.id} className="bg-navy-50 rounded-lg px-3 py-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-navy-800">
                        {m.quantity} {m.unit} - {m.name}
                      </span>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        m.source === 'stock_propio' ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700'
                      }`}>
                        {m.source === 'stock_propio' ? 'Stock' : `Compra $${m.cost ?? 0}`}
                      </span>
                    </div>
                    {m.receiptPhoto && (
                      <div className="mt-2">
                        <p className="text-xs text-navy-400 mb-1 flex items-center gap-1"><Receipt size={10} /> Ticket de compra</p>
                        <img src={m.receiptPhoto} alt="Ticket" className="w-full h-32 object-cover rounded-lg" />
                      </div>
                    )}
                  </div>
                ))}

                {/* Total cost */}
                {task.materials.some(m => m.source === 'compra_externa') && (
                  <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 flex items-center justify-between">
                    <span className="text-sm font-medium text-amber-800">Total compras externas</span>
                    <span className="text-sm font-bold text-amber-700">
                      ${task.materials
                        .filter(m => m.source === 'compra_externa')
                        .reduce((sum, m) => sum + (m.cost ?? 0), 0)
                        .toLocaleString('es-AR')}
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Action buttons */}
      <div className="flex gap-3 mt-4">
        {canComplete && (
          <button
            onClick={onComplete}
            className="flex-1 py-3 rounded-xl bg-green-600 text-white font-bold text-sm hover:bg-green-700 transition-colors flex items-center justify-center gap-2"
          >
            <Wrench size={18} />
            Completar tarea
          </button>
        )}
        {canDelete && (
          <button
            onClick={onDelete}
            className="py-3 px-4 rounded-xl bg-red-100 text-red-700 font-medium text-sm hover:bg-red-200 transition-colors flex items-center justify-center gap-2"
          >
            <Trash2 size={16} />
          </button>
        )}
      </div>
    </div>
  )
}
