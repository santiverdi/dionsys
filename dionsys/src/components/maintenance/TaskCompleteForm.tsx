import { useState } from 'react'
import { ArrowLeft, Send } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { useMaintenance } from '../../context/MaintenanceContext'
import type { MaintenanceTask, MaintenanceMaterial } from '../../types'
import PhotoCapture from './PhotoCapture'
import { MaterialsSection } from './TaskCreateForm'

interface TaskCompleteFormProps {
  task: MaintenanceTask
  onBack: () => void
  onCompleted: () => void
}

export default function TaskCompleteForm({ task, onBack, onCompleted }: TaskCompleteFormProps) {
  const { employee } = useAuth()
  const { completeTask } = useMaintenance()

  const [completionPhoto, setCompletionPhoto] = useState<string | null>(null)
  const [resolutionNotes, setResolutionNotes] = useState('')
  const [materials, setMaterials] = useState<MaintenanceMaterial[]>([])

  const isValid = completionPhoto !== null

  function handleSubmit() {
    if (!employee || !completionPhoto) return

    completeTask({
      taskId: task.id,
      completedBy: employee.name,
      completionPhoto,
      resolutionNotes: resolutionNotes.trim(),
      materials,
    })

    onCompleted()
  }

  return (
    <div>
      <button onClick={onBack} className="flex items-center gap-2 text-navy-500 hover:text-navy-700 mb-4 transition-colors">
        <ArrowLeft size={18} />
        <span className="text-sm font-medium">Volver</span>
      </button>

      <h2 className="text-xl font-bold text-navy-800 mb-1">Completar tarea</h2>
      <p className="text-sm text-navy-500 mb-6">Documenta el arreglo realizado.</p>

      {/* Original issue summary */}
      <div className="bg-navy-50 border border-navy-200 rounded-xl p-4 mb-6">
        <p className="text-xs font-semibold text-navy-500 uppercase tracking-wide mb-2">Problema reportado</p>
        <div className="flex gap-3">
          <img src={task.issuePhoto} alt="Problema" className="w-20 h-20 object-cover rounded-lg shrink-0" />
          <div>
            <p className="text-sm text-navy-800 font-medium">{task.description}</p>
            {task.location && (
              <p className="text-xs text-navy-500 mt-1">📍 {task.location}</p>
            )}
            <p className="text-xs text-navy-400 mt-1">
              Reportado por {task.createdBy} - {new Date(task.createdAt).toLocaleDateString('es-AR')}
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        {/* Completion photo */}
        <div>
          <label className="text-sm font-semibold text-navy-700 mb-2 block">Foto del arreglo terminado</label>
          <PhotoCapture
            photo={completionPhoto}
            onCapture={setCompletionPhoto}
            onRemove={() => setCompletionPhoto(null)}
            label="Foto del arreglo"
          />
        </div>

        {/* Resolution notes */}
        <div>
          <label className="text-sm font-semibold text-navy-700 mb-2 block">Notas de resolucion</label>
          <textarea
            value={resolutionNotes}
            onChange={e => setResolutionNotes(e.target.value)}
            placeholder="Que se hizo para arreglarlo..."
            rows={2}
            className="w-full px-3 py-2 rounded-xl border border-navy-200 text-sm focus:outline-none focus:border-gold-400 resize-none"
          />
        </div>

        {/* Materials */}
        <MaterialsSection materials={materials} onChange={setMaterials} />

        {/* Submit */}
        <button
          onClick={handleSubmit}
          disabled={!isValid}
          className="w-full py-3 rounded-xl bg-green-600 text-white font-bold text-sm hover:bg-green-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          <Send size={18} />
          Finalizar tarea
        </button>
      </div>
    </div>
  )
}
