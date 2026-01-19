'use client'

import { FiTrendingDown, FiTrendingUp } from 'react-icons/fi'
import {
    TbArrowUpRight,
    TbArrowsVertical,
    TbLayout,
    TbLine,
    TbMinus,
    TbSelector,
    TbSquare,
    TbTextSize,
    TbX,
} from 'react-icons/tb'

import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'

interface LWChartDrawingToolsProps {
    width: number
    height: number
    isActive: boolean
    onClose: () => void
    drawings: Drawing[]
    setDrawings: (drawings: Drawing[]) => void
    currentTool?: DrawingTool
    setCurrentTool?: (tool: DrawingTool) => void
    isToolLocked?: boolean
    priceToScreen?: (price: number) => number
    screenToPrice?: (y: number) => number
    timeToScreen?: (index: number) => number
    screenToTime?: (x: number) => number
}

type DrawingTool =
    | 'select'
    | 'trendline'
    | 'horizontal'
    | 'rectangle'
    | 'text'
    | 'vertical'
    | 'ray'
    | 'parallelChannel'
    | 'buyZone'
    | 'sellZone'
    | 'priceRange'
    | 'brush'

interface DrawingPoint {
    time: number // Data index
    price: number // Price value
}

interface Drawing {
    id: string
    type: DrawingTool
    points: DrawingPoint[]
    color: string
    text?: string
    lineWidth?: number
    lineStyle?: 'solid' | 'dashed' | 'dotted'
    backgroundColor?: string
    fontWeight?: 'normal' | 'bold'
    fontStyle?: 'normal' | 'italic'
    fontSize?: number
    opacity?: number
    backgroundOpacity?: number
    showMidline?: boolean // For parallel channel
}

