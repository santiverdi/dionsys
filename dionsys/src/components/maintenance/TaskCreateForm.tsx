import { useState } from 'react'
import { ArrowLeft, MapPin, Send, CheckCircle2 } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { useMaintenance } from '../../context/MaintenanceContext'
import PhotoCapture from './PhotoCapture'
import type { MaintenanceMaterial } from '../../types'
import { generateId } from '../../utils/imageCompressor'

interface TaskCreateFormProps {
  onBack: () => void
  onCreated: () => void
}

export default function TaskCreateForm({ onBack, onCreated }: TaskCreateFormProps) {
  const { employee } = useAuth()
  const { createTask, createAndCompleteTask } = useMaintenance()

  const [issuePhoto, setIssuePhoto] = useState<string | null>(null)
  const [description, setDescription] = useState('')
  const [location, setLocation] = useState('')

  // Self-complete fields (for mantenimiento/admin)
  const [alreadyFixed, setAlreadyFixed] = useState(false)
  const [completionPhoto, setCompletionPhoto] = useState<string | null>(null)
  const [resolutionNotes, setResolutionNotes] = useState('')
  const [materials, setMaterials] = useState<MaintenanceMaterial[]>([])

  const [errors, setErrors] = useState<string[]>([])

  const canSelfComplete = employee?.role === 'mantenimiento' || employee?.role === 'admin'

  function handleSubmit() {
    const newErrors: string[] = []
    if (!issuePhoto) newErrors.push('Falta la foto del problema')
    if (!description.trim()) newErrors.push('Falta la descripcion')
    if (alreadyFixed && !completionPhoto) newErrors.push('Falta la foto del arreglo')

    if (newErrors.length > 0) {
      setErrors(newErrors)
      return
    }

    setErrors([])
    if (!employee || !issuePhoto) return

    try {
      if (alreadyFixed && completionPhoto) {
        createAndCompleteTask({
          description: description.trim(),
          issuePhoto,
          location: location.trim() || undefined,
          completionPhoto,
          resolutionNotes: resolutionNotes.trim(),
          materials,
          createdBy: employee.name,
          createdByRole: employee.role,
        })
      } else {
        createTask({
          description: description.trim(),
          issuePhoto,
          location: location.trim() || undefined,
          createdBy: employee.name,
          createdByRole: employee.role,
        })
      }
      onCreated()
    } catch (err) {
      setErrors([`Error al guardar: ${err instanceof Error ? err.message : 'Intenta de nuevo'}`])
    }
  }

  return (
    <div>
      <button onClick={onBack} className="flex items-center gap-2 text-navy-500 hover:text-navy-700 mb-4 transition-colors">
        <ArrowLeft size={18} />
        <span className="text-sm font-medium">Volver</span>
      </button>

      <h2 className="text-xl font-bold text-navy-800 mb-1">
        {canSelfComplete ? 'Nueva tarea / Registro' : 'Reportar problema'}
      </h2>
      <p className="text-sm text-navy-500 mb-6">Saca una foto del problema y agrega una descripcion.</p>

      <div className="space-y-4">
        {/* Issue photo */}
        <div>
          <label className="text-sm font-semibold text-navy-700 mb-2 block">Foto del problema</label>
          <PhotoCapture
            photo={issuePhoto}
            onCapture={setIssuePhoto}
            onRemove={() => setIssuePhoto(null)}
            label="Foto del problema"
          />
        </div>

        {/* Description */}
        <div>
          <label className="text-sm font-semibold text-navy-700 mb-2 block">Descripcion</label>
          <textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="Ej: Canilla del baño gotea, pared con humedad..."
            rows={3}
            className="w-full px-3 py-2 rounded-xl border border-navy-200 text-sm focus:outline-none focus:border-gold-400 resize-none"
          />
        </div>

        {/* Location */}
        <div>
          <label className="text-sm font-semibold text-navy-700 mb-2 block">
            <MapPin size={14} className="inline mr-1" />
            Ubicacion (opcional)
          </label>
          <input
            type="text"
            value={location}
            onChange={e => setLocation(e.target.value)}
            placeholder="Ej: Hab. 205, Lobby, Cocina..."
            className="w-full px-3 py-2 rounded-xl border border-navy-200 text-sm focus:outline-none focus:border-gold-400"
          />
        </div>

        {/* Self-complete toggle */}
        {canSelfComplete && (
          <div className="border-t border-navy-100 pt-4">
            <button
              type="button"
              onClick={() => setAlreadyFixed(!alreadyFixed)}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border-2 transition-all ${
                alreadyFixed
                  ? 'border-green-400 bg-green-50 text-green-700'
                  : 'border-navy-200 bg-white text-navy-600 hover:border-gold-400'
              }`}
            >
              <CheckCircle2 size={20} />
              <span className="font-medium text-sm">Ya lo arregle (registro propio)</span>
            </button>
          </div>
        )}

        {/* Self-complete fields */}
        {alreadyFixed && (
          <div className="space-y-4 border-l-4 border-green-300 pl-4">
            <div>
              <label className="text-sm font-semibold text-navy-700 mb-2 block">Foto del arreglo</label>
              <PhotoCapture
                photo={completionPhoto}
                onCapture={setCompletionPhoto}
                onRemove={() => setCompletionPhoto(null)}
                label="Foto del arreglo terminado"
              />
            </div>

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

            <MaterialsSection materials={materials} onChange={setMaterials} />
          </div>
        )}

        {/* Validation errors */}
        {errors.length > 0 && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-3 space-y-1">
            {errors.map((err, i) => (
              <p key={i} className="text-sm text-red-600 font-medium">• {err}</p>
            ))}
          </div>
        )}

        {/* Submit */}
        <button
          onClick={handleSubmit}
          className="w-full py-3 rounded-xl bg-gold-400 text-navy-900 font-bold text-sm hover:bg-gold-500 active:bg-gold-600 transition-colors flex items-center justify-center gap-2"
        >
          <Send size={18} />
          {alreadyFixed ? 'Registrar tarea completa' : 'Reportar problema'}
        </button>
      </div>
    </div>
  )
}

// Inline materials editor to avoid circular import
export function MaterialsSection({ materials, onChange }: { materials: MaintenanceMaterial[]; onChange: (m: MaintenanceMaterial[]) => void }) {
  const [name, setName] = useState('')
  const [quantity, setQuantity] = useState('')
  const [unit, setUnit] = useState('unidad')
  const [source, setSource] = useState<'stock_propio' | 'compra_externa'>('stock_propio')
  const [cost, setCost] = useState('')
  const [receiptPhoto, setReceiptPhoto] = useState<string | null>(null)

  function addMaterial() {
    if (!name.trim() || !quantity) return

    const mat: MaintenanceMaterial = {
      id: generateId(),
      name: name.trim(),
      quantity: Number(quantity),
      unit,
      source,
      ...(source === 'compra_externa' && {
        cost: cost ? Number(cost) : undefined,
        receiptPhoto: receiptPhoto || undefined,
      }),
    }

    onChange([...materials, mat])
    setName('')
    setQuantity('')
    setUnit('unidad')
    setSource('stock_propio')
    setCost('')
    setReceiptPhoto(null)
  }

  function removeMaterial(id: string) {
    onChange(materials.filter(m => m.id !== id))
  }

  return (
    <div>
      <label className="text-sm font-semibold text-navy-700 mb-2 block">Materiales usados</label>

      {/* Existing materials */}
      {materials.length > 0 && (
        <div className="space-y-2 mb-3">
          {materials.map(m => (
            <div key={m.id} className="flex items-center justify-between bg-navy-50 rounded-lg px-3 py-2">
              <div className="text-sm">
                <span className="font-medium text-navy-800">{m.quantity} {m.unit} - {m.name}</span>
                <span className={`ml-2 text-xs px-2 py-0.5 rounded-full ${
                  m.source === 'stock_propio' ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700'
                }`}>
                  {m.source === 'stock_propio' ? 'Stock' : `Compra $${m.cost ?? 0}`}
                </span>
              </div>
              <button onClick={() => removeMaterial(m.id)} className="text-red-400 hover:text-red-600 text-xs font-medium">
                Quitar
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Add new material form */}
      <div className="bg-white border border-navy-200 rounded-xl p-3 space-y-3">
        <div className="grid grid-cols-3 gap-2">
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Material"
            className="col-span-3 sm:col-span-1 px-3 py-2 rounded-lg border border-navy-200 text-sm focus:outline-none focus:border-gold-400"
          />
          <input
            type="number"
            value={quantity}
            onChange={e => setQuantity(e.target.value)}
            placeholder="Cant."
            min="0"
            step="0.5"
            className="px-3 py-2 rounded-lg border border-navy-200 text-sm focus:outline-none focus:border-gold-400"
          />
          <select
            value={unit}
            onChange={e => setUnit(e.target.value)}
            className="px-3 py-2 rounded-lg border border-navy-200 text-sm focus:outline-none focus:border-gold-400"
          >
            <option value="unidad">unidad</option>
            <option value="kg">kg</option>
            <option value="metro">metro</option>
            <option value="litro">litro</option>
            <option value="rollo">rollo</option>
            <option value="paquete">paquete</option>
          </select>
        </div>

        {/* Source selector */}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setSource('stock_propio')}
            className={`flex-1 py-2 rounded-lg text-xs font-medium transition-colors ${
              source === 'stock_propio'
                ? 'bg-blue-100 text-blue-700 border-2 border-blue-300'
                : 'bg-navy-50 text-navy-500 border-2 border-transparent'
            }`}
          >
            Stock propio
          </button>
          <button
            type="button"
            onClick={() => setSource('compra_externa')}
            className={`flex-1 py-2 rounded-lg text-xs font-medium transition-colors ${
              source === 'compra_externa'
                ? 'bg-amber-100 text-amber-700 border-2 border-amber-300'
                : 'bg-navy-50 text-navy-500 border-2 border-transparent'
            }`}
          >
            Compra externa
          </button>
        </div>

        {/* External purchase fields */}
        {source === 'compra_externa' && (
          <div className="space-y-3">
            <input
              type="number"
              value={cost}
              onChange={e => setCost(e.target.value)}
              placeholder="Monto ($)"
              min="0"
              className="w-full px-3 py-2 rounded-lg border border-navy-200 text-sm focus:outline-none focus:border-gold-400"
            />
            <PhotoCapture
              photo={receiptPhoto}
              onCapture={setReceiptPhoto}
              onRemove={() => setReceiptPhoto(null)}
              label="Foto del ticket"
            />
          </div>
        )}

        <button
          type="button"
          onClick={addMaterial}
          disabled={!name.trim() || !quantity}
          className="w-full py-2 rounded-lg bg-navy-100 text-navy-700 font-medium text-sm hover:bg-navy-200 transition-colors disabled:opacity-40"
        >
          + Agregar material
        </button>
      </div>
    </div>
  )
}
