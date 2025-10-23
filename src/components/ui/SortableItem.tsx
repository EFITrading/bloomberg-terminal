import React from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical } from 'lucide-react'

interface SortableItemProps {
 id: string
 children: React.ReactNode
 className?: string
}

export const SortableItem: React.FC<SortableItemProps> = ({ id, children, className }) => {
 const {
 attributes,
 listeners,
 setNodeRef,
 transform,
 transition,
 isDragging,
 } = useSortable({ id })

 const style = {
 transform: CSS.Transform.toString(transform),
 transition,
 opacity: isDragging ? 0.5 : 1,
 }

 return (
 <div
 ref={setNodeRef}
 style={style}
 className={`relative group ${className || ''}`}
 {...attributes}
 >
 <div
 className="absolute left-0 top-0 bottom-0 w-4 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-grab active:cursor-grabbing"
 {...listeners}
 >
 <GripVertical className="w-3 h-3 text-gray-400" />
 </div>
 <div className="pl-4">
 {children}
 </div>
 </div>
 )
}