export const LWChartDrawingTools: React.FC<LWChartDrawingToolsProps> = ({
    width,
    height,
    isActive,
    onClose,
    drawings,
    setDrawings,
    currentTool: externalCurrentTool,
    setCurrentTool: externalSetCurrentTool,
    isToolLocked = false,
    priceToScreen,
    screenToPrice,
    timeToScreen,
    screenToTime,
}) => {
    const canvasRef = useRef<HTMLCanvasElement>(null)
    const textInputRef = useRef<HTMLInputElement>(null)
    const [internalCurrentTool, setInternalCurrentTool] = useState<DrawingTool>('select')

    // Use external tool state if provided, otherwise use internal
    const currentTool = externalCurrentTool ?? internalCurrentTool
    const setCurrentTool = externalSetCurrentTool ?? setInternalCurrentTool
    const [currentPoints, setCurrentPoints] = useState<DrawingPoint[]>([])
    const [previewPoint, setPreviewPoint] = useState<DrawingPoint | null>(null)
    const [isDrawing, setIsDrawing] = useState(false)
    const [color, setColor] = useState('#22c55e')
    const [selectedDrawing, setSelectedDrawing] = useState<string | null>(null)
    const [textInputVisible, setTextInputVisible] = useState(false)
    const [textInputPosition, setTextInputPosition] = useState<{ x: number; y: number }>({
        x: 0,
        y: 0,
    })
    const [textInputValue, setTextInputValue] = useState('')
    const [draggedDrawing, setDraggedDrawing] = useState<string | null>(null)
    const [dragOffset, setDragOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 })
    const [dragStartDataPoint, setDragStartDataPoint] = useState<{ time: number; price: number } | null>(null)
    const [originalDrawingPoints, setOriginalDrawingPoints] = useState<DrawingPoint[] | null>(null)
    const [isDragging, setIsDragging] = useState(false)
    const [editingDrawing, setEditingDrawing] = useState<string | null>(null)
    const [draggedControlPoint, setDraggedControlPoint] = useState<number | null>(null)
    const [editingTextId, setEditingTextId] = useState<string | null>(null)
    const [propertiesEditorVisible, setPropertiesEditorVisible] = useState(false)
    const [editingPropertiesId, setEditingPropertiesId] = useState<string | null>(null)
    const [tempColor, setTempColor] = useState<string>('#22c55e')
    const [tempBgColor, setTempBgColor] = useState<string>('#22c55e')
    const [isBrushing, setIsBrushing] = useState(false)
    const dragAnimationFrameRef = useRef<number | null>(null)
    const [justCompletedDrawing, setJustCompletedDrawing] = useState(false)
    const pendingUpdateRef = useRef<(() => void) | null>(null)
    const isAnimatingRef = useRef(false)
    const lastDrawingsRef = useRef<Drawing[]>(drawings)
    const pendingMousePositionRef = useRef<{ x: number; y: number } | null>(null)
    const isProcessingDragRef = useRef(false)

    // Batch drawing updates to reduce re-renders
    useEffect(() => {
        lastDrawingsRef.current = drawings
    }, [drawings])

    // Helper function to enable editing a drawing (with completion check)
    const enableDrawingEdit = (drawingId: string) => {
        if (!justCompletedDrawing) {
            setEditingDrawing(drawingId)
            setSelectedDrawing(drawingId)
        }
    }

    // Initialize canvas
    useEffect(() => {
        const canvas = canvasRef.current
        if (!canvas) return

        canvas.width = width
        canvas.height = height
    }, [width, height])

    // Handle keyboard shortcuts for deleting drawings
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if ((e.key === 'Delete' || e.key === 'Backspace') && editingDrawing) {
                setDrawings(drawings.filter((d) => d.id !== editingDrawing))
                setEditingDrawing(null)
                setSelectedDrawing(null)
            }
        }

        window.addEventListener('keydown', handleKeyDown)
        return () => window.removeEventListener('keydown', handleKeyDown)
    }, [editingDrawing, drawings, setDrawings])

    // Global mouseup handler to catch when mouse is released outside canvas
    useEffect(() => {
        const handleGlobalMouseUp = () => {
            if (isDragging) {
                if (dragAnimationFrameRef.current) {
                    cancelAnimationFrame(dragAnimationFrameRef.current)
                    dragAnimationFrameRef.current = null
                }
                isProcessingDragRef.current = false
                pendingMousePositionRef.current = null
                setIsDragging(false)
                setDraggedDrawing(null)
                setDraggedControlPoint(null)
                setDragStartDataPoint(null)
                setOriginalDrawingPoints(null)
            }
        }

        window.addEventListener('mouseup', handleGlobalMouseUp)
        return () => window.removeEventListener('mouseup', handleGlobalMouseUp)
    }, [isDragging])

    // Helper to convert data coordinates to screen coordinates
    const toScreenCoords = (point: DrawingPoint): { x: number; y: number } => {
        if (!priceToScreen || !timeToScreen) {
            return { x: 0, y: 0 }
        }
        return {
            x: timeToScreen(point.time),
            y: priceToScreen(point.price),
        }
    }

    // Draw on canvas with useLayoutEffect for synchronous rendering
    useLayoutEffect(() => {
        const canvas = canvasRef.current
        if (!canvas) return

        const ctx = canvas.getContext('2d')
        if (!ctx) return

        // Clear canvas
        ctx.clearRect(0, 0, canvas.width, canvas.height)

        // Draw all completed drawings
        drawings.forEach((drawing) => {
            const opacity = drawing.opacity ?? 1.0
            ctx.globalAlpha = opacity
            ctx.strokeStyle = drawing.color
            ctx.fillStyle = drawing.color
            ctx.lineWidth = drawing.lineWidth || 2

            // Set line style
            if (drawing.lineStyle === 'dashed') {
                ctx.setLineDash([10, 5])
            } else if (drawing.lineStyle === 'dotted') {
                ctx.setLineDash([2, 3])
            } else {
                ctx.setLineDash([])
            }

            if (drawing.type === 'trendline' && drawing.points.length === 2) {
                const [p1, p2] = drawing.points
                const screen1 = toScreenCoords(p1)
                const screen2 = toScreenCoords(p2)
                ctx.beginPath()
                ctx.moveTo(screen1.x, screen1.y)
                ctx.lineTo(screen2.x, screen2.y)
                ctx.stroke()

                // Show control points if editing
                if (editingDrawing === drawing.id) {
                    ctx.fillStyle = '#3b82f6'
                    ctx.beginPath()
                    ctx.arc(screen1.x, screen1.y, 6, 0, Math.PI * 2)
                    ctx.fill()
                    ctx.beginPath()
                    ctx.arc(screen2.x, screen2.y, 6, 0, Math.PI * 2)
                    ctx.fill()
                }
            } else if (drawing.type === 'ray' && drawing.points.length === 1) {
                const p = drawing.points[0]
                const screenY = priceToScreen ? priceToScreen(p.price) : 0
                const startPoint = toScreenCoords(p)

                // Draw horizontal ray from click point to right edge
                ctx.beginPath()
                ctx.moveTo(startPoint.x, screenY)
                ctx.lineTo(canvas.width, screenY)
                ctx.stroke()

                // Draw price indicator
                ctx.fillStyle = drawing.color
                ctx.fillRect(canvas.width - 80, screenY - 12, 75, 24)
                ctx.globalAlpha = 1.0
                ctx.fillStyle = '#000000'
                ctx.font = '20px monospace'
                ctx.fillText(p.price.toFixed(2), canvas.width - 75, screenY + 6)
                ctx.globalAlpha = opacity

                // Show control point if editing
                if (editingDrawing === drawing.id) {
                    ctx.fillStyle = '#3b82f6'
                    ctx.beginPath()
                    ctx.arc(startPoint.x, screenY, 6, 0, Math.PI * 2)
                    ctx.fill()
                }
            } else if (drawing.type === 'horizontal' && drawing.points.length === 1) {
                const p = drawing.points[0]
                const screenY = priceToScreen ? priceToScreen(p.price) : 0
                const startPoint = toScreenCoords(p)
                ctx.beginPath()
                ctx.moveTo(startPoint.x, screenY)
                ctx.lineTo(canvas.width, screenY)
                ctx.stroke()

                // Draw price indicator
                ctx.fillStyle = drawing.color
                ctx.fillRect(canvas.width - 80, screenY - 12, 75, 24)
                ctx.globalAlpha = 1.0
                ctx.fillStyle = '#000000'
                ctx.font = '20px monospace'
                ctx.fillText(p.price.toFixed(2), canvas.width - 75, screenY + 6)
                ctx.globalAlpha = opacity

                // Show control point if editing
                if (editingDrawing === drawing.id) {
                    ctx.fillStyle = '#3b82f6'
                    ctx.beginPath()
                    ctx.arc(canvas.width / 2, screenY, 6, 0, Math.PI * 2)
                    ctx.fill()
                }
            } else if (drawing.type === 'vertical' && drawing.points.length === 1) {
                const p = drawing.points[0]
                const screenX = timeToScreen!(p.time)

                ctx.strokeStyle = drawing.color
                ctx.beginPath()
                ctx.moveTo(screenX, 0)
                ctx.lineTo(screenX, canvas.height)
                ctx.stroke()

                // Show control point if editing
                if (editingDrawing === drawing.id) {
                    ctx.fillStyle = '#3b82f6'
                    ctx.beginPath()
                    ctx.arc(screenX, canvas.height / 2, 6, 0, Math.PI * 2)
                    ctx.fill()
                }
            } else if (drawing.type === 'rectangle' && drawing.points.length === 2) {
                const [p1, p2] = drawing.points
                const screen1 = toScreenCoords(p1)
                const screen2 = toScreenCoords(p2)
                const w = screen2.x - screen1.x
                const h = screen2.y - screen1.y

                // Fill with background color if specified
                if (drawing.backgroundColor) {
                    const bgOpacity = drawing.backgroundOpacity ?? 0.3
                    ctx.globalAlpha = bgOpacity
                    ctx.fillStyle = drawing.backgroundColor
                    ctx.fillRect(screen1.x, screen1.y, w, h)
                    ctx.globalAlpha = opacity
                }

                ctx.strokeStyle = drawing.color
                ctx.strokeRect(screen1.x, screen1.y, w, h)

                // Show control points if editing
                if (editingDrawing === drawing.id) {
                    ctx.fillStyle = '#3b82f6'
                    ctx.beginPath()
                    ctx.arc(screen1.x, screen1.y, 6, 0, Math.PI * 2)
                    ctx.fill()
                    ctx.beginPath()
                    ctx.arc(screen2.x, screen2.y, 6, 0, Math.PI * 2)
                    ctx.fill()
                }
            } else if (
                (drawing.type === 'buyZone' || drawing.type === 'sellZone') &&
                drawing.points.length === 2
            ) {
                const [p1, p2] = drawing.points
                const screen1 = toScreenCoords(p1)
                const screen2 = toScreenCoords(p2)

                // Draw horizontal rectangle spanning the width between p1.time and p2.time
                const x1 = Math.min(screen1.x, screen2.x)
                const x2 = Math.max(screen1.x, screen2.x)
                const y = screen1.y
                const defaultHeight = 40 // Default height of zone
                const rectY = y - defaultHeight / 2

                // Fill zone
                const zoneColor = drawing.type === 'buyZone' ? '#22c55e' : '#ef4444'
                ctx.globalAlpha = 0.2
                ctx.fillStyle = zoneColor
                ctx.fillRect(x1, rectY, x2 - x1, defaultHeight)
                ctx.globalAlpha = opacity

                // Draw border
                ctx.strokeStyle = zoneColor
                ctx.lineWidth = 2
                ctx.strokeRect(x1, rectY, x2 - x1, defaultHeight)

                // Show control points if editing (left and right edges)
                if (editingDrawing === drawing.id) {
                    ctx.fillStyle = '#3b82f6'
                    // Left edge control point
                    ctx.beginPath()
                    ctx.arc(x1, y, 8, 0, Math.PI * 2)
                    ctx.fill()
                    // Right edge control point
                    ctx.beginPath()
                    ctx.arc(x2, y, 8, 0, Math.PI * 2)
                    ctx.fill()
                }
            } else if (drawing.type === 'priceRange' && drawing.points.length === 2) {
                const [p1, p2] = drawing.points
                const screen1 = toScreenCoords(p1)
                const screen2 = toScreenCoords(p2)

                const x = screen1.x
                const y1 = Math.min(screen1.y, screen2.y)
                const y2 = Math.max(screen1.y, screen2.y)

                // Draw top horizontal line
                ctx.strokeStyle = drawing.color
                ctx.lineWidth = drawing.lineWidth || 2
                ctx.beginPath()
                ctx.moveTo(x - 30, y1)
                ctx.lineTo(x + 30, y1)
                ctx.stroke()

                // Draw vertical line connecting them
                ctx.beginPath()
                ctx.moveTo(x, y1)
                ctx.lineTo(x, y2)
                ctx.stroke()

                // Draw bottom horizontal line
                ctx.beginPath()
                ctx.moveTo(x - 30, y2)
                ctx.lineTo(x + 30, y2)
                ctx.stroke()

                // Calculate price difference and percentage
                const priceDiff = p2.price - p1.price
                const percentChange = ((priceDiff / p1.price) * 100).toFixed(2)
                const displayText = `${priceDiff.toFixed(2)} (${percentChange}%)`

                // Draw info box in the middle
                const midY = (y1 + y2) / 2
                ctx.font = 'bold 13px sans-serif'
                const textWidth = ctx.measureText(displayText).width
                const padding = 8
                const boxWidth = textWidth + padding * 2
                const boxHeight = 24
                const boxX = x + 40
                const boxY = midY - boxHeight / 2

                // Background box
                ctx.fillStyle = priceDiff >= 0 ? '#1e40af' : '#ef4444'
                ctx.fillRect(boxX, boxY, boxWidth, boxHeight)

                // Text
                ctx.fillStyle = '#fff'
                ctx.textAlign = 'center'
                ctx.textBaseline = 'middle'
                ctx.fillText(displayText, boxX + boxWidth / 2, boxY + boxHeight / 2)
                ctx.textAlign = 'left'
                ctx.textBaseline = 'alphabetic'

                // Show control points if editing
                if (editingDrawing === drawing.id) {
                    ctx.fillStyle = '#3b82f6'
                    ctx.beginPath()
                    ctx.arc(x, y1, 8, 0, Math.PI * 2)
                    ctx.fill()
                    ctx.beginPath()
                    ctx.arc(x, y2, 8, 0, Math.PI * 2)
                    ctx.fill()
                }
            } else if (drawing.type === 'brush' && drawing.points.length > 1) {
                // Draw brush stroke as connected path
                ctx.strokeStyle = drawing.color
                ctx.lineWidth = drawing.lineWidth || 3
                ctx.lineCap = 'round'
                ctx.lineJoin = 'round'

                ctx.beginPath()
                const firstPoint = toScreenCoords(drawing.points[0])
                ctx.moveTo(firstPoint.x, firstPoint.y)

                for (let i = 1; i < drawing.points.length; i++) {
                    const point = toScreenCoords(drawing.points[i])
                    ctx.lineTo(point.x, point.y)
                }

                ctx.stroke()
            } else if (drawing.type === 'text' && drawing.points.length === 1 && drawing.text) {
                const p = drawing.points[0]
                const screen = toScreenCoords(p)
                ctx.fillStyle = drawing.color
                const weight = drawing.fontWeight || 'bold'
                const style = drawing.fontStyle || 'normal'
                const size = drawing.fontSize || 16
                ctx.font = `${style} ${weight} ${size}px sans-serif`

                // Draw background if specified
                if (drawing.backgroundColor) {
                    const metrics = ctx.measureText(drawing.text)
                    const bgOpacity = drawing.backgroundOpacity ?? 0.3
                    ctx.globalAlpha = bgOpacity
                    ctx.fillStyle = drawing.backgroundColor
                    ctx.fillRect(screen.x - 2, screen.y - size, metrics.width + 4, size + 4)
                    ctx.globalAlpha = opacity
                    ctx.fillStyle = drawing.color
                }

                ctx.fillText(drawing.text, screen.x, screen.y)

                // Show control point if editing
                if (editingDrawing === drawing.id) {
                    ctx.fillStyle = '#3b82f6'
                    ctx.beginPath()
                    ctx.arc(screen.x, screen.y, 6, 0, Math.PI * 2)
                    ctx.fill()
                }
            } else if (drawing.type === 'parallelChannel' && drawing.points.length === 3) {
                // Draw completed parallel channel
                const [p1, p2, p3] = drawing.points
                const screen1 = toScreenCoords(p1)
                const screen2 = toScreenCoords(p2)
                const screen3 = toScreenCoords(p3)

                // Calculate offset vector from p1 to p3
                const offsetX = screen3.x - screen1.x
                const offsetY = screen3.y - screen1.y

                // Draw filled area between lines if backgroundColor is set
                if (drawing.backgroundColor) {
                    ctx.fillStyle = drawing.backgroundColor
                    ctx.globalAlpha = drawing.backgroundOpacity ?? 0.3
                    ctx.beginPath()
                    ctx.moveTo(screen1.x, screen1.y)
                    ctx.lineTo(screen2.x, screen2.y)
                    ctx.lineTo(screen2.x + offsetX, screen2.y + offsetY)
                    ctx.lineTo(screen1.x + offsetX, screen1.y + offsetY)
                    ctx.closePath()
                    ctx.fill()
                    ctx.globalAlpha = drawing.opacity ?? 1.0
                }

                // Draw base line (p1 to p2)
                ctx.beginPath()
                ctx.moveTo(screen1.x, screen1.y)
                ctx.lineTo(screen2.x, screen2.y)
                ctx.stroke()

                // Draw parallel line (p1+offset to p2+offset)
                ctx.beginPath()
                ctx.moveTo(screen1.x + offsetX, screen1.y + offsetY)
                ctx.lineTo(screen2.x + offsetX, screen2.y + offsetY)
                ctx.stroke()

                // Draw midline if enabled
                if (drawing.showMidline) {
                    ctx.save()
                    ctx.setLineDash([5, 5])
                    ctx.beginPath()
                    ctx.moveTo(screen1.x + offsetX / 2, screen1.y + offsetY / 2)
                    ctx.lineTo(screen2.x + offsetX / 2, screen2.y + offsetY / 2)
                    ctx.stroke()
                    ctx.restore()
                }

                // Show control points if editing
                if (editingDrawing === drawing.id) {
                    ctx.fillStyle = '#3b82f6'
                    // Point 1
                    ctx.beginPath()
                    ctx.arc(screen1.x, screen1.y, 6, 0, Math.PI * 2)
                    ctx.fill()
                    // Point 2
                    ctx.beginPath()
                    ctx.arc(screen2.x, screen2.y, 6, 0, Math.PI * 2)
                    ctx.fill()
                    // Point 3
                    ctx.beginPath()
                    ctx.arc(screen3.x, screen3.y, 6, 0, Math.PI * 2)
                    ctx.fill()
                    // Fourth corner (derived)
                    ctx.beginPath()
                    ctx.arc(screen2.x + offsetX, screen2.y + offsetY, 6, 0, Math.PI * 2)
                    ctx.fill()
                }
            }

            // Reset globalAlpha
            ctx.globalAlpha = 1.0
        })

        // Draw current drawing in progress
        if (currentPoints.length > 0) {
            ctx.strokeStyle = color
            ctx.fillStyle = color
            ctx.lineWidth = 2
            ctx.setLineDash([5, 5])

            // For 2-point tools, show preview
            if (currentTool === 'trendline' && currentPoints.length === 1 && previewPoint) {
                const p1 = currentPoints[0]
                const p2 = previewPoint
                const screen1 = toScreenCoords(p1)
                const screen2 = toScreenCoords(p2)
                ctx.beginPath()
                ctx.moveTo(screen1.x, screen1.y)
                ctx.lineTo(screen2.x, screen2.y)
                ctx.stroke()
            } else if (currentTool === 'rectangle' && currentPoints.length === 1 && previewPoint) {
                const p1 = currentPoints[0]
                const p2 = previewPoint
                const screen1 = toScreenCoords(p1)
                const screen2 = toScreenCoords(p2)
                const w = screen2.x - screen1.x
                const h = screen2.y - screen1.y
                ctx.strokeRect(screen1.x, screen1.y, w, h)
            } else if (
                (currentTool === 'buyZone' || currentTool === 'sellZone') &&
                currentPoints.length === 1 &&
                previewPoint
            ) {
                const p1 = currentPoints[0]
                const p2 = previewPoint
                const screen1 = toScreenCoords(p1)
                const screen2 = toScreenCoords(p2)
                const x1 = Math.min(screen1.x, screen2.x)
                const x2 = Math.max(screen1.x, screen2.x)
                const defaultHeight = 40
                const rectY = screen1.y - defaultHeight / 2

                const zoneColor = currentTool === 'buyZone' ? '#22c55e' : '#ef4444'
                ctx.globalAlpha = 0.2
                ctx.fillStyle = zoneColor
                ctx.fillRect(x1, rectY, x2 - x1, defaultHeight)
                ctx.globalAlpha = 1.0
                ctx.strokeStyle = zoneColor
                ctx.lineWidth = 2
                ctx.setLineDash([])
                ctx.strokeRect(x1, rectY, x2 - x1, defaultHeight)
            } else if (currentTool === 'priceRange' && currentPoints.length === 1 && previewPoint) {
                const p1 = currentPoints[0]
                const p2 = previewPoint
                const screen1 = toScreenCoords(p1)
                const screen2 = toScreenCoords(p2)

                const x = screen1.x
                const y1 = Math.min(screen1.y, screen2.y)
                const y2 = Math.max(screen1.y, screen2.y)

                // Draw preview lines
                ctx.strokeStyle = color
                ctx.lineWidth = 2
                ctx.setLineDash([5, 5])

                // Top line
                ctx.beginPath()
                ctx.moveTo(x - 30, y1)
                ctx.lineTo(x + 30, y1)
                ctx.stroke()

                // Vertical line
                ctx.beginPath()
                ctx.moveTo(x, y1)
                ctx.lineTo(x, y2)
                ctx.stroke()

                // Bottom line
                ctx.beginPath()
                ctx.moveTo(x - 30, y2)
                ctx.lineTo(x + 30, y2)
                ctx.stroke()

                ctx.setLineDash([])
            } else if (currentTool === 'brush' && currentPoints.length > 0) {
                // Draw brush preview while drawing
                ctx.strokeStyle = color
                ctx.lineWidth = 3
                ctx.lineCap = 'round'
                ctx.lineJoin = 'round'

                ctx.beginPath()
                const firstPoint = toScreenCoords(currentPoints[0])
                ctx.moveTo(firstPoint.x, firstPoint.y)

                for (let i = 1; i < currentPoints.length; i++) {
                    const point = toScreenCoords(currentPoints[i])
                    ctx.lineTo(point.x, point.y)
                }

                ctx.stroke()
                ctx.setLineDash([])
            } else if (currentTool === 'parallelChannel' && previewPoint) {
                if (currentPoints.length === 1) {
                    // After first click - show line from p1 to cursor
                    const screen1 = toScreenCoords(currentPoints[0])
                    const screen2 = toScreenCoords(previewPoint)

                    ctx.beginPath()
                    ctx.moveTo(screen1.x, screen1.y)
                    ctx.lineTo(screen2.x, screen2.y)
                    ctx.stroke()

                    // Show point 1
                    ctx.fillStyle = color
                    ctx.beginPath()
                    ctx.arc(screen1.x, screen1.y, 6, 0, Math.PI * 2)
                    ctx.fill()
                } else if (currentPoints.length === 2) {
                    // After second click - show BOTH parallel lines
                    const screen1 = toScreenCoords(currentPoints[0])
                    const screen2 = toScreenCoords(currentPoints[1])
                    const screen3 = toScreenCoords(previewPoint)

                    // Calculate offset from p1 to cursor
                    const offsetX = screen3.x - screen1.x
                    const offsetY = screen3.y - screen1.y

                    // Draw base line (p1 to p2)
                    ctx.beginPath()
                    ctx.moveTo(screen1.x, screen1.y)
                    ctx.lineTo(screen2.x, screen2.y)
                    ctx.stroke()

                    // Draw parallel line (p1+offset to p2+offset)
                    ctx.beginPath()
                    ctx.moveTo(screen1.x + offsetX, screen1.y + offsetY)
                    ctx.lineTo(screen2.x + offsetX, screen2.y + offsetY)
                    ctx.stroke()

                    // Show placed points
                    ctx.fillStyle = color
                    ctx.beginPath()
                    ctx.arc(screen1.x, screen1.y, 6, 0, Math.PI * 2)
                    ctx.fill()
                    ctx.beginPath()
                    ctx.arc(screen2.x, screen2.y, 6, 0, Math.PI * 2)
                    ctx.fill()
                }
            }

            ctx.setLineDash([])
        }
    })

    const handleCanvasClick = (e: React.MouseEvent<HTMLElement>) => {
        // In select mode, don't handle clicks (let them pass through)
        if (currentTool === 'select' || !screenToPrice || !screenToTime) return

        e.stopPropagation()
        e.preventDefault()

        const canvas = canvasRef.current
        if (!canvas) return

        const rect = canvas.getBoundingClientRect()
        const x = e.clientX - rect.left
        const y = e.clientY - rect.top

        // Convert screen coordinates to data coordinates
        const point: DrawingPoint = {
            time: screenToTime(x),
            price: screenToPrice(y),
        }

        if (currentTool === 'horizontal') {
            // Complete immediately for horizontal lines
            const newDrawing: Drawing = {
                id: Date.now().toString(),
                type: 'horizontal',
                points: [point],
                color,
            }
            setDrawings([...drawings, newDrawing])
            setCurrentPoints([])
            setPreviewPoint(null)
            setEditingDrawing(null)
            setJustCompletedDrawing(true)
            setTimeout(() => setJustCompletedDrawing(false), 100)
            if (!isToolLocked) setCurrentTool('select')
        } else if (currentTool === 'vertical') {
            // Complete immediately for vertical lines
            const newDrawing: Drawing = {
                id: Date.now().toString(),
                type: 'vertical',
                points: [point],
                color,
            }
            setDrawings([...drawings, newDrawing])
            setCurrentPoints([])
            setPreviewPoint(null)
            setEditingDrawing(null)
            setJustCompletedDrawing(true)
            setTimeout(() => setJustCompletedDrawing(false), 100)
            if (!isToolLocked) setCurrentTool('select')
        } else if (currentTool === 'text') {
            // Show text input at clicked position (use screen coords for input position)
            setTextInputPosition({ x, y })
            setTextInputValue('')
            setTextInputVisible(true)
            setCurrentPoints([point]) // Store data coords
            setTimeout(() => {
                textInputRef.current?.focus()
            }, 0)
        } else if (currentTool === 'ray') {
            // Complete immediately for ray (horizontal line from point)
            const newDrawing: Drawing = {
                id: Date.now().toString(),
                type: 'ray',
                points: [point],
                color,
                lineWidth: 2,
            }
            setDrawings([...drawings, newDrawing])
            setCurrentPoints([])
            setPreviewPoint(null)
            setEditingDrawing(null)
            setJustCompletedDrawing(true)
            setTimeout(() => setJustCompletedDrawing(false), 100)
            if (!isToolLocked) setCurrentTool('select')
        } else if (currentTool === 'buyZone' || currentTool === 'sellZone') {
            const newPoints = [...currentPoints, point]

            if (newPoints.length === 2) {
                // Complete the zone with default green/red color
                const zoneColor = currentTool === 'buyZone' ? '#22c55e' : '#ef4444'
                const newDrawing: Drawing = {
                    id: Date.now().toString(),
                    type: currentTool,
                    points: newPoints,
                    color: zoneColor,
                    lineWidth: 2,
                }
                setDrawings([...drawings, newDrawing])
                setCurrentPoints([])
                setPreviewPoint(null)
                setEditingDrawing(null)
                setJustCompletedDrawing(true)
                setTimeout(() => setJustCompletedDrawing(false), 100)
                if (!isToolLocked) setCurrentTool('select')
            } else {
                setCurrentPoints(newPoints)
                setPreviewPoint(null)
            }
        } else if (currentTool === 'priceRange') {
            const newPoints = [...currentPoints, point]

            if (newPoints.length === 2) {
                // Complete the price range
                const newDrawing: Drawing = {
                    id: Date.now().toString(),
                    type: currentTool,
                    points: newPoints,
                    color: color,
                    lineWidth: 2,
                }
                setDrawings([...drawings, newDrawing])
                setCurrentPoints([])
                setPreviewPoint(null)
                setEditingDrawing(null)
                setJustCompletedDrawing(true)
                setTimeout(() => setJustCompletedDrawing(false), 100)
                if (!isToolLocked) setCurrentTool('select')
            } else {
                setCurrentPoints(newPoints)
                setPreviewPoint(null)
            }
        } else if (currentTool === 'trendline' || currentTool === 'rectangle') {
            const newPoints = [...currentPoints, point]

            if (newPoints.length === 2) {
                // Complete the drawing
                const newDrawing: Drawing = {
                    id: Date.now().toString(),
                    type: currentTool,
                    points: newPoints,
                    color,
                }
                setDrawings([...drawings, newDrawing])
                setCurrentPoints([])
                setPreviewPoint(null)
                setEditingDrawing(null)
                setJustCompletedDrawing(true)
                setTimeout(() => setJustCompletedDrawing(false), 100)
                if (!isToolLocked) setCurrentTool('select')
            } else {
                setCurrentPoints(newPoints)
                setPreviewPoint(null)
            }
        } else if (currentTool === 'parallelChannel') {
            const newPoints = [...currentPoints, point]

            if (newPoints.length === 3) {
                // Third click - complete the parallel channel
                const newDrawing: Drawing = {
                    id: Date.now().toString(),
                    type: 'parallelChannel',
                    points: newPoints,
                    color,
                }
                setDrawings([...drawings, newDrawing])
                setCurrentPoints([])
                setPreviewPoint(null)
                setEditingDrawing(null)
                setJustCompletedDrawing(true)
                setTimeout(() => setJustCompletedDrawing(false), 100)
                if (!isToolLocked) setCurrentTool('select')
            } else {
                // First or second click - continue building
                setCurrentPoints(newPoints)
                setPreviewPoint(null)
            }
        }
    }

    const handleCanvasMouseMove = (e: React.MouseEvent<HTMLElement>) => {
        const canvas = canvasRef.current
        if (!canvas || !screenToPrice || !screenToTime) return

        const rect = canvas.getBoundingClientRect()
        const x = e.clientX - rect.left
        const y = e.clientY - rect.top

        // Handle brush tool - add points while mouse is down
        if (isBrushing && currentTool === 'brush') {
            e.stopPropagation()
            e.preventDefault()
            const point: DrawingPoint = {
                time: screenToTime(x),
                price: screenToPrice(y),
            }
            setCurrentPoints([...currentPoints, point])
            return
        }

        // Only handle if actively dragging something or using a drawing tool
        if (!isDragging && currentTool === 'select') return

        // Store the latest mouse position for batched processing
        pendingMousePositionRef.current = { x, y }

        // If already processing, skip and let RAF handle it
        if (isProcessingDragRef.current) return

        isProcessingDragRef.current = true

        // Use requestAnimationFrame to batch drag updates
        if (dragAnimationFrameRef.current) {
            cancelAnimationFrame(dragAnimationFrameRef.current)
        }

        dragAnimationFrameRef.current = requestAnimationFrame(() => {
            isProcessingDragRef.current = false
            const position = pendingMousePositionRef.current
            if (!position) return

            const { x: currentX, y: currentY } = position

            // Handle dragging control point to reshape drawing
            if (isDragging && draggedControlPoint !== null && editingDrawing) {
                const newDataPoint = {
                    time: screenToTime(currentX),
                    price: screenToPrice(currentY),
                }

                const updatedDrawings = drawings.map((drawing) => {
                    if (drawing.id === editingDrawing) {
                        if (drawing.type === 'trendline') {
                            const newPoints = [...drawing.points]
                            newPoints[draggedControlPoint] = newDataPoint
                            return { ...drawing, points: newPoints }
                        } else if (drawing.type === 'rectangle') {
                            const p1 = drawing.points[0]
                            const p2 = drawing.points[1]

                            let newP1 = { ...p1 }
                            let newP2 = { ...p2 }

                            // Current bounds
                            const minX = Math.min(p1.time, p2.time)
                            const maxX = Math.max(p1.time, p2.time)
                            const minY = Math.min(p1.price, p2.price)
                            const maxY = Math.max(p1.price, p2.price)

                            // Determine which corner is which based on current bounds
                            const p1IsMinX = p1.time === minX
                            const p1IsMinY = p1.price === minY

                            // Map control points to actual corners
                            // 0=top-left, 1=top-right, 2=bottom-right, 3=bottom-left
                            if (draggedControlPoint === 0) { // Top-left
                                newP1 = { time: newDataPoint.time, price: newDataPoint.price }
                                newP2 = { time: maxX, price: maxY }
                            } else if (draggedControlPoint === 1) { // Top-right
                                newP1 = { time: minX, price: newDataPoint.price }
                                newP2 = { time: newDataPoint.time, price: maxY }
                            } else if (draggedControlPoint === 2) { // Bottom-right
                                newP1 = { time: minX, price: minY }
                                newP2 = { time: newDataPoint.time, price: newDataPoint.price }
                            } else if (draggedControlPoint === 3) { // Bottom-left
                                newP1 = { time: newDataPoint.time, price: minY }
                                newP2 = { time: maxX, price: newDataPoint.price }
                            } else if (draggedControlPoint === 4) { // Top edge
                                newP1 = { time: minX, price: newDataPoint.price }
                                newP2 = { time: maxX, price: maxY }
                            } else if (draggedControlPoint === 5) { // Right edge
                                newP1 = { time: minX, price: minY }
                                newP2 = { time: newDataPoint.time, price: maxY }
                            } else if (draggedControlPoint === 6) { // Bottom edge
                                newP1 = { time: minX, price: minY }
                                newP2 = { time: maxX, price: newDataPoint.price }
                            } else if (draggedControlPoint === 7) { // Left edge
                                newP1 = { time: newDataPoint.time, price: minY }
                                newP2 = { time: maxX, price: maxY }
                            }

                            return {
                                ...drawing,
                                points: [newP1, newP2]
                            }
                        } else if (drawing.type === 'ray') {
                            return {
                                ...drawing,
                                points: [{ time: drawing.points[0].time, price: newDataPoint.price }],
                            }
                        } else if (drawing.type === 'parallelChannel' && drawing.points.length === 3) {
                            const newPoints = [...drawing.points]
                            const [p1, p2, p3] = drawing.points

                            if (draggedControlPoint === 0) {
                                // Dragging corner point 1 (first line start)
                                newPoints[0] = newDataPoint
                            } else if (draggedControlPoint === 1) {
                                // Dragging corner point 2 (first line end)
                                newPoints[1] = newDataPoint
                            } else if (draggedControlPoint === 2) {
                                // Dragging corner point 3 (second line start)
                                newPoints[2] = newDataPoint
                            } else if (draggedControlPoint === 3) {
                                // Dragging corner point 4 (second line end)
                                // Calculate the offset needed so that p2 + offset = newDataPoint
                                const offsetX = p3.time - p1.time
                                const offsetY = p3.price - p1.price
                                // We need new p3 such that p2 + (newP3 - p1) = newDataPoint
                                // So: newP3 = newDataPoint - p2 + p1
                                newPoints[2] = {
                                    time: newDataPoint.time - p2.time + p1.time,
                                    price: newDataPoint.price - p2.price + p1.price,
                                }
                            } else if (draggedControlPoint === 4 || draggedControlPoint === 5) {
                                // Dragging orange middle points - adjust perpendicular distance
                                const lineAngle = Math.atan2(p2.price - p1.price, p2.time - p1.time)
                                const perpAngle = lineAngle + Math.PI / 2

                                const dTime = newDataPoint.time - p1.time
                                const dPrice = newDataPoint.price - p1.price

                                const distanceAlong = dTime * Math.cos(perpAngle) + dPrice * Math.sin(perpAngle)

                                newPoints[2] = {
                                    time: p1.time + distanceAlong * Math.cos(perpAngle),
                                    price: p1.price + distanceAlong * Math.sin(perpAngle),
                                }
                            }

                            return { ...drawing, points: newPoints }
                        } else if (
                            (drawing.type === 'buyZone' || drawing.type === 'sellZone') &&
                            drawing.points.length === 2
                        ) {
                            const p1 = drawing.points[0]
                            const p2 = drawing.points[1]

                            let newP1 = { ...p1 }
                            let newP2 = { ...p2 }

                            if (draggedControlPoint === 0) {
                                // Dragging left edge - move the left side freely
                                newP1 = { time: newDataPoint.time, price: p1.price }
                                newP2 = { time: p2.time, price: p2.price }
                            } else if (draggedControlPoint === 1) {
                                // Dragging right edge - move the right side freely
                                newP1 = { time: p1.time, price: p1.price }
                                newP2 = { time: newDataPoint.time, price: p2.price }
                            }

                            return { ...drawing, points: [newP1, newP2] }
                        } else if (drawing.type === 'priceRange' && drawing.points.length === 2) {
                            const newPoints = [...drawing.points]

                            if (draggedControlPoint === 0) {
                                // Dragging first point - adjust price only
                                newPoints[0] = { time: newPoints[0].time, price: newDataPoint.price }
                            } else if (draggedControlPoint === 1) {
                                // Dragging second point - adjust price only
                                newPoints[1] = { time: newPoints[1].time, price: newDataPoint.price }
                            }

                            return { ...drawing, points: newPoints }
                        } else if (drawing.type === 'horizontal') {
                            return {
                                ...drawing,
                                points: [{ time: drawing.points[0].time, price: newDataPoint.price }],
                            }
                        } else if (drawing.type === 'vertical') {
                            return {
                                ...drawing,
                                points: [{ time: newDataPoint.time, price: drawing.points[0].price }],
                            }
                        } else if (drawing.type === 'text') {
                            return {
                                ...drawing,
                                points: [newDataPoint],
                            }
                        }
                    }
                    return drawing
                })

                setDrawings(updatedDrawings)
                return
            }

            // Handle dragging entire drawing
            if (isDragging && draggedDrawing && dragStartDataPoint && originalDrawingPoints) {
                // Current mouse position in data coordinates
                const currentDataPoint = {
                    time: screenToTime(currentX),
                    price: screenToPrice(currentY),
                }

                // Calculate the delta from where we started dragging
                const dTime = currentDataPoint.time - dragStartDataPoint.time
                const dPrice = currentDataPoint.price - dragStartDataPoint.price

                const updatedDrawings = drawings.map((drawing) => {
                    if (drawing.id === draggedDrawing) {
                        if (
                            drawing.type === 'trendline' ||
                            drawing.type === 'rectangle' ||
                            drawing.type === 'text' ||
                            drawing.type === 'ray' ||
                            drawing.type === 'parallelChannel' ||
                            drawing.type === 'buyZone' ||
                            drawing.type === 'sellZone' ||
                            drawing.type === 'priceRange' ||
                            drawing.type === 'brush'
                        ) {
                            return {
                                ...drawing,
                                points: originalDrawingPoints.map((p) => ({
                                    time: p.time + dTime,
                                    price: p.price + dPrice,
                                })),
                            }
                        } else if (drawing.type === 'horizontal') {
                            return {
                                ...drawing,
                                points: [{ time: drawing.points[0].time, price: drawing.points[0].price + dPrice }],
                            }
                        } else if (drawing.type === 'vertical') {
                            return {
                                ...drawing,
                                points: [{ time: drawing.points[0].time + dTime, price: drawing.points[0].price }],
                            }
                        }
                    }
                    return drawing
                })

                setDrawings(updatedDrawings)
                return
            }

            // Handle drawing preview
            if (currentPoints.length === 0 || currentTool === 'select') return

            // For parallel channel, allow preview with 1 or 2 points
            if (currentTool === 'parallelChannel') {
                if (currentPoints.length !== 1 && currentPoints.length !== 2) return
            } else {
                // For other tools, only show preview with 1 point
                if (currentPoints.length !== 1) return
            }

            // Update preview point for visual feedback
            setPreviewPoint({
                time: screenToTime(currentX),
                price: screenToPrice(currentY),
            })
        })
    }

    const isPointNearControlPoint = (x: number, y: number, drawing: Drawing): number | null => {
        const threshold = 8

        if (drawing.type === 'trendline' || drawing.type === 'rectangle') {
            if (drawing.points.length === 2) {
                const screen1 = toScreenCoords(drawing.points[0])
                const screen2 = toScreenCoords(drawing.points[1])

                const dist1 = Math.sqrt(Math.pow(x - screen1.x, 2) + Math.pow(y - screen1.y, 2))
                if (dist1 < threshold) return 0

                const dist2 = Math.sqrt(Math.pow(x - screen2.x, 2) + Math.pow(y - screen2.y, 2))
                if (dist2 < threshold) return 1
            }
        } else if (drawing.type === 'ray' && drawing.points.length === 1) {
            const p = drawing.points[0]
            const screenY = priceToScreen ? priceToScreen(p.price) : 0
            const screenX = timeToScreen ? timeToScreen(p.time) : 0
            const dist = Math.sqrt(Math.pow(x - screenX, 2) + Math.pow(y - screenY, 2))
            if (dist < threshold) return 0
        } else if (drawing.type === 'horizontal' && drawing.points.length === 1) {
            const screenY = priceToScreen ? priceToScreen(drawing.points[0].price) : 0
            if (Math.abs(y - screenY) < threshold) return 0
        } else if (drawing.type === 'text' && drawing.points.length === 1) {
            const screen = toScreenCoords(drawing.points[0])
            const dist = Math.sqrt(Math.pow(x - screen.x, 2) + Math.pow(y - screen.y, 2))
            if (dist < threshold) return 0
        } else if (drawing.type === 'parallelChannel' && drawing.points.length === 3) {
            // Check all 6 control points (4 corners + 2 middles)
            const screen1 = toScreenCoords(drawing.points[0])
            const screen2 = toScreenCoords(drawing.points[1])
            const screen3 = toScreenCoords(drawing.points[2])
            const offsetX = screen3.x - screen1.x
            const offsetY = screen3.y - screen1.y

            // Check corner point 1
            const dist1 = Math.sqrt(Math.pow(x - screen1.x, 2) + Math.pow(y - screen1.y, 2))
            if (dist1 < threshold) return 0

            // Check corner point 2
            const dist2 = Math.sqrt(Math.pow(x - screen2.x, 2) + Math.pow(y - screen2.y, 2))
            if (dist2 < threshold) return 1

            // Check corner point 3 (p3 - second line start)
            const dist3 = Math.sqrt(Math.pow(x - screen3.x, 2) + Math.pow(y - screen3.y, 2))
            if (dist3 < threshold) return 2

            // Check corner point 4 (p2 + offset - second line end)
            const corner4X = screen2.x + offsetX
            const corner4Y = screen2.y + offsetY
            const dist4 = Math.sqrt(Math.pow(x - corner4X, 2) + Math.pow(y - corner4Y, 2))
            if (dist4 < threshold) return 3

            // Check middle point 1 (on first line) - Orange
            const mid1X = (screen1.x + screen2.x) / 2
            const mid1Y = (screen1.y + screen2.y) / 2
            const distMid1 = Math.sqrt(Math.pow(x - mid1X, 2) + Math.pow(y - mid1Y, 2))
            if (distMid1 < threshold) return 4

            // Check middle point 2 (on second line) - Orange
            const mid2X = mid1X + offsetX
            const mid2Y = mid1Y + offsetY
            const distMid2 = Math.sqrt(Math.pow(x - mid2X, 2) + Math.pow(y - mid2Y, 2))
            if (distMid2 < threshold) return 5
        } else if (
            (drawing.type === 'buyZone' || drawing.type === 'sellZone') &&
            drawing.points.length === 2
        ) {
            const screen1 = toScreenCoords(drawing.points[0])
            const screen2 = toScreenCoords(drawing.points[1])
            const x1 = Math.min(screen1.x, screen2.x)
            const x2 = Math.max(screen1.x, screen2.x)
            const y = screen1.y

            // Check left edge
            const distLeft = Math.sqrt(Math.pow(x - x1, 2) + Math.pow(y - y, 2))
            if (distLeft < threshold) return 0

            // Check right edge
            const distRight = Math.sqrt(Math.pow(x - x2, 2) + Math.pow(y - y, 2))
            if (distRight < threshold) return 1
        }

        return null
    }

    const isPointNearDrawing = (x: number, y: number, drawing: Drawing): boolean => {
        const threshold = 10

        if (drawing.type === 'trendline' && drawing.points.length === 2) {
            const [p1, p2] = drawing.points
            const screen1 = toScreenCoords(p1)
            const screen2 = toScreenCoords(p2)

            // Check if point is near the line
            const d =
                Math.abs(
                    (screen2.y - screen1.y) * x -
                    (screen2.x - screen1.x) * y +
                    screen2.x * screen1.y -
                    screen2.y * screen1.x
                ) / Math.sqrt(Math.pow(screen2.y - screen1.y, 2) + Math.pow(screen2.x - screen1.x, 2))

            // Check if point is within line segment bounds
            const minX = Math.min(screen1.x, screen2.x) - threshold
            const maxX = Math.max(screen1.x, screen2.x) + threshold
            const minY = Math.min(screen1.y, screen2.y) - threshold
            const maxY = Math.max(screen1.y, screen2.y) + threshold

            return d < threshold && x >= minX && x <= maxX && y >= minY && y <= maxY
        } else if (drawing.type === 'ray' && drawing.points.length === 1) {
            const p = drawing.points[0]
            const screenY = priceToScreen ? priceToScreen(p.price) : 0
            const screenX = timeToScreen ? timeToScreen(p.time) : 0

            // Check if point is near the horizontal ray line (from click point to right)
            return Math.abs(y - screenY) < threshold && x >= screenX
        } else if (drawing.type === 'horizontal' && drawing.points.length === 1) {
            const screenY = priceToScreen ? priceToScreen(drawing.points[0].price) : 0
            const screenX = timeToScreen ? timeToScreen(drawing.points[0].time) : 0
            // Check if point is near the horizontal line (from click point to right)
            return Math.abs(y - screenY) < threshold && x >= screenX
        } else if (drawing.type === 'rectangle' && drawing.points.length === 2) {
            const [p1, p2] = drawing.points
            const screen1 = toScreenCoords(p1)
            const screen2 = toScreenCoords(p2)
            const minX = Math.min(screen1.x, screen2.x)
            const maxX = Math.max(screen1.x, screen2.x)
            const minY = Math.min(screen1.y, screen2.y)
            const maxY = Math.max(screen1.y, screen2.y)
            return (
                x >= minX - threshold &&
                x <= maxX + threshold &&
                y >= minY - threshold &&
                y <= maxY + threshold
            )
        } else if (drawing.type === 'text' && drawing.points.length === 1) {
            const p = drawing.points[0]
            const screen = toScreenCoords(p)
            const textWidth = (drawing.text?.length || 0) * 10 // Approximate width
            return (
                x >= screen.x - threshold &&
                x <= screen.x + textWidth + threshold &&
                y >= screen.y - 20 &&
                y <= screen.y + threshold
            )
        } else if (drawing.type === 'parallelChannel' && drawing.points.length === 3) {
            // Check if near either parallel line
            const [p1, p2, p3] = drawing.points
            const screen1 = toScreenCoords(p1)
            const screen2 = toScreenCoords(p2)
            const screen3 = toScreenCoords(p3)

            const offsetX = screen3.x - screen1.x
            const offsetY = screen3.y - screen1.y

            // Check first line (p1 to p2)
            const d1 =
                Math.abs(
                    (screen2.y - screen1.y) * x -
                    (screen2.x - screen1.x) * y +
                    screen2.x * screen1.y -
                    screen2.y * screen1.x
                ) / Math.sqrt(Math.pow(screen2.y - screen1.y, 2) + Math.pow(screen2.x - screen1.x, 2))
            const minX1 = Math.min(screen1.x, screen2.x) - threshold
            const maxX1 = Math.max(screen1.x, screen2.x) + threshold
            const minY1 = Math.min(screen1.y, screen2.y) - threshold
            const maxY1 = Math.max(screen1.y, screen2.y) + threshold

            if (d1 < threshold && x >= minX1 && x <= maxX1 && y >= minY1 && y <= maxY1) {
                return true
            }

            // Check second line (p1+offset to p2+offset)
            const line2_p1_x = screen1.x + offsetX
            const line2_p1_y = screen1.y + offsetY
            const line2_p2_x = screen2.x + offsetX
            const line2_p2_y = screen2.y + offsetY

            const d2 =
                Math.abs(
                    (line2_p2_y - line2_p1_y) * x -
                    (line2_p2_x - line2_p1_x) * y +
                    line2_p2_x * line2_p1_y -
                    line2_p2_y * line2_p1_x
                ) / Math.sqrt(Math.pow(line2_p2_y - line2_p1_y, 2) + Math.pow(line2_p2_x - line2_p1_x, 2))
            const minX2 = Math.min(line2_p1_x, line2_p2_x) - threshold
            const maxX2 = Math.max(line2_p1_x, line2_p2_x) + threshold
            const minY2 = Math.min(line2_p1_y, line2_p2_y) - threshold
            const maxY2 = Math.max(line2_p1_y, line2_p2_y) + threshold

            return d2 < threshold && x >= minX2 && x <= maxX2 && y >= minY2 && y <= maxY2
        } else if (
            (drawing.type === 'buyZone' || drawing.type === 'sellZone') &&
            drawing.points.length === 2
        ) {
            const [p1, p2] = drawing.points
            const screen1 = toScreenCoords(p1)
            const screen2 = toScreenCoords(p2)
            const x1 = Math.min(screen1.x, screen2.x)
            const x2 = Math.max(screen1.x, screen2.x)
            const y = screen1.y
            const defaultHeight = 40
            const rectY = y - defaultHeight / 2

            // Check if point is within the zone rectangle
            return x >= x1 && x <= x2 && y >= rectY && y <= rectY + defaultHeight
        }
        return false
    }

    const handleCanvasMouseDown = (e: React.MouseEvent<HTMLElement>) => {
        const canvas = canvasRef.current
        if (!canvas) return

        const rect = canvas.getBoundingClientRect()
        const x = e.clientX - rect.left
        const y = e.clientY - rect.top

        // Handle brush tool - start recording points
        if (currentTool === 'brush' && screenToPrice && screenToTime) {
            e.stopPropagation()
            e.preventDefault()
            setIsBrushing(true)
            const point: DrawingPoint = {
                time: screenToTime(x),
                price: screenToPrice(y),
            }
            setCurrentPoints([point])
            return
        }

        // If not in select mode, drawing tools will handle it
        if (currentTool !== 'select') {
            return
        }

        // In select mode: check if clicking on a drawing
        let clickedOnDrawing = false

        // Check if clicking on a control point of the editing drawing
        if (editingDrawing) {
            const drawing = drawings.find((d) => d.id === editingDrawing)
            if (drawing) {
                const controlPointIndex = isPointNearControlPoint(x, y, drawing)
                if (controlPointIndex !== null) {
                    e.stopPropagation()
                    e.preventDefault()
                    setDraggedControlPoint(controlPointIndex)
                    setIsDragging(true)
                    clickedOnDrawing = true
                    return
                }
            }
        }

        // Check if clicking on an existing drawing
        for (let i = drawings.length - 1; i >= 0; i--) {
            const controlPointIndex = isPointNearControlPoint(x, y, drawings[i])
            if (controlPointIndex !== null) {
                e.stopPropagation()
                e.preventDefault()
                // Clicked on a control point, enter editing mode
                setEditingDrawing(drawings[i].id)
                setDraggedControlPoint(controlPointIndex)
                setIsDragging(true)
                setSelectedDrawing(drawings[i].id)
                clickedOnDrawing = true
                return
            }

            if (isPointNearDrawing(x, y, drawings[i])) {
                e.stopPropagation()
                e.preventDefault()
                // Clicked on drawing body, enter editing mode and store initial data coordinates
                setEditingDrawing(drawings[i].id)
                setDraggedDrawing(drawings[i].id)
                setDragOffset({ x, y })
                setDragStartDataPoint({
                    time: screenToTime ? screenToTime(x) : 0,
                    price: screenToPrice ? screenToPrice(y) : 0
                })
                // Store the original drawing points so we can apply delta to them
                setOriginalDrawingPoints([...drawings[i].points])
                setIsDragging(true)
                setSelectedDrawing(drawings[i].id)
                clickedOnDrawing = true
                return
            }
        }

        // Clicked on empty space - clear selection but let event pass through
        if (!clickedOnDrawing) {
            setEditingDrawing(null)
            setSelectedDrawing(null)
            // Don't prevent/stop - let chart handle it
        }
    }

    const handleCanvasMouseUp = () => {
        // Finish brush stroke
        if (isBrushing && currentTool === 'brush' && currentPoints.length > 1) {
            const newDrawing: Drawing = {
                id: Date.now().toString(),
                type: 'brush',
                points: currentPoints,
                color: color,
                lineWidth: 3,
            }
            setDrawings([...drawings, newDrawing])
            setCurrentPoints([])
            setIsBrushing(false)
            setEditingDrawing(null)
            setJustCompletedDrawing(true)
            setTimeout(() => setJustCompletedDrawing(false), 100)
            if (!isToolLocked) setCurrentTool('select')
            return
        }

        if (isDragging) {
            if (dragAnimationFrameRef.current) {
                cancelAnimationFrame(dragAnimationFrameRef.current)
                dragAnimationFrameRef.current = null
            }
            isProcessingDragRef.current = false
            pendingMousePositionRef.current = null
            setIsDragging(false)
            setDraggedDrawing(null)
            setDraggedControlPoint(null)
            setDragStartDataPoint(null)
            setOriginalDrawingPoints(null)
            setEditingDrawing(null)
        }
    }

    const handleCanvasDoubleClick = (e: React.MouseEvent<HTMLElement>) => {
        const canvas = canvasRef.current
        if (!canvas) return

        const rect = canvas.getBoundingClientRect()
        const x = e.clientX - rect.left
        const y = e.clientY - rect.top

        // Check if double-clicking on any drawing
        let clickedOnDrawing = false
        for (let i = drawings.length - 1; i >= 0; i--) {
            const drawing = drawings[i]
            if (isPointNearDrawing(x, y, drawing)) {
                e.preventDefault()
                e.stopPropagation()
                clickedOnDrawing = true

                if (drawing.type === 'text' && e.shiftKey) {
                    // Shift+DoubleClick on text: edit text content
                    const textScreen = toScreenCoords(drawing.points[0])
                    setEditingTextId(drawing.id)
                    setTextInputVisible(true)
                    setTextInputValue(drawing.text || '')
                    setTextInputPosition({ x: textScreen.x, y: textScreen.y })
                    setTimeout(() => {
                        textInputRef.current?.focus()
                        textInputRef.current?.select()
                    }, 0)
                } else {
                    // DoubleClick on any drawing: show properties editor
                    setEditingPropertiesId(drawing.id)
                    setPropertiesEditorVisible(true)
                }

                // Clear any text selection caused by double-click
                if (window.getSelection) {
                    window.getSelection()?.removeAllRanges()
                }
                return
            }
        }

        // If not clicking on a drawing, let the event pass through to chart
    }

    const clearDrawings = () => {
        setDrawings([])
        setCurrentPoints([])
        setPreviewPoint(null)
        setCurrentTool('select')
    }

    const handleTextInputComplete = () => {
        if (editingTextId) {
            // Update existing text drawing
            if (textInputValue.trim()) {
                setDrawings(
                    drawings.map((d) => (d.id === editingTextId ? { ...d, text: textInputValue } : d))
                )
            }
            setEditingTextId(null)
        } else if (currentPoints.length === 1 && textInputValue.trim()) {
            // Create new text drawing
            const newDrawing: Drawing = {
                id: Date.now().toString(),
                type: 'text',
                points: currentPoints,
                color,
                text: textInputValue,
            }
            setDrawings([...drawings, newDrawing])
        }
        setTextInputVisible(false)
        setTextInputValue('')
        setCurrentPoints([])
        setPreviewPoint(null)
        setEditingDrawing(null)
        setJustCompletedDrawing(true)
        setTimeout(() => setJustCompletedDrawing(false), 100)
        if (!isToolLocked) setCurrentTool('select')
    }

    const handleTextInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            handleTextInputComplete()
        } else if (e.key === 'Escape') {
            setTextInputVisible(false)
            setTextInputValue('')
            setCurrentPoints([])
            setEditingTextId(null)
            setEditingDrawing(null)
            if (!isToolLocked) setCurrentTool('select')
        }
    }

    return (
        <div
            style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: `${width}px`,
                height: `${height}px`,
                pointerEvents: 'none',
                zIndex: 1000,
            }}
        >
            {/* Toolbar - Only show when active and using internal tool state */}
            {isActive && !externalCurrentTool && (
                <div
                    style={{
                        position: 'absolute',
                        top: '10px',
                        left: '10px',
                        background: 'rgba(0, 0, 0, 0.9)',
                        border: '2px solid #22c55e',
                        borderRadius: '8px',
                        padding: '12px',
                        display: 'flex',
                        flexWrap: 'wrap',
                        gap: '8px',
                        alignItems: 'center',
                        boxShadow: '0 4px 12px rgba(34, 197, 94, 0.3)',
                        zIndex: 101,
                        maxWidth: '95%',
                        pointerEvents: 'auto',
                    }}
                >
                    {/* Tool Buttons */}
                    <button
                        onClick={() => setCurrentTool('select')}
                        style={{
                            padding: '8px',
                            background: currentTool === 'select' ? '#22c55e' : 'transparent',
                            color: currentTool === 'select' ? '#000' : '#22c55e',
                            border: '1px solid #22c55e',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                        }}
                        title="Select"
                    >
                        <TbSelector size={18} />
                    </button>

                    <button
                        onClick={() => {
                            setCurrentTool('trendline')
                            setCurrentPoints([])
                        }}
                        style={{
                            padding: '8px',
                            background: currentTool === 'trendline' ? '#22c55e' : 'transparent',
                            color: currentTool === 'trendline' ? '#000' : '#22c55e',
                            border: '1px solid #22c55e',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                        }}
                        title="Trendline"
                    >
                        <TbLine size={18} />
                    </button>

                    <button
                        onClick={() => {
                            setCurrentTool('horizontal')
                            setCurrentPoints([])
                        }}
                        style={{
                            padding: '8px',
                            background: currentTool === 'horizontal' ? '#22c55e' : 'transparent',
                            color: currentTool === 'horizontal' ? '#000' : '#22c55e',
                            border: '1px solid #22c55e',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                        }}
                        title="Horizontal Line"
                    >
                        <TbMinus size={18} />
                    </button>

                    <button
                        onClick={() => {
                            setCurrentTool('vertical')
                            setCurrentPoints([])
                        }}
                        style={{
                            padding: '8px',
                            background: currentTool === 'vertical' ? '#22c55e' : 'transparent',
                            color: currentTool === 'vertical' ? '#000' : '#22c55e',
                            border: '1px solid #22c55e',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                        }}
                        title="Vertical Line"
                    >
                        <TbArrowsVertical size={18} />
                    </button>

                    <button
                        onClick={() => {
                            setCurrentTool('ray')
                            setCurrentPoints([])
                        }}
                        style={{
                            padding: '8px',
                            background: currentTool === 'ray' ? '#22c55e' : 'transparent',
                            color: currentTool === 'ray' ? '#000' : '#22c55e',
                            border: '1px solid #22c55e',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                        }}
                        title="Ray"
                    >
                        <TbArrowUpRight size={18} />
                    </button>

                    <button
                        onClick={() => {
                            setCurrentTool('rectangle')
                            setCurrentPoints([])
                        }}
                        style={{
                            padding: '8px',
                            background: currentTool === 'rectangle' ? '#22c55e' : 'transparent',
                            color: currentTool === 'rectangle' ? '#000' : '#22c55e',
                            border: '1px solid #22c55e',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                        }}
                        title="Rectangle"
                    >
                        <TbSquare size={18} />
                    </button>

                    <button
                        onClick={() => {
                            setCurrentTool('text')
                            setCurrentPoints([])
                        }}
                        style={{
                            padding: '8px',
                            background: currentTool === 'text' ? '#22c55e' : 'transparent',
                            color: currentTool === 'text' ? '#000' : '#22c55e',
                            border: '1px solid #22c55e',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                        }}
                        title="Text"
                    >
                        <TbTextSize size={18} />
                    </button>

                    <button
                        onClick={() => {
                            setCurrentTool('parallelChannel')
                            setCurrentPoints([])
                        }}
                        style={{
                            padding: '8px',
                            background: currentTool === 'parallelChannel' ? '#22c55e' : 'transparent',
                            color: currentTool === 'parallelChannel' ? '#000' : '#22c55e',
                            border: '1px solid #22c55e',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                        }}
                        title="Parallel Channel"
                    >
                        <TbLayout size={18} />
                    </button>

                    <button
                        onClick={() => {
                            setCurrentTool('buyZone')
                            setCurrentPoints([])
                        }}
                        style={{
                            padding: '8px',
                            background: currentTool === 'buyZone' ? '#22c55e' : 'transparent',
                            color: currentTool === 'buyZone' ? '#000' : '#22c55e',
                            border: '1px solid #22c55e',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                        }}
                        title="Buy Zone"
                    >
                        <FiTrendingUp size={18} />
                    </button>

                    <button
                        onClick={() => {
                            setCurrentTool('sellZone')
                            setCurrentPoints([])
                        }}
                        style={{
                            padding: '8px',
                            background: currentTool === 'sellZone' ? '#ef4444' : 'transparent',
                            color: currentTool === 'sellZone' ? '#000' : '#ef4444',
                            border: '1px solid #ef4444',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                        }}
                        title="Sell Zone"
                    >
                        <FiTrendingDown size={18} />
                    </button>

                    <div style={{ width: '1px', height: '24px', background: '#22c55e', margin: '0 4px' }} />

                    {/* Color Picker */}
                    <input
                        type="color"
                        value={color}
                        onChange={(e) => setColor(e.target.value)}
                        style={{
                            width: '32px',
                            height: '32px',
                            border: '1px solid #22c55e',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            background: 'transparent',
                        }}
                        title="Color"
                    />

                    <button
                        onClick={clearDrawings}
                        style={{
                            padding: '8px 12px',
                            background: 'transparent',
                            color: '#ef4444',
                            border: '1px solid #ef4444',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            fontSize: '12px',
                            fontWeight: 'bold',
                        }}
                    >
                        Clear
                    </button>

                    <button
                        onClick={onClose}
                        style={{
                            padding: '8px',
                            background: 'transparent',
                            color: '#22c55e',
                            border: '1px solid #22c55e',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                        }}
                    >
                        <TbX size={18} />
                    </button>
                </div>
            )}

            {/* Invisible Event Capture Layer */}
            <div
                onClick={handleCanvasClick}
                onDoubleClick={handleCanvasDoubleClick}
                onMouseDown={handleCanvasMouseDown}
                onMouseMove={handleCanvasMouseMove}
                onMouseUp={handleCanvasMouseUp}
                onMouseLeave={handleCanvasMouseUp}
                style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: '100%',
                    pointerEvents: currentTool !== 'select' || isDragging ? 'auto' : 'none',
                    cursor: currentTool === 'select' ? (isDragging ? 'grabbing' : 'default') : 'crosshair',
                    zIndex: 1001,
                }}
            />

            {/* Separate layer for clicking on drawings when in select mode */}
            {currentTool === 'select' &&
                drawings.length > 0 &&
                (() => {
                    return (
                        <svg
                            style={{
                                position: 'absolute',
                                top: 0,
                                left: 0,
                                width: '100%',
                                height: '100%',
                                zIndex: 1002,
                                pointerEvents: 'none',
                            }}
                        >
                            {drawings.map((drawing) => {
                                if (drawing.type === 'trendline' && drawing.points.length === 2) {
                                    const p1 = toScreenCoords(drawing.points[0])
                                    const p2 = toScreenCoords(drawing.points[1])
                                    return (
                                        <line
                                            key={drawing.id}
                                            x1={p1.x}
                                            y1={p1.y}
                                            x2={p2.x}
                                            y2={p2.y}
                                            stroke="transparent"
                                            strokeWidth="20"
                                            style={{ pointerEvents: 'stroke', cursor: 'pointer' }}
                                            onClick={(e) => {
                                                e.stopPropagation()
                                                enableDrawingEdit(drawing.id)
                                            }}
                                            onMouseDown={(e) => {
                                                e.stopPropagation()
                                                e.preventDefault()
                                                const rect = e.currentTarget.ownerSVGElement?.getBoundingClientRect()
                                                if (rect && !justCompletedDrawing) {
                                                    setEditingDrawing(drawing.id)
                                                    setSelectedDrawing(drawing.id)
                                                    setDraggedDrawing(drawing.id)
                                                    setDragOffset({ x: e.clientX - rect.left, y: e.clientY - rect.top })
                                                    setIsDragging(true)
                                                }
                                            }}
                                            onDoubleClick={(e) => {
                                                e.stopPropagation()
                                                e.preventDefault()

                                                setIsDragging(false)
                                                setDraggedDrawing(null)

                                                setEditingPropertiesId(drawing.id)
                                                setPropertiesEditorVisible(true)
                                                if (window.getSelection) {
                                                    window.getSelection()?.removeAllRanges()
                                                }
                                            }}
                                        />
                                    )
                                } else if (drawing.type === 'ray' && drawing.points.length === 1) {
                                    const p = drawing.points[0]
                                    const screenY = priceToScreen ? priceToScreen(p.price) : 0
                                    const screenX = timeToScreen ? timeToScreen(p.time) : 0
                                    return (
                                        <line
                                            key={drawing.id}
                                            x1={screenX}
                                            y1={screenY}
                                            x2={width}
                                            y2={screenY}
                                            stroke="transparent"
                                            strokeWidth="20"
                                            style={{ pointerEvents: 'stroke', cursor: 'pointer' }}
                                            onClick={(e) => {
                                                e.stopPropagation()
                                                enableDrawingEdit(drawing.id)
                                            }}
                                            onMouseDown={(e) => {
                                                e.stopPropagation()
                                                e.preventDefault()
                                                const rect = e.currentTarget.ownerSVGElement?.getBoundingClientRect()
                                                if (rect && !justCompletedDrawing) {
                                                    setEditingDrawing(drawing.id)
                                                    setSelectedDrawing(drawing.id)
                                                    setDraggedDrawing(drawing.id)
                                                    setDragOffset({ x: e.clientX - rect.left, y: e.clientY - rect.top })
                                                    setIsDragging(true)
                                                }
                                            }}
                                            onDoubleClick={(e) => {
                                                e.stopPropagation()
                                                e.preventDefault()

                                                setIsDragging(false)
                                                setDraggedDrawing(null)

                                                setEditingPropertiesId(drawing.id)
                                                setPropertiesEditorVisible(true)
                                                if (window.getSelection) {
                                                    window.getSelection()?.removeAllRanges()
                                                }
                                            }}
                                        />
                                    )
                                } else if (drawing.type === 'horizontal' && drawing.points.length === 1) {
                                    const y = priceToScreen ? priceToScreen(drawing.points[0].price) : 0
                                    const x = timeToScreen ? timeToScreen(drawing.points[0].time) : 0
                                    return (
                                        <line
                                            key={drawing.id}
                                            x1={x}
                                            y1={y}
                                            x2={width}
                                            y2={y}
                                            stroke="transparent"
                                            strokeWidth="20"
                                            style={{ pointerEvents: 'stroke', cursor: 'pointer' }}
                                            onClick={(e) => {
                                                e.stopPropagation()
                                                enableDrawingEdit(drawing.id)
                                            }}
                                            onMouseDown={(e) => {
                                                e.stopPropagation()
                                                e.preventDefault()
                                                const rect = e.currentTarget.ownerSVGElement?.getBoundingClientRect()
                                                if (rect && !justCompletedDrawing) {
                                                    setEditingDrawing(drawing.id)
                                                    setSelectedDrawing(drawing.id)
                                                    setDraggedDrawing(drawing.id)
                                                    setDragOffset({ x: e.clientX - rect.left, y: e.clientY - rect.top })
                                                    setIsDragging(true)
                                                }
                                            }}
                                            onDoubleClick={(e) => {
                                                e.stopPropagation()
                                                e.preventDefault()

                                                setIsDragging(false)
                                                setDraggedDrawing(null)

                                                setEditingPropertiesId(drawing.id)
                                                setPropertiesEditorVisible(true)
                                                if (window.getSelection) {
                                                    window.getSelection()?.removeAllRanges()
                                                }
                                            }}
                                        />
                                    )
                                } else if (drawing.type === 'vertical' && drawing.points.length === 1) {
                                    const x = timeToScreen ? timeToScreen(drawing.points[0].time) : 0
                                    return (
                                        <line
                                            key={drawing.id}
                                            x1={x}
                                            y1={0}
                                            x2={x}
                                            y2={height}
                                            stroke="transparent"
                                            strokeWidth="20"
                                            style={{ pointerEvents: 'stroke', cursor: 'pointer' }}
                                            onClick={(e) => {
                                                e.stopPropagation()
                                                enableDrawingEdit(drawing.id)
                                            }}
                                            onMouseDown={(e) => {
                                                e.stopPropagation()
                                                e.preventDefault()
                                                const rect = e.currentTarget.ownerSVGElement?.getBoundingClientRect()
                                                if (rect && !justCompletedDrawing) {
                                                    setEditingDrawing(drawing.id)
                                                    setSelectedDrawing(drawing.id)
                                                    setDraggedDrawing(drawing.id)
                                                    setDragOffset({ x: e.clientX - rect.left, y: e.clientY - rect.top })
                                                    setIsDragging(true)
                                                }
                                            }}
                                            onDoubleClick={(e) => {
                                                e.stopPropagation()
                                                e.preventDefault()

                                                setIsDragging(false)
                                                setDraggedDrawing(null)

                                                setEditingPropertiesId(drawing.id)
                                                setPropertiesEditorVisible(true)
                                                if (window.getSelection) {
                                                    window.getSelection()?.removeAllRanges()
                                                }
                                            }}
                                        />
                                    )
                                } else if (drawing.type === 'rectangle' && drawing.points.length === 2) {
                                    const p1 = toScreenCoords(drawing.points[0])
                                    const p2 = toScreenCoords(drawing.points[1])
                                    const x = Math.min(p1.x, p2.x)
                                    const y = Math.min(p1.y, p2.y)
                                    const w = Math.abs(p2.x - p1.x)
                                    const h = Math.abs(p2.y - p1.y)
                                    return (
                                        <rect
                                            key={drawing.id}
                                            x={x}
                                            y={y}
                                            width={w}
                                            height={h}
                                            fill="transparent"
                                            stroke="transparent"
                                            strokeWidth="20"
                                            style={{ pointerEvents: 'all', cursor: 'pointer' }}
                                            onClick={(e) => {
                                                e.stopPropagation()
                                                enableDrawingEdit(drawing.id)
                                            }}
                                            onMouseDown={(e) => {
                                                e.stopPropagation()
                                                e.preventDefault()
                                                const rect = e.currentTarget.ownerSVGElement?.getBoundingClientRect()
                                                if (rect && !justCompletedDrawing) {
                                                    setEditingDrawing(drawing.id)
                                                    setSelectedDrawing(drawing.id)
                                                    setDraggedDrawing(drawing.id)
                                                    setDragOffset({ x: e.clientX - rect.left, y: e.clientY - rect.top })
                                                    setIsDragging(true)
                                                }
                                            }}
                                            onDoubleClick={(e) => {
                                                e.stopPropagation()
                                                e.preventDefault()

                                                setIsDragging(false)
                                                setDraggedDrawing(null)

                                                setEditingPropertiesId(drawing.id)
                                                setPropertiesEditorVisible(true)
                                                if (window.getSelection) {
                                                    window.getSelection()?.removeAllRanges()
                                                }
                                            }}
                                        />
                                    )
                                } else if (
                                    (drawing.type === 'buyZone' || drawing.type === 'sellZone') &&
                                    drawing.points.length === 2
                                ) {
                                    const screen1 = toScreenCoords(drawing.points[0])
                                    const screen2 = toScreenCoords(drawing.points[1])
                                    const x1 = Math.min(screen1.x, screen2.x)
                                    const x2 = Math.max(screen1.x, screen2.x)
                                    const defaultHeight = 40
                                    const rectY = screen1.y - defaultHeight / 2
                                    return (
                                        <rect
                                            key={drawing.id}
                                            x={x1}
                                            y={rectY}
                                            width={x2 - x1}
                                            height={defaultHeight}
                                            fill="transparent"
                                            stroke="transparent"
                                            strokeWidth="20"
                                            style={{ pointerEvents: 'all', cursor: 'pointer' }}
                                            onClick={(e) => {
                                                e.stopPropagation()
                                                enableDrawingEdit(drawing.id)
                                            }}
                                            onMouseDown={(e) => {
                                                e.stopPropagation()
                                                e.preventDefault()
                                                const rect = e.currentTarget.ownerSVGElement?.getBoundingClientRect()
                                                if (rect && !justCompletedDrawing) {
                                                    if (editingDrawing === drawing.id) {
                                                        setDraggedDrawing(drawing.id)
                                                        setDragOffset({ x: e.clientX - rect.left, y: e.clientY - rect.top })
                                                        setIsDragging(true)
                                                    } else {
                                                        setEditingDrawing(drawing.id)
                                                        setSelectedDrawing(drawing.id)
                                                    }
                                                }
                                            }}
                                            onDoubleClick={(e) => {
                                                e.stopPropagation()
                                                e.preventDefault()

                                                setIsDragging(false)
                                                setDraggedDrawing(null)

                                                setEditingPropertiesId(drawing.id)
                                                setPropertiesEditorVisible(true)
                                                if (window.getSelection) {
                                                    window.getSelection()?.removeAllRanges()
                                                }
                                            }}
                                        />
                                    )
                                } else if (drawing.type === 'priceRange' && drawing.points.length === 2) {
                                    const screen1 = toScreenCoords(drawing.points[0])
                                    const screen2 = toScreenCoords(drawing.points[1])
                                    const x = screen1.x
                                    const y1 = Math.min(screen1.y, screen2.y)
                                    const y2 = Math.max(screen1.y, screen2.y)
                                    return (
                                        <rect
                                            key={drawing.id}
                                            x={x - 40}
                                            y={y1}
                                            width={80}
                                            height={y2 - y1}
                                            fill="transparent"
                                            stroke="transparent"
                                            strokeWidth="20"
                                            style={{ pointerEvents: 'all', cursor: 'pointer' }}
                                            onClick={(e) => {
                                                e.stopPropagation()
                                                enableDrawingEdit(drawing.id)
                                            }}
                                            onMouseDown={(e) => {
                                                e.stopPropagation()
                                                e.preventDefault()
                                                const rect = e.currentTarget.ownerSVGElement?.getBoundingClientRect()
                                                if (rect && !justCompletedDrawing) {
                                                    if (editingDrawing === drawing.id) {
                                                        setDraggedDrawing(drawing.id)
                                                        setDragOffset({ x: e.clientX - rect.left, y: e.clientY - rect.top })
                                                        setIsDragging(true)
                                                    } else {
                                                        setEditingDrawing(drawing.id)
                                                        setSelectedDrawing(drawing.id)
                                                    }
                                                }
                                            }}
                                            onDoubleClick={(e) => {
                                                e.stopPropagation()
                                                e.preventDefault()

                                                setIsDragging(false)
                                                setDraggedDrawing(null)

                                                setEditingPropertiesId(drawing.id)
                                                setPropertiesEditorVisible(true)
                                                if (window.getSelection) {
                                                    window.getSelection()?.removeAllRanges()
                                                }
                                            }}
                                        />
                                    )
                                } else if (drawing.type === 'parallelChannel' && drawing.points.length === 3) {
                                    const p1 = toScreenCoords(drawing.points[0])
                                    const p2 = toScreenCoords(drawing.points[1])
                                    const p3 = toScreenCoords(drawing.points[2])
                                    const offsetX = p3.x - p1.x
                                    const offsetY = p3.y - p1.y

                                    return (
                                        <g key={drawing.id}>
                                            {/* First line (p1 to p2) */}
                                            <line
                                                x1={p1.x}
                                                y1={p1.y}
                                                x2={p2.x}
                                                y2={p2.y}
                                                stroke="transparent"
                                                strokeWidth="20"
                                                style={{ pointerEvents: 'stroke', cursor: 'pointer' }}
                                                onClick={(e) => {
                                                    e.stopPropagation()
                                                    enableDrawingEdit(drawing.id)
                                                }}
                                                onMouseDown={(e) => {
                                                    e.stopPropagation()
                                                    e.preventDefault()
                                                    const rect = e.currentTarget.ownerSVGElement?.getBoundingClientRect()
                                                    if (rect && !justCompletedDrawing) {
                                                        setEditingDrawing(drawing.id)
                                                        setSelectedDrawing(drawing.id)
                                                        setDraggedDrawing(drawing.id)
                                                        setDragOffset({ x: e.clientX - rect.left, y: e.clientY - rect.top })
                                                        setIsDragging(true)
                                                    }
                                                }}
                                                onDoubleClick={(e) => {
                                                    e.stopPropagation()
                                                    e.preventDefault()
                                                    setIsDragging(false)
                                                    setDraggedDrawing(null)
                                                    setEditingPropertiesId(drawing.id)
                                                    setPropertiesEditorVisible(true)
                                                    if (window.getSelection) {
                                                        window.getSelection()?.removeAllRanges()
                                                    }
                                                }}
                                            />
                                            {/* Second parallel line */}
                                            <line
                                                x1={p1.x + offsetX}
                                                y1={p1.y + offsetY}
                                                x2={p2.x + offsetX}
                                                y2={p2.y + offsetY}
                                                stroke="transparent"
                                                strokeWidth="20"
                                                style={{ pointerEvents: 'stroke', cursor: 'pointer' }}
                                                onClick={(e) => {
                                                    e.stopPropagation()
                                                    setEditingDrawing(drawing.id)
                                                    setSelectedDrawing(drawing.id)
                                                }}
                                                onMouseDown={(e) => {
                                                    e.stopPropagation()
                                                    e.preventDefault()
                                                    const rect = e.currentTarget.ownerSVGElement?.getBoundingClientRect()
                                                    if (rect && !justCompletedDrawing) {
                                                        setEditingDrawing(drawing.id)
                                                        setSelectedDrawing(drawing.id)
                                                        setDraggedDrawing(drawing.id)
                                                        setDragOffset({ x: e.clientX - rect.left, y: e.clientY - rect.top })
                                                        setIsDragging(true)
                                                    }
                                                }}
                                                onDoubleClick={(e) => {
                                                    e.stopPropagation()
                                                    e.preventDefault()
                                                    setIsDragging(false)
                                                    setDraggedDrawing(null)
                                                    setEditingPropertiesId(drawing.id)
                                                    setPropertiesEditorVisible(true)
                                                    if (window.getSelection) {
                                                        window.getSelection()?.removeAllRanges()
                                                    }
                                                }}
                                            />
                                        </g>
                                    )
                                } else if (drawing.type === 'text' && drawing.points.length === 1) {
                                    const p = toScreenCoords(drawing.points[0])
                                    const textWidth = (drawing.text?.length || 0) * 10
                                    return (
                                        <rect
                                            key={drawing.id}
                                            x={p.x - 5}
                                            y={p.y - 20}
                                            width={textWidth + 10}
                                            height={30}
                                            fill="transparent"
                                            style={{ pointerEvents: 'all', cursor: 'pointer' }}
                                            onClick={(e) => {
                                                e.stopPropagation()
                                                enableDrawingEdit(drawing.id)
                                            }}
                                            onMouseDown={(e) => {
                                                e.stopPropagation()
                                                e.preventDefault()
                                                const rect = e.currentTarget.ownerSVGElement?.getBoundingClientRect()
                                                if (rect && !justCompletedDrawing) {
                                                    setEditingDrawing(drawing.id)
                                                    setSelectedDrawing(drawing.id)
                                                    setDraggedDrawing(drawing.id)
                                                    setDragOffset({ x: e.clientX - rect.left, y: e.clientY - rect.top })
                                                    setIsDragging(true)
                                                }
                                            }}
                                            onDoubleClick={(e) => {
                                                e.stopPropagation()
                                                e.preventDefault()

                                                setIsDragging(false)
                                                setDraggedDrawing(null)

                                                if (e.shiftKey) {
                                                    const textScreen = toScreenCoords(drawing.points[0])
                                                    setEditingTextId(drawing.id)
                                                    setTextInputVisible(true)
                                                    setTextInputValue(drawing.text || '')
                                                    setTextInputPosition({ x: textScreen.x, y: textScreen.y })
                                                    setTimeout(() => {
                                                        textInputRef.current?.focus()
                                                        textInputRef.current?.select()
                                                    }, 0)
                                                } else {
                                                    setEditingPropertiesId(drawing.id)
                                                    setPropertiesEditorVisible(true)
                                                }
                                                if (window.getSelection) {
                                                    window.getSelection()?.removeAllRanges()
                                                }
                                            }}
                                        />
                                    )
                                } else if (drawing.type === 'brush' && drawing.points.length > 1) {
                                    // Create path for brush stroke
                                    const firstPoint = toScreenCoords(drawing.points[0])
                                    let pathData = `M ${firstPoint.x} ${firstPoint.y}`

                                    for (let i = 1; i < drawing.points.length; i++) {
                                        const point = toScreenCoords(drawing.points[i])
                                        pathData += ` L ${point.x} ${point.y}`
                                    }

                                    return (
                                        <path
                                            key={drawing.id}
                                            d={pathData}
                                            stroke="transparent"
                                            strokeWidth="20"
                                            fill="none"
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                            style={{ pointerEvents: 'stroke', cursor: 'pointer' }}
                                            onClick={(e) => {
                                                e.stopPropagation()
                                                enableDrawingEdit(drawing.id)
                                            }}
                                            onMouseDown={(e) => {
                                                e.stopPropagation()
                                                e.preventDefault()
                                                const rect = e.currentTarget.ownerSVGElement?.getBoundingClientRect()
                                                if (rect && !justCompletedDrawing) {
                                                    setEditingDrawing(drawing.id)
                                                    setSelectedDrawing(drawing.id)
                                                    setDraggedDrawing(drawing.id)
                                                    setDragOffset({ x: e.clientX - rect.left, y: e.clientY - rect.top })
                                                    setIsDragging(true)
                                                }
                                            }}
                                            onDoubleClick={(e) => {
                                                e.stopPropagation()
                                                e.preventDefault()
                                                setIsDragging(false)
                                                setDraggedDrawing(null)
                                                setEditingPropertiesId(drawing.id)
                                                setPropertiesEditorVisible(true)
                                                if (window.getSelection) {
                                                    window.getSelection()?.removeAllRanges()
                                                }
                                            }}
                                        />
                                    )
                                }
                                return null
                            })}

                            {/* Control points for editing/resizing drawings */}
                            {editingDrawing &&
                                drawings.map((drawing) => {
                                    if (drawing.id !== editingDrawing) return null

                                    if (
                                        (drawing.type === 'trendline' || drawing.type === 'rectangle') &&
                                        drawing.points.length === 2
                                    ) {
                                        const p1 = toScreenCoords(drawing.points[0])
                                        const p2 = toScreenCoords(drawing.points[1])

                                        // For rectangles, add 4 corner handles + 4 edge handles for full control
                                        if (drawing.type === 'rectangle') {
                                            const minX = Math.min(p1.x, p2.x)
                                            const maxX = Math.max(p1.x, p2.x)
                                            const minY = Math.min(p1.y, p2.y)
                                            const maxY = Math.max(p1.y, p2.y)
                                            const midX = (minX + maxX) / 2
                                            const midY = (minY + maxY) / 2

                                            return (
                                                <g key={`control-${drawing.id}`}>
                                                    {/* Corner handles */}
                                                    <circle cx={minX} cy={minY} r="8" fill="#3b82f6" stroke="#fff" strokeWidth="2"
                                                        style={{ pointerEvents: 'all', cursor: 'nwse-resize' }}
                                                        onMouseDown={(e) => {
                                                            e.stopPropagation()
                                                            e.preventDefault()
                                                            setDraggedControlPoint(0)
                                                            setIsDragging(true)
                                                        }}
                                                    />
                                                    <circle cx={maxX} cy={minY} r="8" fill="#3b82f6" stroke="#fff" strokeWidth="2"
                                                        style={{ pointerEvents: 'all', cursor: 'nesw-resize' }}
                                                        onMouseDown={(e) => {
                                                            e.stopPropagation()
                                                            e.preventDefault()
                                                            setDraggedControlPoint(1)
                                                            setIsDragging(true)
                                                        }}
                                                    />
                                                    <circle cx={maxX} cy={maxY} r="8" fill="#3b82f6" stroke="#fff" strokeWidth="2"
                                                        style={{ pointerEvents: 'all', cursor: 'nwse-resize' }}
                                                        onMouseDown={(e) => {
                                                            e.stopPropagation()
                                                            e.preventDefault()
                                                            setDraggedControlPoint(2)
                                                            setIsDragging(true)
                                                        }}
                                                    />
                                                    <circle cx={minX} cy={maxY} r="8" fill="#3b82f6" stroke="#fff" strokeWidth="2"
                                                        style={{ pointerEvents: 'all', cursor: 'nesw-resize' }}
                                                        onMouseDown={(e) => {
                                                            e.stopPropagation()
                                                            e.preventDefault()
                                                            setDraggedControlPoint(3)
                                                            setIsDragging(true)
                                                        }}
                                                    />
                                                    {/* Edge handles */}
                                                    <rect x={midX - 6} y={minY - 6} width="12" height="12" fill="#22c55e" stroke="#fff" strokeWidth="2"
                                                        style={{ pointerEvents: 'all', cursor: 'ns-resize' }}
                                                        onMouseDown={(e) => {
                                                            e.stopPropagation()
                                                            e.preventDefault()
                                                            setDraggedControlPoint(4)
                                                            setIsDragging(true)
                                                        }}
                                                    />
                                                    <rect x={maxX - 6} y={midY - 6} width="12" height="12" fill="#22c55e" stroke="#fff" strokeWidth="2"
                                                        style={{ pointerEvents: 'all', cursor: 'ew-resize' }}
                                                        onMouseDown={(e) => {
                                                            e.stopPropagation()
                                                            e.preventDefault()
                                                            setDraggedControlPoint(5)
                                                            setIsDragging(true)
                                                        }}
                                                    />
                                                    <rect x={midX - 6} y={maxY - 6} width="12" height="12" fill="#22c55e" stroke="#fff" strokeWidth="2"
                                                        style={{ pointerEvents: 'all', cursor: 'ns-resize' }}
                                                        onMouseDown={(e) => {
                                                            e.stopPropagation()
                                                            e.preventDefault()
                                                            setDraggedControlPoint(6)
                                                            setIsDragging(true)
                                                        }}
                                                    />
                                                    <rect x={minX - 6} y={midY - 6} width="12" height="12" fill="#22c55e" stroke="#fff" strokeWidth="2"
                                                        style={{ pointerEvents: 'all', cursor: 'ew-resize' }}
                                                        onMouseDown={(e) => {
                                                            e.stopPropagation()
                                                            e.preventDefault()
                                                            setDraggedControlPoint(7)
                                                            setIsDragging(true)
                                                        }}
                                                    />
                                                </g>
                                            )
                                        } else {
                                            // Trendline - just 2 endpoint handles
                                            return (
                                                <g key={`control-${drawing.id}`}>
                                                    <circle
                                                        cx={p1.x}
                                                        cy={p1.y}
                                                        r="8"
                                                        fill="#3b82f6"
                                                        stroke="#fff"
                                                        strokeWidth="2"
                                                        style={{ pointerEvents: 'all', cursor: 'move' }}
                                                        onMouseDown={(e) => {
                                                            e.stopPropagation()
                                                            e.preventDefault()
                                                            setDraggedControlPoint(0)
                                                            setIsDragging(true)
                                                        }}
                                                    />
                                                    <circle
                                                        cx={p2.x}
                                                        cy={p2.y}
                                                        r="8"
                                                        fill="#3b82f6"
                                                        stroke="#fff"
                                                        strokeWidth="2"
                                                        style={{ pointerEvents: 'all', cursor: 'move' }}
                                                        onMouseDown={(e) => {
                                                            e.stopPropagation()
                                                            e.preventDefault()
                                                            setDraggedControlPoint(1)
                                                            setIsDragging(true)
                                                        }}
                                                    />
                                                </g>
                                            )
                                        }
                                    } else if (drawing.type === 'ray' && drawing.points.length === 1) {
                                        const p = drawing.points[0]
                                        const screenY = priceToScreen ? priceToScreen(p.price) : 0
                                        const screenX = timeToScreen ? timeToScreen(p.time) : 0
                                        return (
                                            <circle
                                                key={`control-${drawing.id}`}
                                                cx={screenX}
                                                cy={screenY}
                                                r="8"
                                                fill="#3b82f6"
                                                stroke="#fff"
                                                strokeWidth="2"
                                                style={{ pointerEvents: 'all', cursor: 'ns-resize' }}
                                                onMouseDown={(e) => {
                                                    e.stopPropagation()
                                                    e.preventDefault()
                                                    setDraggedControlPoint(0)
                                                    const rect = e.currentTarget.ownerSVGElement?.getBoundingClientRect()
                                                    if (rect) {
                                                        setDragOffset({ x: e.clientX - rect.left, y: e.clientY - rect.top })
                                                        setIsDragging(true)
                                                    }
                                                }}
                                            />
                                        )
                                    } else if (drawing.type === 'horizontal' && drawing.points.length === 1) {
                                        const y = priceToScreen ? priceToScreen(drawing.points[0].price) : 0
                                        return (
                                            <circle
                                                key={`control-${drawing.id}`}
                                                cx={width / 2}
                                                cy={y}
                                                r="8"
                                                fill="#3b82f6"
                                                stroke="#fff"
                                                strokeWidth="2"
                                                style={{ pointerEvents: 'all', cursor: 'ns-resize' }}
                                                onMouseDown={(e) => {
                                                    e.stopPropagation()
                                                    e.preventDefault()
                                                    setDraggedControlPoint(0)
                                                    const rect = e.currentTarget.ownerSVGElement?.getBoundingClientRect()
                                                    if (rect) {
                                                        setDragOffset({ x: e.clientX - rect.left, y: e.clientY - rect.top })
                                                        setIsDragging(true)
                                                    }
                                                }}
                                            />
                                        )
                                    } else if (drawing.type === 'vertical' && drawing.points.length === 1) {
                                        const x = timeToScreen ? timeToScreen(drawing.points[0].time) : 0
                                        return (
                                            <circle
                                                key={`control-${drawing.id}`}
                                                cx={x}
                                                cy={height / 2}
                                                r="8"
                                                fill="#3b82f6"
                                                stroke="#fff"
                                                strokeWidth="2"
                                                style={{ pointerEvents: 'all', cursor: 'ew-resize' }}
                                                onMouseDown={(e) => {
                                                    e.stopPropagation()
                                                    e.preventDefault()
                                                    setDraggedControlPoint(0)
                                                    const rect = e.currentTarget.ownerSVGElement?.getBoundingClientRect()
                                                    if (rect) {
                                                        setDragOffset({ x: e.clientX - rect.left, y: e.clientY - rect.top })
                                                        setIsDragging(true)
                                                    }
                                                }}
                                            />
                                        )
                                    } else if (drawing.type === 'text' && drawing.points.length === 1) {
                                        const p = toScreenCoords(drawing.points[0])
                                        return (
                                            <circle
                                                key={`control-${drawing.id}`}
                                                cx={p.x}
                                                cy={p.y}
                                                r="8"
                                                fill="#3b82f6"
                                                stroke="#fff"
                                                strokeWidth="2"
                                                style={{ pointerEvents: 'all', cursor: 'move' }}
                                                onMouseDown={(e) => {
                                                    e.stopPropagation()
                                                    e.preventDefault()
                                                    setDraggedControlPoint(0)
                                                    const rect = e.currentTarget.ownerSVGElement?.getBoundingClientRect()
                                                    if (rect) {
                                                        setDragOffset({ x: e.clientX - rect.left, y: e.clientY - rect.top })
                                                        setIsDragging(true)
                                                    }
                                                }}
                                            />
                                        )
                                    } else if (
                                        (drawing.type === 'buyZone' || drawing.type === 'sellZone') &&
                                        drawing.points.length === 2 &&
                                        editingDrawing === drawing.id
                                    ) {
                                        const screen1 = toScreenCoords(drawing.points[0])
                                        const screen2 = toScreenCoords(drawing.points[1])
                                        const defaultHeight = 40
                                        const y = screen1.y
                                        return (
                                            <g key={`control-${drawing.id}`}>
                                                {/* Left edge control point */}
                                                <circle
                                                    cx={screen1.x}
                                                    cy={y}
                                                    r="8"
                                                    fill="#3b82f6"
                                                    stroke="#fff"
                                                    strokeWidth="2"
                                                    style={{ pointerEvents: 'all', cursor: 'ew-resize' }}
                                                    onMouseDown={(e) => {
                                                        e.stopPropagation()
                                                        e.preventDefault()
                                                        setDraggedControlPoint(0)
                                                        setIsDragging(true)
                                                    }}
                                                />
                                                {/* Right edge control point */}
                                                <circle
                                                    cx={screen2.x}
                                                    cy={y}
                                                    r="8"
                                                    fill="#3b82f6"
                                                    stroke="#fff"
                                                    strokeWidth="2"
                                                    style={{ pointerEvents: 'all', cursor: 'ew-resize' }}
                                                    onMouseDown={(e) => {
                                                        e.stopPropagation()
                                                        e.preventDefault()
                                                        setDraggedControlPoint(1)
                                                        setIsDragging(true)
                                                    }}
                                                />
                                            </g>
                                        )
                                    } else if (
                                        drawing.type === 'priceRange' &&
                                        drawing.points.length === 2 &&
                                        editingDrawing === drawing.id
                                    ) {
                                        const screen1 = toScreenCoords(drawing.points[0])
                                        const screen2 = toScreenCoords(drawing.points[1])
                                        const x = screen1.x

                                        return (
                                            <g key={`control-${drawing.id}`}>
                                                {/* First point control */}
                                                <circle
                                                    cx={x}
                                                    cy={screen1.y}
                                                    r="8"
                                                    fill="#3b82f6"
                                                    stroke="#fff"
                                                    strokeWidth="2"
                                                    style={{ pointerEvents: 'all', cursor: 'ns-resize' }}
                                                    onMouseDown={(e) => {
                                                        e.stopPropagation()
                                                        e.preventDefault()
                                                        setDraggedControlPoint(0)
                                                        const rect = e.currentTarget.ownerSVGElement?.getBoundingClientRect()
                                                        if (rect) {
                                                            setDragOffset({ x: e.clientX - rect.left, y: e.clientY - rect.top })
                                                            setIsDragging(true)
                                                        }
                                                    }}
                                                />
                                                {/* Second point control */}
                                                <circle
                                                    cx={x}
                                                    cy={screen2.y}
                                                    r="8"
                                                    fill="#3b82f6"
                                                    stroke="#fff"
                                                    strokeWidth="2"
                                                    style={{ pointerEvents: 'all', cursor: 'ns-resize' }}
                                                    onMouseDown={(e) => {
                                                        e.stopPropagation()
                                                        e.preventDefault()
                                                        setDraggedControlPoint(1)
                                                        const rect = e.currentTarget.ownerSVGElement?.getBoundingClientRect()
                                                        if (rect) {
                                                            setDragOffset({ x: e.clientX - rect.left, y: e.clientY - rect.top })
                                                            setIsDragging(true)
                                                        }
                                                    }}
                                                />
                                            </g>
                                        )
                                    } else if (drawing.type === 'parallelChannel' && drawing.points.length === 3) {
                                        const p1 = toScreenCoords(drawing.points[0])
                                        const p2 = toScreenCoords(drawing.points[1])
                                        const p3 = toScreenCoords(drawing.points[2])
                                        const offsetX = p3.x - p1.x
                                        const offsetY = p3.y - p1.y

                                        // Calculate middle points for distance adjustment
                                        const mid1 = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 }
                                        const mid2 = { x: mid1.x + offsetX, y: mid1.y + offsetY }

                                        return (
                                            <g key={`control-${drawing.id}`}>
                                                {/* Corner point 1 (first line start) - Blue */}
                                                <circle
                                                    cx={p1.x}
                                                    cy={p1.y}
                                                    r="8"
                                                    fill="#3b82f6"
                                                    stroke="#fff"
                                                    strokeWidth="2"
                                                    style={{ pointerEvents: 'all', cursor: 'move' }}
                                                    onMouseDown={(e) => {
                                                        e.stopPropagation()
                                                        e.preventDefault()
                                                        setDraggedControlPoint(0)
                                                        setEditingDrawing(drawing.id)
                                                        setIsDragging(true)
                                                    }}
                                                />
                                                {/* Corner point 2 (first line end) - Blue */}
                                                <circle
                                                    cx={p2.x}
                                                    cy={p2.y}
                                                    r="8"
                                                    fill="#3b82f6"
                                                    stroke="#fff"
                                                    strokeWidth="2"
                                                    style={{ pointerEvents: 'all', cursor: 'move' }}
                                                    onMouseDown={(e) => {
                                                        e.stopPropagation()
                                                        e.preventDefault()
                                                        setDraggedControlPoint(1)
                                                        setEditingDrawing(drawing.id)
                                                        setIsDragging(true)
                                                    }}
                                                />
                                                {/* Corner point 3 (second line start) - Blue */}
                                                <circle
                                                    cx={p1.x + offsetX}
                                                    cy={p1.y + offsetY}
                                                    r="8"
                                                    fill="#3b82f6"
                                                    stroke="#fff"
                                                    strokeWidth="2"
                                                    style={{ pointerEvents: 'all', cursor: 'move' }}
                                                    onMouseDown={(e) => {
                                                        e.stopPropagation()
                                                        e.preventDefault()
                                                        setDraggedControlPoint(2)
                                                        setEditingDrawing(drawing.id)
                                                        setIsDragging(true)
                                                    }}
                                                />
                                                {/* Corner point 4 (second line end) - Blue */}
                                                <circle
                                                    cx={p2.x + offsetX}
                                                    cy={p2.y + offsetY}
                                                    r="8"
                                                    fill="#3b82f6"
                                                    stroke="#fff"
                                                    strokeWidth="2"
                                                    style={{ pointerEvents: 'all', cursor: 'move' }}
                                                    onMouseDown={(e) => {
                                                        e.stopPropagation()
                                                        e.preventDefault()
                                                        setDraggedControlPoint(3)
                                                        setEditingDrawing(drawing.id)
                                                        setIsDragging(true)
                                                    }}
                                                />
                                                {/* Middle point 1 (first line) - Orange for distance adjustment */}
                                                <circle
                                                    cx={mid1.x}
                                                    cy={mid1.y}
                                                    r="8"
                                                    fill="#ff8500"
                                                    stroke="#fff"
                                                    strokeWidth="2"
                                                    style={{ pointerEvents: 'all', cursor: 'ns-resize' }}
                                                    onMouseDown={(e) => {
                                                        e.stopPropagation()
                                                        e.preventDefault()
                                                        setDraggedControlPoint(4)
                                                        setEditingDrawing(drawing.id)
                                                        setIsDragging(true)
                                                    }}
                                                />
                                                {/* Middle point 2 (second line) - Orange for distance adjustment */}
                                                <circle
                                                    cx={mid2.x}
                                                    cy={mid2.y}
                                                    r="8"
                                                    fill="#ff8500"
                                                    stroke="#fff"
                                                    strokeWidth="2"
                                                    style={{ pointerEvents: 'all', cursor: 'ns-resize' }}
                                                    onMouseDown={(e) => {
                                                        e.stopPropagation()
                                                        e.preventDefault()
                                                        setDraggedControlPoint(5)
                                                        setEditingDrawing(drawing.id)
                                                        setIsDragging(true)
                                                    }}
                                                />
                                            </g>
                                        )
                                    }
                                    return null
                                })}
                        </svg>
                    )
                })()}

            {/* Drawing Canvas - for visual rendering only */}
            <canvas
                ref={canvasRef}
                width={width}
                height={height}
                style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    pointerEvents: 'none',
                    zIndex: 1001,
                }}
            />

            {/* Text Input Overlay */}
            {textInputVisible && (
                <input
                    ref={textInputRef}
                    type="text"
                    value={textInputValue}
                    onChange={(e) => setTextInputValue(e.target.value)}
                    onKeyDown={handleTextInputKeyDown}
                    style={{
                        position: 'absolute',
                        left: `${textInputPosition.x}px`,
                        top: `${textInputPosition.y}px`,
                        background: 'rgba(0, 0, 0, 0.9)',
                        border: `2px solid ${color}`,
                        color: color,
                        padding: '4px 8px',
                        fontSize: '16px',
                        fontWeight: 'bold',
                        borderRadius: '4px',
                        outline: 'none',
                        minWidth: '150px',
                        zIndex: 1003,
                        pointerEvents: 'auto',
                    }}
                />
            )}

            {/* Properties Editor Popup */}
            {propertiesEditorVisible &&
                editingPropertiesId &&
                (() => {
                    const drawing = drawings.find((d) => d.id === editingPropertiesId)
                    if (!drawing) return null

                    const updateDrawingProperty = (key: string, value: any) => {
                        setDrawings(
                            drawings.map((d) => (d.id === editingPropertiesId ? { ...d, [key]: value } : d))
                        )
                    }

                    const deleteDrawing = () => {
                        setDrawings(drawings.filter((d) => d.id !== editingPropertiesId))
                        setPropertiesEditorVisible(false)
                        setEditingPropertiesId(null)
                        setEditingDrawing(null)
                    }

                    return (
                        <div
                            style={{
                                position: 'absolute',
                                top: '50%',
                                left: '50%',
                                transform: 'translate(-50%, -50%)',
                                background: 'linear-gradient(145deg, #0a0a0a 0%, #1a1a1a 100%)',
                                border: '1px solid rgba(255, 120, 0, 0.3)',
                                borderRadius: '0',
                                padding: '0',
                                minWidth: '238px',
                                maxWidth: '280px',
                                zIndex: 1004,
                                boxShadow:
                                    '0 20px 60px rgba(0, 0, 0, 0.9), inset 0 1px 0 rgba(255, 255, 255, 0.05)',
                                pointerEvents: 'auto',
                                overflow: 'hidden',
                            }}
                        >
                            {/* Header with glossy effect */}
                            <div
                                style={{
                                    background:
                                        'linear-gradient(180deg, rgba(100, 40, 0, 0.4) 0%, rgba(70, 25, 0, 0.3) 50%, rgba(40, 15, 0, 0.2) 100%)',
                                    borderBottom: '1px solid rgba(150, 60, 0, 0.4)',
                                    padding: '16px 20px',
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center',
                                    position: 'relative',
                                    boxShadow:
                                        'inset 0 1px 0 rgba(180, 80, 20, 0.15), inset 0 -1px 0 rgba(0, 0, 0, 0.5), 0 2px 8px rgba(0, 0, 0, 0.3)',
                                }}
                            >
                                <div
                                    style={{
                                        position: 'absolute',
                                        top: 0,
                                        left: 0,
                                        right: 0,
                                        height: '2px',
                                        background:
                                            'linear-gradient(90deg, transparent, rgba(180, 80, 20, 0.25) 50%, transparent)',
                                        filter: 'blur(0.5px)',
                                    }}
                                />
                                <h3
                                    style={{
                                        margin: 0,
                                        color: '#ffffff',
                                        fontSize: '18px',
                                        fontWeight: '600',
                                        letterSpacing: '0.5px',
                                        textTransform: 'uppercase',
                                        textShadow: '0 2px 8px rgba(0, 0, 0, 0.5)',
                                    }}
                                >
                                    Drawing Properties
                                </h3>
                                <button
                                    onClick={() => {
                                        setPropertiesEditorVisible(false)
                                        setEditingPropertiesId(null)
                                    }}
                                    style={{
                                        background:
                                            'linear-gradient(145deg, rgba(255, 120, 0, 0.2), rgba(255, 120, 0, 0.1))',
                                        border: '1px solid rgba(255, 120, 0, 0.3)',
                                        color: '#ff7800',
                                        cursor: 'pointer',
                                        fontSize: '18px',
                                        padding: '6px',
                                        lineHeight: '1',
                                        borderRadius: '3px',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        width: '28px',
                                        height: '28px',
                                        boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.1)',
                                        transition: 'all 0.15s',
                                    }}
                                    onMouseOver={(e) => {
                                        e.currentTarget.style.background =
                                            'linear-gradient(145deg, rgba(255, 120, 0, 0.3), rgba(255, 120, 0, 0.15))'
                                    }}
                                    onMouseOut={(e) => {
                                        e.currentTarget.style.background =
                                            'linear-gradient(145deg, rgba(255, 120, 0, 0.2), rgba(255, 120, 0, 0.1))'
                                    }}
                                >
                                    <TbX />
                                </button>
                            </div>

                            {/* Content area */}
                            <div
                                style={{
                                    padding: '20px',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: '16px',
                                    background: 'linear-gradient(180deg, #0f0f0f 0%, #0a0a0a 100%)',
                                }}
                            >
                                {/* Color */}
                                <div>
                                    <label
                                        style={{
                                            color: '#ffffff',
                                            fontSize: '14px',
                                            display: 'block',
                                            marginBottom: '8px',
                                            fontWeight: '600',
                                            letterSpacing: '0.5px',
                                            textTransform: 'uppercase',
                                        }}
                                    >
                                        Color
                                    </label>
                                    <input
                                        type="color"
                                        defaultValue={drawing.color}
                                        onBlur={(e) => updateDrawingProperty('color', e.target.value)}
                                        style={{
                                            width: '100%',
                                            height: '38px',
                                            cursor: 'pointer',
                                            border: '1px solid rgba(255, 120, 0, 0.2)',
                                            borderRadius: '3px',
                                            background: '#000',
                                            boxShadow:
                                                'inset 0 2px 4px rgba(0, 0, 0, 0.5), 0 1px 0 rgba(255, 255, 255, 0.05)',
                                        }}
                                    />
                                </div>

                                {/* Opacity */}
                                <div>
                                    <label
                                        style={{
                                            color: '#ffffff',
                                            fontSize: '14px',
                                            display: 'block',
                                            marginBottom: '8px',
                                            fontWeight: '600',
                                            letterSpacing: '0.5px',
                                            textTransform: 'uppercase',
                                        }}
                                    >
                                        Opacity:{' '}
                                        <span style={{ color: '#ff7800' }}>
                                            {Math.round((drawing.opacity ?? 1.0) * 100)}%
                                        </span>
                                    </label>
                                    <input
                                        type="range"
                                        min="0"
                                        max="1"
                                        step="0.05"
                                        value={drawing.opacity ?? 1.0}
                                        onChange={(e) => updateDrawingProperty('opacity', parseFloat(e.target.value))}
                                        style={{
                                            width: '100%',
                                            height: '6px',
                                            borderRadius: '3px',
                                            background: 'linear-gradient(90deg, #1a1a1a, #333)',
                                            outline: 'none',
                                            appearance: 'none',
                                            cursor: 'pointer',
                                        }}
                                    />
                                </div>

                                {/* Line Width (for lines) */}
                                {(drawing.type === 'trendline' ||
                                    drawing.type === 'horizontal' ||
                                    drawing.type === 'vertical' ||
                                    drawing.type === 'ray' ||
                                    drawing.type === 'rectangle' ||
                                    drawing.type === 'parallelChannel') && (
                                        <div>
                                            <label
                                                style={{
                                                    color: '#ffffff',
                                                    fontSize: '14px',
                                                    display: 'block',
                                                    marginBottom: '8px',
                                                    fontWeight: '600',
                                                    letterSpacing: '0.5px',
                                                    textTransform: 'uppercase',
                                                }}
                                            >
                                                Line Width:{' '}
                                                <span style={{ color: '#ff7800' }}>{drawing.lineWidth || 2}px</span>
                                            </label>
                                            <input
                                                type="range"
                                                min="1"
                                                max="10"
                                                value={drawing.lineWidth || 2}
                                                onChange={(e) => updateDrawingProperty('lineWidth', parseInt(e.target.value))}
                                                style={{
                                                    width: '100%',
                                                    height: '6px',
                                                    borderRadius: '3px',
                                                    background: 'linear-gradient(90deg, #1a1a1a, #333)',
                                                    outline: 'none',
                                                    appearance: 'none',
                                                    cursor: 'pointer',
                                                }}
                                            />
                                        </div>
                                    )}

                                {/* Line Style (for lines) */}
                                {(drawing.type === 'trendline' ||
                                    drawing.type === 'horizontal' ||
                                    drawing.type === 'vertical' ||
                                    drawing.type === 'ray' ||
                                    drawing.type === 'rectangle' ||
                                    drawing.type === 'parallelChannel') && (
                                        <div>
                                            <label
                                                style={{
                                                    color: '#ffffff',
                                                    fontSize: '14px',
                                                    display: 'block',
                                                    marginBottom: '8px',
                                                    fontWeight: '600',
                                                    letterSpacing: '0.5px',
                                                    textTransform: 'uppercase',
                                                }}
                                            >
                                                Line Style
                                            </label>
                                            <select
                                                value={drawing.lineStyle || 'solid'}
                                                onChange={(e) => updateDrawingProperty('lineStyle', e.target.value)}
                                                style={{
                                                    width: '100%',
                                                    padding: '10px 12px',
                                                    background: 'linear-gradient(145deg, #0a0a0a, #1a1a1a)',
                                                    color: '#ffffff',
                                                    border: '1px solid rgba(255, 120, 0, 0.2)',
                                                    borderRadius: '3px',
                                                    cursor: 'pointer',
                                                    fontSize: '17px',
                                                    fontWeight: '500',
                                                    boxShadow:
                                                        'inset 0 2px 4px rgba(0, 0, 0, 0.5), 0 1px 0 rgba(255, 255, 255, 0.05)',
                                                    outline: 'none',
                                                }}
                                            >
                                                <option value="solid">Solid</option>
                                                <option value="dashed">Dashed</option>
                                                <option value="dotted">Dotted</option>
                                            </select>
                                        </div>
                                    )}

                                {/* Background Color */}
                                {(drawing.type === 'rectangle' ||
                                    drawing.type === 'text' ||
                                    drawing.type === 'parallelChannel') && (
                                        <div>
                                            <label
                                                style={{
                                                    color: '#ffffff',
                                                    fontSize: '14px',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: '8px',
                                                    marginBottom: '8px',
                                                    fontWeight: '600',
                                                    letterSpacing: '0.5px',
                                                    textTransform: 'uppercase',
                                                }}
                                            >
                                                <input
                                                    type="checkbox"
                                                    checked={!!drawing.backgroundColor}
                                                    onChange={(e) =>
                                                        updateDrawingProperty(
                                                            'backgroundColor',
                                                            e.target.checked ? '#ff7800' : undefined
                                                        )
                                                    }
                                                    style={{
                                                        cursor: 'pointer',
                                                        width: '16px',
                                                        height: '16px',
                                                        accentColor: '#ff7800',
                                                    }}
                                                />
                                                {drawing.type === 'parallelChannel'
                                                    ? 'Fill Between Lines'
                                                    : 'Background Color'}
                                            </label>
                                            {drawing.backgroundColor && (
                                                <>
                                                    <input
                                                        type="color"
                                                        defaultValue={
                                                            drawing.backgroundColor.startsWith('#')
                                                                ? drawing.backgroundColor
                                                                : '#ff7800'
                                                        }
                                                        onBlur={(e) => updateDrawingProperty('backgroundColor', e.target.value)}
                                                        style={{
                                                            width: '100%',
                                                            height: '38px',
                                                            cursor: 'pointer',
                                                            border: '1px solid rgba(255, 120, 0, 0.2)',
                                                            borderRadius: '3px',
                                                            marginBottom: '12px',
                                                            background: '#000',
                                                            boxShadow:
                                                                'inset 0 2px 4px rgba(0, 0, 0, 0.5), 0 1px 0 rgba(255, 255, 255, 0.05)',
                                                        }}
                                                    />
                                                    <div>
                                                        <label
                                                            style={{
                                                                color: '#ffffff',
                                                                fontSize: '14px',
                                                                display: 'block',
                                                                marginBottom: '8px',
                                                                fontWeight: '600',
                                                                letterSpacing: '0.5px',
                                                                textTransform: 'uppercase',
                                                            }}
                                                        >
                                                            Background Opacity:{' '}
                                                            <span style={{ color: '#ff7800' }}>
                                                                {Math.round((drawing.backgroundOpacity ?? 0.3) * 100)}%
                                                            </span>
                                                        </label>
                                                        <input
                                                            type="range"
                                                            min="0"
                                                            max="1"
                                                            step="0.05"
                                                            value={drawing.backgroundOpacity ?? 0.3}
                                                            onChange={(e) =>
                                                                updateDrawingProperty('backgroundOpacity', parseFloat(e.target.value))
                                                            }
                                                            style={{
                                                                width: '100%',
                                                                height: '6px',
                                                                borderRadius: '3px',
                                                                background: 'linear-gradient(90deg, #1a1a1a, #333)',
                                                                outline: 'none',
                                                                appearance: 'none',
                                                                cursor: 'pointer',
                                                            }}
                                                        />
                                                    </div>
                                                </>
                                            )}
                                        </div>
                                    )}

                                {/* Show Midline (for parallel channel) */}
                                {drawing.type === 'parallelChannel' && (
                                    <div style={{ marginBottom: '20px' }}>
                                        <label
                                            style={{
                                                color: '#ffffff',
                                                fontSize: '14px',
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '8px',
                                                fontWeight: '600',
                                                letterSpacing: '0.5px',
                                                textTransform: 'uppercase',
                                                cursor: 'pointer',
                                            }}
                                        >
                                            <input
                                                type="checkbox"
                                                checked={drawing.showMidline ?? false}
                                                onChange={(e) => updateDrawingProperty('showMidline', e.target.checked)}
                                                style={{
                                                    cursor: 'pointer',
                                                    width: '16px',
                                                    height: '16px',
                                                    accentColor: '#ff7800',
                                                }}
                                            />
                                            Show Midline (Dashed)
                                        </label>
                                    </div>
                                )}

                                {/* Font Weight (for text) */}
                                {drawing.type === 'text' && (
                                    <>
                                        <div>
                                            <label
                                                style={{
                                                    color: '#ffffff',
                                                    fontSize: '14px',
                                                    display: 'block',
                                                    marginBottom: '8px',
                                                    fontWeight: '600',
                                                    letterSpacing: '0.5px',
                                                    textTransform: 'uppercase',
                                                }}
                                            >
                                                Font Weight
                                            </label>
                                            <select
                                                value={drawing.fontWeight || 'bold'}
                                                onChange={(e) => updateDrawingProperty('fontWeight', e.target.value)}
                                                style={{
                                                    width: '100%',
                                                    padding: '10px 12px',
                                                    background: 'linear-gradient(145deg, #0a0a0a, #1a1a1a)',
                                                    color: '#ffffff',
                                                    border: '1px solid rgba(255, 120, 0, 0.2)',
                                                    borderRadius: '3px',
                                                    cursor: 'pointer',
                                                    fontSize: '17px',
                                                    fontWeight: '500',
                                                    boxShadow:
                                                        'inset 0 2px 4px rgba(0, 0, 0, 0.5), 0 1px 0 rgba(255, 255, 255, 0.05)',
                                                    outline: 'none',
                                                }}
                                            >
                                                <option value="normal">Normal</option>
                                                <option value="bold">Bold</option>
                                            </select>
                                        </div>

                                        {/* Font Style */}
                                        <div>
                                            <label
                                                style={{
                                                    color: '#ffffff',
                                                    fontSize: '14px',
                                                    display: 'block',
                                                    marginBottom: '8px',
                                                    fontWeight: '600',
                                                    letterSpacing: '0.5px',
                                                    textTransform: 'uppercase',
                                                }}
                                            >
                                                Font Style
                                            </label>
                                            <select
                                                value={drawing.fontStyle || 'normal'}
                                                onChange={(e) => updateDrawingProperty('fontStyle', e.target.value)}
                                                style={{
                                                    width: '100%',
                                                    padding: '10px 12px',
                                                    background: 'linear-gradient(145deg, #0a0a0a, #1a1a1a)',
                                                    color: '#ffffff',
                                                    border: '1px solid rgba(255, 120, 0, 0.2)',
                                                    borderRadius: '3px',
                                                    cursor: 'pointer',
                                                    fontSize: '17px',
                                                    fontWeight: '500',
                                                    boxShadow:
                                                        'inset 0 2px 4px rgba(0, 0, 0, 0.5), 0 1px 0 rgba(255, 255, 255, 0.05)',
                                                    outline: 'none',
                                                }}
                                            >
                                                <option value="normal">Normal</option>
                                                <option value="italic">Italic</option>
                                            </select>
                                        </div>

                                        {/* Font Size */}
                                        <div>
                                            <label
                                                style={{
                                                    color: '#ffffff',
                                                    fontSize: '14px',
                                                    display: 'block',
                                                    marginBottom: '8px',
                                                    fontWeight: '600',
                                                    letterSpacing: '0.5px',
                                                    textTransform: 'uppercase',
                                                }}
                                            >
                                                Font Size:{' '}
                                                <span style={{ color: '#ff7800' }}>{drawing.fontSize || 16}px</span>
                                            </label>
                                            <input
                                                type="range"
                                                min="10"
                                                max="40"
                                                value={drawing.fontSize || 16}
                                                onChange={(e) =>
                                                    updateDrawingProperty('fontSize', parseInt(e.target.value))
                                                }
                                                style={{
                                                    width: '100%',
                                                    height: '6px',
                                                    borderRadius: '3px',
                                                    background: 'linear-gradient(90deg, #1a1a1a, #333)',
                                                    outline: 'none',
                                                    appearance: 'none',
                                                    cursor: 'pointer',
                                                }}
                                            />
                                        </div>

                                        {/* Edit Text Content Button */}
                                        <button
                                            onClick={() => {
                                                const textScreen = toScreenCoords(drawing.points[0])
                                                setEditingTextId(drawing.id)
                                                setTextInputVisible(true)
                                                setTextInputValue(drawing.text || '')
                                                setTextInputPosition({ x: textScreen.x, y: textScreen.y })
                                                setPropertiesEditorVisible(false)
                                                setTimeout(() => {
                                                    textInputRef.current?.focus()
                                                    textInputRef.current?.select()
                                                }, 0)
                                            }}
                                            style={{
                                                padding: '12px 16px',
                                                background:
                                                    'linear-gradient(145deg, rgba(255, 120, 0, 0.2), rgba(255, 120, 0, 0.15))',
                                                color: '#ffffff',
                                                border: '1px solid rgba(255, 120, 0, 0.4)',
                                                borderRadius: '3px',
                                                cursor: 'pointer',
                                                fontWeight: '600',
                                                fontSize: '16px',
                                                width: '100%',
                                                letterSpacing: '0.5px',
                                                textTransform: 'uppercase',
                                                boxShadow:
                                                    'inset 0 1px 0 rgba(255, 255, 255, 0.1), 0 2px 8px rgba(0, 0, 0, 0.3)',
                                                transition: 'all 0.15s',
                                            }}
                                            onMouseOver={(e) => {
                                                e.currentTarget.style.background =
                                                    'linear-gradient(145deg, rgba(255, 120, 0, 0.3), rgba(255, 120, 0, 0.2))'
                                            }}
                                            onMouseOut={(e) => {
                                                e.currentTarget.style.background =
                                                    'linear-gradient(145deg, rgba(255, 120, 0, 0.2), rgba(255, 120, 0, 0.15))'
                                            }}
                                        >
                                            Edit Text Content
                                        </button>
                                    </>
                                )}

                                {/* Delete Button */}
                                <button
                                    onClick={deleteDrawing}
                                    style={{
                                        padding: '12px 16px',
                                        background:
                                            'linear-gradient(145deg, rgba(239, 68, 68, 0.2), rgba(239, 68, 68, 0.15))',
                                        color: '#ffffff',
                                        border: '1px solid rgba(239, 68, 68, 0.4)',
                                        borderRadius: '3px',
                                        cursor: 'pointer',
                                        fontWeight: '600',
                                        fontSize: '16px',
                                        width: '100%',
                                        marginTop: '4px',
                                        letterSpacing: '0.5px',
                                        textTransform: 'uppercase',
                                        boxShadow:
                                            'inset 0 1px 0 rgba(255, 255, 255, 0.1), 0 2px 8px rgba(0, 0, 0, 0.3)',
                                        transition: 'all 0.15s',
                                    }}
                                    onMouseOver={(e) => {
                                        e.currentTarget.style.background =
                                            'linear-gradient(145deg, rgba(239, 68, 68, 0.3), rgba(239, 68, 68, 0.2))'
                                    }}
                                    onMouseOut={(e) => {
                                        e.currentTarget.style.background =
                                            'linear-gradient(145deg, rgba(239, 68, 68, 0.2), rgba(239, 68, 68, 0.15))'
                                    }}
                                >
                                    Delete Drawing
                                </button>
                            </div>
                        </div>
                    )
                })()}
        </div>
    )
}

export default LWChartDrawingTools
