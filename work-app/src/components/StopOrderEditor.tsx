'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  DndContext,
  PointerSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  arrayMove,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { JobStopStatus } from '@/lib/domain'

export type StopOrderItem = {
  id: string
  sequence_no: number
  name_snapshot: string | null
  address_snapshot: string
  description?: string | null
  status: JobStopStatus
}

function SortableStop({ stop }: { stop: StopOrderItem }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: stop.id })
  return <div
    ref={setNodeRef}
    className="detail-card"
    style={{
      transform: CSS.Transform.toString(transform),
      transition,
      opacity: isDragging ? 0.65 : 1,
      display: 'flex',
      gap: 12,
      alignItems: 'center',
    }}
  >
    <button
      type="button"
      className="button secondary"
      aria-label={`Muuda peatuse ${stop.name_snapshot || stop.address_snapshot} järjekorda`}
      style={{ touchAction: 'none', minWidth: 48 }}
      {...attributes}
      {...listeners}
    >
      ⋮⋮
    </button>
    <div>
      <strong>{stop.name_snapshot || stop.address_snapshot}</strong>
      <small className="muted" style={{ display: 'block' }}>{stop.address_snapshot}</small>
    </div>
  </div>
}

function FixedStop({ stop }: { stop: StopOrderItem }) {
  const labels: Record<JobStopStatus, string> = {
    pending: 'Ootel',
    in_progress: 'Töös',
    done: 'Tehtud',
    skipped: 'Vahele jäetud',
  }
  return <div className="detail-card" style={{ opacity: stop.status === 'pending' ? 1 : 0.72 }}>
    <strong>{stop.name_snapshot || stop.address_snapshot}</strong>
    <small className="muted" style={{ display: 'block' }}>{stop.address_snapshot} · {labels[stop.status]}</small>
  </div>
}

export function StopOrderEditor({
  stops,
  onReorder,
}: {
  stops: StopOrderItem[]
  onReorder: (pendingStopIds: string[]) => void
}) {
  const sorted = useMemo(() => [...stops].sort((a, b) => a.sequence_no - b.sequence_no), [stops])
  const initialPending = useMemo(() => sorted.filter((stop) => stop.status === 'pending').map((stop) => stop.id), [sorted])
  const [pendingIds, setPendingIds] = useState(initialPending)

  useEffect(() => setPendingIds(initialPending), [initialPending])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 5 } }),
  )

  const pendingById = new Map(sorted.filter((stop) => stop.status === 'pending').map((stop) => [stop.id, stop]))
  let pendingIndex = 0
  const displayRows = sorted.map((stop) => {
    if (stop.status !== 'pending') return stop
    const replacement = pendingById.get(pendingIds[pendingIndex]) ?? stop
    pendingIndex += 1
    return replacement
  })

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = pendingIds.indexOf(String(active.id))
    const newIndex = pendingIds.indexOf(String(over.id))
    if (oldIndex < 0 || newIndex < 0) return
    const next = arrayMove(pendingIds, oldIndex, newIndex)
    setPendingIds(next)
    onReorder(next)
  }

  return <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
    <SortableContext items={pendingIds} strategy={verticalListSortingStrategy}>
      <div className="stack">
        {displayRows.map((stop) => stop.status === 'pending'
          ? <SortableStop key={stop.id} stop={stop} />
          : <FixedStop key={stop.id} stop={stop} />)}
      </div>
    </SortableContext>
  </DndContext>
}
