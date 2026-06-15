'use client'

import { FiTrendingDown, FiTrendingUp } from 'react-icons/fi'
import {
  TbArrowBackUp,
  TbArrowUpRight,
  TbArrowsVertical,
  TbBrush,
  TbLayout,
  TbLine,
  TbMinus,
  TbSelector,
  TbSquare,
  TbTextSize,
  TbTrash,
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
  indexToTimestamp?: (index: number) => number  // bar index → Unix ms
  chartTimeframe?: string  // e.g. '1m','5m','15m','30m','1h','4h','1D','1W'
  onMouseMove?: (e: React.MouseEvent<HTMLElement>) => void
  toolbarPosition?: 'top' | 'left'
  navyButtonTheme?: boolean
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
  | 'brush'
  | 'priceRange'
  | 'fib'
  | 'elliottWave'
  | 'elliottWaveABC'
  | 'path'

interface FibLevel {
  value: number
  enabled: boolean
  color: string
}

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
  // Fib fields
  fibLevels?: FibLevel[]
  fibShowPrices?: boolean
  fibReverse?: boolean
  fibUseOneColor?: boolean
  fibBackground?: boolean
  fibBackgroundOpacity?: number
  fibTrendLineStyle?: 'solid' | 'dashed' | 'dotted'
  // Elliott Wave
  elliottType?: 'impulse' | 'corrective'
  // Path
  pathEndStyle?: 'none' | 'arrow' | 'circle'
  // Zone
  zoneShape?: 'flat' | 'diagonal' | 'curve'
  zoneHeight?: number      // signed px: +ve = above anchor, -ve = below anchor
  zoneDiagOffset?: number  // diagonal only: right-side vertical shift in px (whole rect tilts)
  zoneCurveCtrlX?: number  // curve only: X offset of bezier control point from midX (px)
}

// ─── DEFAULT FIB LEVELS ──────────────────────────────────────────────────────
const DEFAULT_FIB_LEVELS: FibLevel[] = [
  { value: 0, enabled: true, color: '#22c55e' },
  { value: 0.236, enabled: true, color: '#00d4ff' },
  { value: 0.382, enabled: false, color: '#a855f7' },
  { value: 0.5, enabled: false, color: '#ff8500' },
  { value: 0.618, enabled: true, color: '#FF8500' },
  { value: 0.786, enabled: false, color: '#ef4444' },
  { value: 1, enabled: true, color: '#22c55e' },
  { value: 1.272, enabled: true, color: '#00d4ff' },
  { value: 1.414, enabled: true, color: '#a855f7' },
  { value: 1.618, enabled: true, color: '#FF8500' },
  { value: 2, enabled: true, color: '#ef4444' },
  { value: 2.272, enabled: true, color: '#22c55e' },
  { value: 2.414, enabled: true, color: '#00d4ff' },
  { value: 2.618, enabled: true, color: '#a855f7' },
  { value: 3.618, enabled: true, color: '#FF8500' },
  { value: 4.236, enabled: true, color: '#ef4444' },
]

// ─── SOLID COLOR PALETTE ─────────────────────────────────────────────────────
const SOLID_COLORS: string[][] = [
  [
    '#ffffff',
    '#d1d4dc',
    '#b2b5be',
    '#9598a1',
    '#787b86',
    '#606269',
    '#474a55',
    '#363a45',
    '#2a2e39',
    '#000000',
  ],
  [
    '#f23645',
    '#ff6d00',
    '#ffb100',
    '#ffd700',
    '#4caf50',
    '#089981',
    '#00bcd4',
    '#2962ff',
    '#9c27b0',
    '#e91e63',
  ],
  [
    '#ff8a80',
    '#ffab40',
    '#ffe57f',
    '#ccff90',
    '#b9f6ca',
    '#a7ffeb',
    '#80d8ff',
    '#82b1ff',
    '#ea80fc',
    '#ff80ab',
  ],
  [
    '#ffcdd2',
    '#ffe0b2',
    '#fff9c4',
    '#dcedc8',
    '#e8f5e9',
    '#e0f7fa',
    '#e3f2fd',
    '#f3e5f5',
    '#fce4ec',
    '#fbe9e7',
  ],
  [
    '#ef9a9a',
    '#ffcc80',
    '#fff176',
    '#c5e1a5',
    '#a5d6a7',
    '#80cbc4',
    '#80deea',
    '#90caf9',
    '#ce93d8',
    '#f48fb1',
  ],
  [
    '#e53935',
    '#fb8c00',
    '#fdd835',
    '#7cb342',
    '#43a047',
    '#00897b',
    '#1e88e5',
    '#00acc1',
    '#8e24aa',
    '#d81b60',
  ],
  [
    '#b71c1c',
    '#e65100',
    '#f9a825',
    '#558b2f',
    '#2e7d32',
    '#00695c',
    '#0d47a1',
    '#006064',
    '#4a148c',
    '#880e4f',
  ],
  [
    '#7f0000',
    '#bf360c',
    '#ff6f00',
    '#33691e',
    '#1b5e20',
    '#004d40',
    '#01579b',
    '#004e6e',
    '#311b92',
    '#212121',
  ],
]

interface SolidColorPickerProps {
  value: string
  onChange: (color: string) => void
  recentColors: string[]
  onAddRecent: (color: string) => void
}

const SolidColorPicker: React.FC<SolidColorPickerProps> = ({
  value,
  onChange,
  recentColors,
  onAddRecent,
}) => {
  const customRef = useRef<HTMLInputElement>(null)
  const v = value.toLowerCase()

  const handleSelect = (c: string) => {
    onChange(c)
    onAddRecent(c)
  }

  return (
    <div style={{ userSelect: 'none' }}>
      {SOLID_COLORS.map((row, ri) => (
        <div key={ri} style={{ display: 'flex', gap: '3px', marginBottom: '3px' }}>
          {row.map((c) => (
            <div
              key={c}
              onClick={() => handleSelect(c)}
              style={{
                width: '24px',
                height: '24px',
                background: c,
                borderRadius: '3px',
                cursor: 'pointer',
                border: v === c.toLowerCase() ? '2px solid #ffffff' : '2px solid transparent',
                boxSizing: 'border-box',
                flexShrink: 0,
                transition: 'transform 0.1s',
              }}
              onMouseOver={(e) => {
                ; (e.currentTarget as HTMLElement).style.transform = 'scale(1.25)'
              }}
              onMouseOut={(e) => {
                ; (e.currentTarget as HTMLElement).style.transform = 'scale(1)'
              }}
            />
          ))}
        </div>
      ))}
      <div style={{ borderTop: '1px solid #333', margin: '8px 0' }} />
      <div style={{ display: 'flex', gap: '3px', flexWrap: 'wrap', alignItems: 'center' }}>
        {recentColors.map((c, i) => (
          <div
            key={i}
            onClick={() => handleSelect(c)}
            style={{
              width: '24px',
              height: '24px',
              background: c,
              borderRadius: '3px',
              cursor: 'pointer',
              border: v === c.toLowerCase() ? '2px solid #ffffff' : '2px solid transparent',
              boxSizing: 'border-box',
              flexShrink: 0,
            }}
          />
        ))}
        <div
          onClick={() => customRef.current?.click()}
          style={{
            width: '24px',
            height: '24px',
            background: '#1a1a1a',
            borderRadius: '3px',
            cursor: 'pointer',
            border: '1px solid #555',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '16px',
            color: '#888',
            flexShrink: 0,
            position: 'relative',
          }}
        >
          +
          <input
            ref={customRef}
            type="color"
            defaultValue={value.startsWith('#') ? value : '#00ff5e'}
            onChange={(e) => handleSelect(e.target.value)}
            style={{ position: 'absolute', opacity: 0, width: 0, height: 0, pointerEvents: 'none' }}
          />
        </div>
      </div>
    </div>
  )
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
  indexToTimestamp,
  chartTimeframe,
  onMouseMove,
  toolbarPosition = 'top',
  navyButtonTheme = false,
}) => {
  // Navy theme helpers – used when navyButtonTheme=true (options-flow mini chart)
  const navyBtnStyle = (isToolActive: boolean, accentColor: string): React.CSSProperties => {
    if (!navyButtonTheme) return {}
    return {
      background: isToolActive
        ? 'linear-gradient(160deg, #1a2f52 0%, #0f1f38 50%, #080f20 100%)'
        : 'linear-gradient(160deg, #0d1b2e 0%, #060d1a 60%, #030912 100%)',
      border: `1px solid ${isToolActive ? accentColor : 'rgba(45,80,150,0.5)'}`,
      boxShadow: isToolActive
        ? `0 0 14px rgba(60,110,200,0.4), inset 0 1px 0 rgba(100,160,255,0.15)`
        : '0 2px 8px rgba(0,0,0,0.9), inset 0 1px 0 rgba(80,130,220,0.08)',
    }
  }
  const navyIconColor = (isToolActive: boolean, accentColor: string): string => {
    if (!navyButtonTheme) return isToolActive ? '#000' : accentColor
    return accentColor
  }
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const textInputRef = useRef<HTMLInputElement>(null)
  const [internalCurrentTool, setInternalCurrentTool] = useState<DrawingTool>('select')

  // Use external tool state if provided, otherwise use internal
  const currentTool = externalCurrentTool ?? internalCurrentTool
  const setCurrentTool = externalSetCurrentTool ?? setInternalCurrentTool
  const [currentPoints, setCurrentPoints] = useState<DrawingPoint[]>([])
  const [previewPoint, setPreviewPoint] = useState<DrawingPoint | null>(null)
  const [isDrawing, setIsDrawing] = useState(false)
  const [color, setColor] = useState('#00ff5e')
  const [selectedDrawing, setSelectedDrawing] = useState<string | null>(null)
  const [textInputVisible, setTextInputVisible] = useState(false)
  const [textInputPosition, setTextInputPosition] = useState<{ x: number; y: number }>({
    x: 0,
    y: 0,
  })
  const [textInputValue, setTextInputValue] = useState('')
  const [draggedDrawing, setDraggedDrawing] = useState<string | null>(null)
  const [dragOffset, setDragOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 })
  const [dragStartDataPoint, setDragStartDataPoint] = useState<{
    time: number
    price: number
  } | null>(null)
  const [originalDrawingPoints, setOriginalDrawingPoints] = useState<DrawingPoint[] | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [editingDrawing, setEditingDrawing] = useState<string | null>(null)
  const [draggedControlPoint, setDraggedControlPoint] = useState<number | null>(null)
  const [editingTextId, setEditingTextId] = useState<string | null>(null)
  const [propertiesEditorVisible, setPropertiesEditorVisible] = useState(false)
  const [editingPropertiesId, setEditingPropertiesId] = useState<string | null>(null)
  const [tempColor, setTempColor] = useState<string>('#00ff5e')
  const [tempBgColor, setTempBgColor] = useState<string>('#00ff5e')
  const [recentColors, setRecentColors] = useState<string[]>(() => {
    try {
      const saved =
        typeof window !== 'undefined' ? localStorage.getItem('lwChartRecentColors') : null
      return saved ? JSON.parse(saved) : []
    } catch {
      return []
    }
  })
  const [showToolbarColorPicker, setShowToolbarColorPicker] = useState(false)
  const toolbarColorPickerRef = useRef<HTMLDivElement>(null)
  const addRecentColor = useCallback((c: string) => {
    setRecentColors((prev) => {
      const next = [c, ...prev.filter((x) => x !== c)].slice(0, 10)
      try {
        localStorage.setItem('lwChartRecentColors', JSON.stringify(next))
      } catch { }
      return next
    })
  }, [])
  const [isBrushing, setIsBrushing] = useState(false)
  const [brushSize, setBrushSize] = useState(4)
  const lastBrushScreenPosRef = useRef<{ x: number; y: number } | null>(null)
  const dragAnimationFrameRef = useRef<number | null>(null)
  const [justCompletedDrawing, setJustCompletedDrawing] = useState(false)
  const pendingUpdateRef = useRef<(() => void) | null>(null)
  const isAnimatingRef = useRef(false)
  const lastDrawingsRef = useRef<Drawing[]>(drawings)
  const pendingMousePositionRef = useRef<{ x: number; y: number } | null>(null)
  const isProcessingDragRef = useRef(false)
  const isDraggingRef = useRef(false)
  const propertiesPanelRef = useRef<HTMLDivElement>(null)

  // Close properties panel on click outside
  useEffect(() => {
    if (!propertiesEditorVisible) return
    const handler = (e: MouseEvent) => {
      if (propertiesPanelRef.current && !propertiesPanelRef.current.contains(e.target as Node)) {
        setPropertiesEditorVisible(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [propertiesEditorVisible])

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

  // Close toolbar color picker when clicking outside
  useEffect(() => {
    if (!showToolbarColorPicker) return
    const handler = (e: MouseEvent) => {
      if (
        toolbarColorPickerRef.current &&
        !toolbarColorPickerRef.current.contains(e.target as Node)
      ) {
        setShowToolbarColorPicker(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showToolbarColorPicker])

  // Initialize canvas
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const dpr = window.devicePixelRatio || 1
    canvas.width = Math.round(width * dpr)
    canvas.height = Math.round(height * dpr)
    canvas.style.width = `${width}px`
    canvas.style.height = `${height}px`
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

  // Keep isDraggingRef in sync so the stable window listener can read current drag state
  useEffect(() => {
    isDraggingRef.current = isDragging
  }, [isDragging])

  // Global mouseup handler (stable — empty deps, reads from ref to avoid stale closures)
  useEffect(() => {
    const handleGlobalMouseUp = () => {
      if (isDraggingRef.current) {
        if (dragAnimationFrameRef.current) {
          cancelAnimationFrame(dragAnimationFrameRef.current)
          dragAnimationFrameRef.current = null
        }
        isProcessingDragRef.current = false
        pendingMousePositionRef.current = null
        isDraggingRef.current = false
        setIsDragging(false)
        setDraggedDrawing(null)
        setDraggedControlPoint(null)
        setDragStartDataPoint(null)
        setOriginalDrawingPoints(null)
      }
    }

    window.addEventListener('mouseup', handleGlobalMouseUp)
    return () => window.removeEventListener('mouseup', handleGlobalMouseUp)
  }, [])

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

    const dpr = window.devicePixelRatio || 1

    // Resize canvas buffer to physical pixels for crisp HiDPI/retina rendering
    const physW = Math.round(width * dpr)
    const physH = Math.round(height * dpr)
    if (canvas.width !== physW || canvas.height !== physH) {
      canvas.width = physW
      canvas.height = physH
      canvas.style.width = `${width}px`
      canvas.style.height = `${height}px`
    }

    // Reset to identity transform, clear full physical canvas, then apply DPR scale
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

    // Crisp, fully-opaque rendering defaults
    ctx.imageSmoothingEnabled = false
    ctx.globalAlpha = 1.0
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'

    // Draw all completed drawings
    drawings.forEach((drawing) => {
      const opacity = drawing.opacity ?? 1.0
      ctx.globalAlpha = opacity
      ctx.strokeStyle = drawing.color
      ctx.fillStyle = drawing.color
      ctx.lineWidth = drawing.lineWidth || 4

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
        ctx.lineTo(width, screenY)
        ctx.stroke()

        // Draw price indicator
        ctx.fillStyle = drawing.color
        ctx.fillRect(width - 80, screenY - 13, 76, 26)
        ctx.globalAlpha = 1.0
        ctx.fillStyle = '#000000'
        ctx.font = 'bold 22px monospace'
        ctx.fillText(p.price.toFixed(2), width - 77, screenY + 6)
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
        ctx.lineTo(width, screenY)
        ctx.stroke()

        // Draw price indicator
        ctx.fillStyle = drawing.color
        ctx.fillRect(width - 80, screenY - 13, 76, 26)
        ctx.globalAlpha = 1.0
        ctx.fillStyle = '#000000'
        ctx.font = 'bold 22px monospace'
        ctx.fillText(p.price.toFixed(2), width - 77, screenY + 6)
        ctx.globalAlpha = opacity

        // Show control point if editing
        if (editingDrawing === drawing.id) {
          ctx.fillStyle = '#3b82f6'
          ctx.beginPath()
          ctx.arc(startPoint.x, screenY, 6, 0, Math.PI * 2)
          ctx.fill()
        }
      } else if (drawing.type === 'vertical' && drawing.points.length === 1) {
        const p = drawing.points[0]
        const screenX = timeToScreen!(p.time)

        ctx.strokeStyle = drawing.color
        ctx.beginPath()
        ctx.moveTo(screenX, 0)
        ctx.lineTo(screenX, height)
        ctx.stroke()

        // Date/time label at the bottom (x-axis)
        const ts = indexToTimestamp ? indexToTimestamp(p.time) : p.time  // ms
        // p.time is now stored as Unix ms directly; indexToTimestamp is a fallback for legacy
        const d = new Date(p.time || ts)
        // Show time only on sub-daily timeframes
        const dailyOrAbove = ['1D', '1d', '1W', '1w', '1M', '1m_monthly', 'W', 'D', 'daily', 'weekly', 'monthly']
        const isIntraday = chartTimeframe
          ? !dailyOrAbove.some(tf => chartTimeframe.toUpperCase() === tf.toUpperCase() || chartTimeframe === tf)
          : (d.getUTCHours() * 60 + d.getUTCMinutes()) !== 0
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
        const dateStr = `${d.getUTCDate()} ${months[d.getUTCMonth()]} '${String(d.getUTCFullYear()).slice(2)}`
        const timeStr = `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`
        const label = isIntraday ? `${dateStr}  ${timeStr}` : dateStr
        ctx.save()
        ctx.font = 'bold 25px monospace'
        const labelW = ctx.measureText(label).width + 16
        const labelH = 28
        const lx = screenX - labelW / 2
        const ly = height - labelH - 18

        // Badge background — black like the chart x-axis
        ctx.fillStyle = '#000000'
        ctx.globalAlpha = 1
        ctx.beginPath()
        ctx.roundRect(lx, ly, labelW, labelH, 3)
        ctx.fill()
        // Badge text — solid orange
        ctx.fillStyle = '#ff7800'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(label, screenX, ly + labelH / 2)
        ctx.textAlign = 'left'
        ctx.textBaseline = 'alphabetic'
        ctx.restore()

        // Show control point if editing
        if (editingDrawing === drawing.id) {
          ctx.fillStyle = '#3b82f6'
          ctx.beginPath()
          ctx.arc(screenX, height / 2, 6, 0, Math.PI * 2)
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
        const isBuy = drawing.type === 'buyZone'
        const [p1, p2] = drawing.points
        const screen1 = toScreenCoords(p1)
        const screen2 = toScreenCoords(p2)
        const x1 = Math.min(screen1.x, screen2.x)
        const x2 = Math.max(screen1.x, screen2.x)
        const cy = screen1.y
        const zh = drawing.zoneHeight ?? 50   // signed: +ve above, -ve below
        const shape = drawing.zoneShape ?? 'flat'
        const diagOff = drawing.zoneDiagOffset ?? 0  // right-side Y shift (whole rect)
        const midX = (x1 + x2) / 2

        // Left-side top/bottom
        const topL = zh >= 0 ? cy - zh : cy
        const botL = zh >= 0 ? cy : cy - zh  // cy + |zh| when zh<0
        // Right-side (diagonal only): shift entire right side by diagOff
        const topR = topL + (shape === 'diagonal' ? diagOff : 0)
        const botR = botL + (shape === 'diagonal' ? diagOff : 0)

        const zoneColor = isBuy ? '#00ff88' : '#ff3366'

        if (shape === 'curve') {
          // ── CURVE: single glowing bezier line, 3 free control points ──
          const ctrlX = midX + (drawing.zoneCurveCtrlX ?? 0)
          const ctrlY = cy - zh
          const sx0 = screen1.x, sy0 = screen1.y
          const sx1 = screen2.x, sy1 = screen2.y
          const alpha = drawing.opacity ?? 1

          ctx.save()
          ctx.lineCap = 'round'
          ctx.strokeStyle = zoneColor

          // Outer soft glow
          ctx.globalAlpha = 0.18 * alpha
          ctx.lineWidth = 18
          ctx.beginPath(); ctx.moveTo(sx0, sy0); ctx.quadraticCurveTo(ctrlX, ctrlY, sx1, sy1); ctx.stroke()

          // Mid glow
          ctx.globalAlpha = 0.40 * alpha
          ctx.lineWidth = 8
          ctx.beginPath(); ctx.moveTo(sx0, sy0); ctx.quadraticCurveTo(ctrlX, ctrlY, sx1, sy1); ctx.stroke()

          // Inner glow
          ctx.globalAlpha = 0.65 * alpha
          ctx.lineWidth = 3
          ctx.beginPath(); ctx.moveTo(sx0, sy0); ctx.quadraticCurveTo(ctrlX, ctrlY, sx1, sy1); ctx.stroke()

          // Core line — full brightness
          ctx.globalAlpha = alpha
          ctx.lineWidth = 1.5
          ctx.beginPath(); ctx.moveTo(sx0, sy0); ctx.quadraticCurveTo(ctrlX, ctrlY, sx1, sy1); ctx.stroke()

          // Label at right endpoint
          ctx.font = 'bold 11px monospace'
          ctx.fillStyle = zoneColor
          ctx.globalAlpha = 0.9 * alpha
          ctx.fillText(isBuy ? '▲ BUY ZONE' : '▼ SELL ZONE', sx1 + 10, sy1)
          ctx.restore()

          // Control handles when editing
          if (editingDrawing === drawing.id) {
            ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5
            ctx.fillStyle = '#3b82f6'
            ctx.beginPath(); ctx.arc(sx0, sy0, 7, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
            ctx.beginPath(); ctx.arc(sx1, sy1, 7, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
            ctx.beginPath(); ctx.arc(ctrlX, ctrlY, 7, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
          }
        } else {
          // ── FLAT / DIAGONAL: filled zone band ──
          const fillColor1 = isBuy ? 'rgba(0,255,136,0.20)' : 'rgba(255,51,102,0.20)'
          const fillColor2 = isBuy ? 'rgba(0,255,136,0.03)' : 'rgba(255,51,102,0.03)'

          ctx.globalAlpha = drawing.opacity ?? 1
          ctx.save()

          ctx.beginPath()
          if (shape === 'diagonal') {
            ctx.moveTo(x1, topL); ctx.lineTo(x2, topR)
            ctx.lineTo(x2, botR); ctx.lineTo(x1, botL)
            ctx.closePath()
          } else {
            ctx.rect(x1, topL, x2 - x1, botL - topL)
          }

          // Gradient fill
          const gradTop = Math.min(topL, topR) - 1
          const gradBot = Math.max(botL, botR) + 1
          const grad = ctx.createLinearGradient(0, gradTop, 0, gradBot)
          grad.addColorStop(0, fillColor1); grad.addColorStop(1, fillColor2)
          ctx.fillStyle = grad; ctx.fill()

          // Multi-stroke glow
          ctx.strokeStyle = zoneColor
          ctx.lineWidth = 4; ctx.globalAlpha = 0.12; ctx.stroke()
          ctx.lineWidth = 2; ctx.globalAlpha = 0.35; ctx.stroke()
          ctx.lineWidth = 1.5; ctx.globalAlpha = drawing.opacity ?? 1; ctx.stroke()

          // Label — right side, tilted for diagonal
          ctx.font = 'bold 11px monospace'
          ctx.fillStyle = zoneColor
          ctx.globalAlpha = 0.9
          ctx.textAlign = 'right'
          if (shape === 'diagonal') {
            const angle = Math.atan2(topR - topL, x2 - x1)
            ctx.save()
            ctx.translate(x2 - 8, topR + 4)
            ctx.rotate(angle)
            ctx.fillText(isBuy ? '▲ BUY ZONE' : '▼ SELL ZONE', 0, 12)
            ctx.restore()
          } else {
            ctx.fillText(isBuy ? '▲ BUY ZONE' : '▼ SELL ZONE', x2 - 8, Math.min(topL, topR) + 16)
          }
          ctx.textAlign = 'left'

          ctx.restore()
          ctx.globalAlpha = 1

          // Control handles when editing
          if (editingDrawing === drawing.id) {
            ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5
            const la0Y = shape === 'diagonal' ? botL : cy
            const la1Y = shape === 'diagonal' ? botR : cy
            ctx.fillStyle = '#3b82f6'
            ctx.beginPath(); ctx.arc(x1, la0Y, 7, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
            ctx.beginPath(); ctx.arc(x2, la1Y, 7, 0, Math.PI * 2); ctx.fill(); ctx.stroke()

            if (shape === 'diagonal') {
              const lcY = (topL + botL) / 2
              ctx.fillStyle = '#facc15'
              ctx.setLineDash([4, 3])
              ctx.strokeStyle = '#facc1555'; ctx.lineWidth = 1
              ctx.beginPath(); ctx.moveTo(x1, topL); ctx.lineTo(x1, botL); ctx.stroke()
              ctx.setLineDash([]); ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5
              ctx.beginPath(); ctx.arc(x1, lcY, 7, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
            } else {
              const farY = zh >= 0 ? topL : botL
              ctx.fillStyle = '#facc15'
              ctx.setLineDash([4, 3])
              ctx.strokeStyle = '#facc1555'; ctx.lineWidth = 1
              ctx.beginPath(); ctx.moveTo(midX, cy); ctx.lineTo(midX, farY); ctx.stroke()
              ctx.setLineDash([]); ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5
              ctx.beginPath(); ctx.arc(midX, farY, 7, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
            }
          }
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
        ctx.lineWidth = drawing.lineWidth || 4
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
      } else if (drawing.type === 'fib' && drawing.points.length === 2) {
        const [p1raw, p2raw] = drawing.points
        const p1 = drawing.fibReverse ? p2raw : p1raw
        const p2 = drawing.fibReverse ? p1raw : p2raw
        const screen1 = toScreenCoords(p1)
        const screen2 = toScreenCoords(p2)
        const levels: FibLevel[] = drawing.fibLevels ?? DEFAULT_FIB_LEVELS
        const oneColor = drawing.fibUseOneColor ? drawing.color : null
        const priceRange = p2.price - p1.price

        // Trend line
        const trendStyle = drawing.fibTrendLineStyle ?? 'dashed'
        ctx.strokeStyle = drawing.color
        ctx.lineWidth = drawing.lineWidth || 2
        if (trendStyle === 'dashed') ctx.setLineDash([8, 4])
        else if (trendStyle === 'dotted') ctx.setLineDash([2, 3])
        else ctx.setLineDash([])
        ctx.globalAlpha = opacity
        ctx.beginPath()
        ctx.moveTo(screen1.x, screen1.y)
        ctx.lineTo(screen2.x, screen2.y)
        ctx.stroke()
        ctx.setLineDash([])

        // Endpoint dots
        ctx.fillStyle = drawing.color
        ctx.beginPath()
        ctx.arc(screen1.x, screen1.y, 5, 0, Math.PI * 2)
        ctx.fill()
        ctx.beginPath()
        ctx.arc(screen2.x, screen2.y, 5, 0, Math.PI * 2)
        ctx.fill()

        // Background fill between adjacent levels
        if (drawing.fibBackground) {
          const bgOp = drawing.fibBackgroundOpacity ?? 0.08
          const sortedEnabled = levels.filter(l => l.enabled).map(l => l.value).sort((a, b) => a - b)
          for (let i = 0; i < sortedEnabled.length - 1; i++) {
            const yA = priceToScreen ? priceToScreen(p1.price + sortedEnabled[i] * priceRange) : 0
            const yB = priceToScreen ? priceToScreen(p1.price + sortedEnabled[i + 1] * priceRange) : 0
            ctx.globalAlpha = bgOp
            ctx.fillStyle = oneColor ?? levels.find(l => l.value === sortedEnabled[i])?.color ?? drawing.color
            ctx.fillRect(0, Math.min(yA, yB), width, Math.abs(yB - yA))
            ctx.globalAlpha = opacity
          }
        }

        // Level lines + labels — drawn between the x extents of the two endpoints
        ctx.lineWidth = 1
        const xLeft = Math.min(screen1.x, screen2.x)
        const xRight = Math.max(screen1.x, screen2.x)
        levels.filter(l => l.enabled).forEach(level => {
          const levelPrice = p1.price + level.value * priceRange
          const screenY = priceToScreen ? priceToScreen(levelPrice) : 0
          const levelColor = oneColor ?? level.color
          ctx.strokeStyle = levelColor
          ctx.globalAlpha = opacity
          ctx.setLineDash([])
          ctx.beginPath()
          ctx.moveTo(xLeft, screenY)
          ctx.lineTo(xRight, screenY)
          ctx.stroke()
          ctx.fillStyle = levelColor
          ctx.font = 'bold 11px monospace'
          ctx.textBaseline = 'bottom'
          const label = `${level.value} (${levelPrice.toFixed(2)})`
          ctx.fillText(label, xLeft + 4, screenY - 2)
          ctx.textBaseline = 'alphabetic'
        })

        if (editingDrawing === drawing.id) {
          ctx.fillStyle = '#3b82f6'
          ctx.setLineDash([])
            ;[screen1, screen2].forEach(pt => {
              ctx.beginPath()
              ctx.arc(pt.x, pt.y, 7, 0, Math.PI * 2)
              ctx.fill()
            })
        }
      } else if ((drawing.type === 'elliottWave' || drawing.type === 'elliottWaveABC') && drawing.points.length >= 2) {
        // Labels: impulse = 0,1,2,3,4,5  ABC corrective = 0,A,B,C
        const waveLabels = drawing.type === 'elliottWaveABC' ? ['0', 'A', 'B', 'C'] : ['0', '1', '2', '3', '4', '5']
        const pts = drawing.points.map(p => toScreenCoords(p))
        ctx.strokeStyle = drawing.color
        ctx.lineWidth = drawing.lineWidth || 2
        ctx.setLineDash([])
        ctx.globalAlpha = opacity
        ctx.beginPath()
        ctx.moveTo(pts[0].x, pts[0].y)
        for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y)
        ctx.stroke()
        pts.forEach((pt, i) => {
          if (i >= waveLabels.length) return
          // Solid black circle background with white text
          ctx.fillStyle = '#000000'
          ctx.beginPath()
          ctx.arc(pt.x, pt.y, 10, 0, Math.PI * 2)
          ctx.fill()
          ctx.strokeStyle = '#ffffff'
          ctx.lineWidth = 1.5
          ctx.beginPath()
          ctx.arc(pt.x, pt.y, 10, 0, Math.PI * 2)
          ctx.stroke()
          ctx.fillStyle = '#ffffff'
          ctx.font = 'bold 10px sans-serif'
          ctx.textAlign = 'center'
          ctx.textBaseline = 'middle'
          ctx.fillText(waveLabels[i], pt.x, pt.y)
          ctx.textAlign = 'left'
          ctx.textBaseline = 'alphabetic'
          ctx.lineWidth = drawing.lineWidth || 2
          ctx.strokeStyle = drawing.color
        })
        if (editingDrawing === drawing.id) {
          ctx.fillStyle = '#3b82f6'
          pts.forEach(pt => {
            ctx.beginPath()
            ctx.arc(pt.x, pt.y, 5, 0, Math.PI * 2)
            ctx.fill()
          })
        }
      } else if (drawing.type === 'path' && drawing.points.length >= 2) {
        ctx.strokeStyle = drawing.color
        ctx.lineWidth = drawing.lineWidth || 3
        ctx.globalAlpha = opacity
        if (drawing.lineStyle === 'dashed') ctx.setLineDash([10, 5])
        else if (drawing.lineStyle === 'dotted') ctx.setLineDash([2, 3])
        else ctx.setLineDash([])
        const pts = drawing.points.map(p => toScreenCoords(p))
        ctx.beginPath()
        ctx.moveTo(pts[0].x, pts[0].y)
        for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y)
        ctx.stroke()
        ctx.setLineDash([])

        const endStyle = drawing.pathEndStyle ?? 'none'
        const r = Math.max(3, (drawing.lineWidth || 3) * 1.5)
        ctx.fillStyle = drawing.color

        if (endStyle === 'circle') {
          pts.forEach(pt => {
            ctx.beginPath()
            ctx.arc(pt.x, pt.y, r, 0, Math.PI * 2)
            ctx.fill()
          })
        } else if (endStyle === 'arrow') {
          // Draw arrowhead at the last segment end (last point)
          for (let i = 0; i < pts.length - 1; i++) {
            const from = pts[i]
            const to = pts[i + 1]
            const angle = Math.atan2(to.y - from.y, to.x - from.x)
            const aLen = Math.max(8, (drawing.lineWidth || 2) * 4)
            const aWidth = Math.PI / 6
            ctx.beginPath()
            ctx.moveTo(to.x, to.y)
            ctx.lineTo(to.x - aLen * Math.cos(angle - aWidth), to.y - aLen * Math.sin(angle - aWidth))
            ctx.lineTo(to.x - aLen * Math.cos(angle + aWidth), to.y - aLen * Math.sin(angle + aWidth))
            ctx.closePath()
            ctx.fill()
          }
        } else {
          // none: small dot only at each vertex for visibility
          pts.forEach(pt => {
            ctx.beginPath()
            ctx.arc(pt.x, pt.y, 3, 0, Math.PI * 2)
            ctx.fill()
          })
        }

        if (editingDrawing === drawing.id) {
          ctx.fillStyle = '#3b82f6'
          pts.forEach(pt => {
            ctx.beginPath()
            ctx.arc(pt.x, pt.y, 6, 0, Math.PI * 2)
            ctx.fill()
          })
        }
      } else if (drawing.type === 'brush' && drawing.points.length > 1) {
        ctx.strokeStyle = drawing.color
        ctx.lineWidth = drawing.lineWidth || 4
        ctx.lineCap = 'round'
        ctx.lineJoin = 'round'

        const pts = drawing.points.map(p => toScreenCoords(p))
        ctx.beginPath()
        ctx.moveTo(pts[0].x, pts[0].y)
        for (let i = 1; i < pts.length - 1; i++) {
          const midX = (pts[i].x + pts[i + 1].x) / 2
          const midY = (pts[i].y + pts[i + 1].y) / 2
          ctx.quadraticCurveTo(pts[i].x, pts[i].y, midX, midY)
        }
        ctx.lineTo(pts[pts.length - 1].x, pts[pts.length - 1].y)
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
      ctx.lineWidth = 4
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
        const isBuy = currentTool === 'buyZone'
        const p1 = currentPoints[0]
        const p2 = previewPoint
        const screen1 = toScreenCoords(p1)
        const screen2 = toScreenCoords(p2)
        const x1 = Math.min(screen1.x, screen2.x)
        const x2 = Math.max(screen1.x, screen2.x)
        const cy = screen1.y
        const zh = 50  // default preview height
        const zoneColor = isBuy ? '#00ff88' : '#ff3366'
        const fillColor = isBuy ? 'rgba(0,255,136,0.15)' : 'rgba(255,51,102,0.15)'
        ctx.globalAlpha = 0.85
        ctx.fillStyle = fillColor
        ctx.fillRect(x1, cy - zh, x2 - x1, zh)
        ctx.globalAlpha = 1
        ctx.strokeStyle = zoneColor
        ctx.lineWidth = 1.5
        ctx.setLineDash([6, 3])
        ctx.strokeRect(x1, cy - zh, x2 - x1, zh)
        ctx.setLineDash([])
        ctx.font = 'bold 11px monospace'
        ctx.fillStyle = zoneColor
        ctx.fillText(isBuy ? '▲ BUY ZONE' : '▼ SELL ZONE', x1 + 8, cy - zh + 16)
        ctx.globalAlpha = 1
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
        ctx.lineWidth = 4
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
        // Draw brush preview while drawing - smooth bezier
        ctx.strokeStyle = color
        ctx.lineWidth = brushSize
        ctx.lineCap = 'round'
        ctx.lineJoin = 'round'

        const pts = currentPoints.map(p => toScreenCoords(p))
        ctx.beginPath()
        ctx.moveTo(pts[0].x, pts[0].y)
        for (let i = 1; i < pts.length - 1; i++) {
          const midX = (pts[i].x + pts[i + 1].x) / 2
          const midY = (pts[i].y + pts[i + 1].y) / 2
          ctx.quadraticCurveTo(pts[i].x, pts[i].y, midX, midY)
        }
        if (pts.length > 1) {
          ctx.lineTo(pts[pts.length - 1].x, pts[pts.length - 1].y)
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
      } else if (currentTool === 'fib' && currentPoints.length === 1 && previewPoint) {
        const p1 = currentPoints[0]
        const p2 = previewPoint
        const screen1 = toScreenCoords(p1)
        const screen2 = toScreenCoords(p2)
        const priceRange = p2.price - p1.price
        ctx.strokeStyle = color
        ctx.lineWidth = 2
        ctx.setLineDash([8, 4])
        ctx.beginPath()
        ctx.moveTo(screen1.x, screen1.y)
        ctx.lineTo(screen2.x, screen2.y)
        ctx.stroke()
        ctx.setLineDash([])
        DEFAULT_FIB_LEVELS.filter(l => l.enabled).forEach(level => {
          const levelPrice = p1.price + level.value * priceRange
          const screenY = priceToScreen ? priceToScreen(levelPrice) : 0
          ctx.strokeStyle = level.color
          ctx.lineWidth = 1
          ctx.beginPath()
          ctx.moveTo(0, screenY)
          ctx.lineTo(width, screenY)
          ctx.stroke()
          ctx.fillStyle = level.color
          ctx.font = 'bold 11px monospace'
          ctx.textBaseline = 'bottom'
          ctx.fillText(`${level.value}`, 4, screenY - 2)
          ctx.textBaseline = 'alphabetic'
        })
      } else if ((currentTool === 'elliottWave' || currentTool === 'elliottWaveABC' || currentTool === 'path') && currentPoints.length >= 1 && previewPoint) {
        const allPts = [...currentPoints, previewPoint].map(p => toScreenCoords(p))
        ctx.strokeStyle = color
        ctx.lineWidth = 2
        ctx.setLineDash([5, 3])
        ctx.beginPath()
        ctx.moveTo(allPts[0].x, allPts[0].y)
        for (let i = 1; i < allPts.length; i++) ctx.lineTo(allPts[i].x, allPts[i].y)
        ctx.stroke()
        ctx.setLineDash([])
        // Draw labels for placed points
        if (currentTool === 'elliottWave' || currentTool === 'elliottWaveABC') {
          const labels = currentTool === 'elliottWaveABC' ? ['0', 'A', 'B', 'C'] : ['0', '1', '2', '3', '4', '5']
          currentPoints.forEach((p, i) => {
            if (i >= labels.length) return
            const pt = toScreenCoords(p)
            ctx.fillStyle = '#000'
            ctx.beginPath()
            ctx.arc(pt.x, pt.y, 10, 0, Math.PI * 2)
            ctx.fill()
            ctx.strokeStyle = '#ffffff'
            ctx.lineWidth = 1.5
            ctx.beginPath()
            ctx.arc(pt.x, pt.y, 10, 0, Math.PI * 2)
            ctx.stroke()
            ctx.fillStyle = '#ffffff'
            ctx.font = 'bold 10px sans-serif'
            ctx.textAlign = 'center'
            ctx.textBaseline = 'middle'
            ctx.fillText(labels[i], pt.x, pt.y)
            ctx.textAlign = 'left'
            ctx.textBaseline = 'alphabetic'
            ctx.strokeStyle = color
            ctx.lineWidth = 2
          })
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
        lineWidth: 4,
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
        const isBuy = currentTool === 'buyZone'
        const zoneColor = isBuy ? '#00ff88' : '#ff3366'
        const newDrawing: Drawing = {
          id: Date.now().toString(),
          type: currentTool,
          points: newPoints,
          color: zoneColor,
          lineWidth: 2,
          zoneHeight: 50,
          zoneShape: 'flat',
          zoneDiagOffset: 0,
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
          lineWidth: 4,
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
    } else if (currentTool === 'fib') {
      const newPoints = [...currentPoints, point]
      if (newPoints.length === 2) {
        const newDrawing: Drawing = {
          id: Date.now().toString(),
          type: 'fib',
          points: newPoints,
          color,
          lineWidth: 2,
          fibLevels: DEFAULT_FIB_LEVELS.map(l => ({ ...l })),
          fibShowPrices: false,
          fibReverse: false,
          fibUseOneColor: false,
          fibBackground: false,
          fibBackgroundOpacity: 0.08,
          fibTrendLineStyle: 'dashed',
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
    } else if (currentTool === 'elliottWaveABC') {
      const newPoints = [...currentPoints, point]
      // ABC corrective: 4 points (labels 0,A,B,C)
      if (newPoints.length === 4) {
        const newDrawing: Drawing = {
          id: Date.now().toString(),
          type: 'elliottWaveABC',
          points: newPoints,
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
      } else {
        setCurrentPoints(newPoints)
        setPreviewPoint(null)
      }
    } else if (currentTool === 'elliottWave') {
      const newPoints = [...currentPoints, point]
      // Impulse: 6 points (labels 0,1,2,3,4,5)
      if (newPoints.length === 6) {
        const newDrawing: Drawing = {
          id: Date.now().toString(),
          type: 'elliottWave',
          points: newPoints,
          color,
          lineWidth: 2,
          elliottType: 'impulse',
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
    } else if (currentTool === 'path') {
      // Path: keep adding points; double-click completes
      setCurrentPoints([...currentPoints, point])
      setPreviewPoint(null)
    }
  }

  const handleCanvasMouseMove = (e: React.PointerEvent<HTMLDivElement>) => {
    // Always forward mouse position to parent so the main chart crosshair stays active
    onMouseMove?.(e)

    const canvas = canvasRef.current
    if (!canvas || !screenToPrice || !screenToTime) return

    const rect = canvas.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top

    // Handle brush tool - add points while mouse is down
    if (isBrushing && currentTool === 'brush') {
      // Minimum distance threshold to avoid noisy/jagged strokes
      const last = lastBrushScreenPosRef.current
      if (last) {
        const dist = Math.hypot(x - last.x, y - last.y)
        if (dist < 3) return // skip if movement is too small
      }
      lastBrushScreenPosRef.current = { x, y }
      e.stopPropagation()
      e.preventDefault()
      const point: DrawingPoint = {
        time: screenToTime(x),
        price: screenToPrice(y),
      }
      // Use functional update to avoid stale closure bug
      setCurrentPoints(prev => [...prev, point])
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
              if (draggedControlPoint === 0) {
                // Top-left
                newP1 = { time: newDataPoint.time, price: newDataPoint.price }
                newP2 = { time: maxX, price: maxY }
              } else if (draggedControlPoint === 1) {
                // Top-right
                newP1 = { time: minX, price: newDataPoint.price }
                newP2 = { time: newDataPoint.time, price: maxY }
              } else if (draggedControlPoint === 2) {
                // Bottom-right
                newP1 = { time: minX, price: minY }
                newP2 = { time: newDataPoint.time, price: newDataPoint.price }
              } else if (draggedControlPoint === 3) {
                // Bottom-left
                newP1 = { time: newDataPoint.time, price: minY }
                newP2 = { time: maxX, price: newDataPoint.price }
              } else if (draggedControlPoint === 4) {
                // Top edge
                newP1 = { time: minX, price: newDataPoint.price }
                newP2 = { time: maxX, price: maxY }
              } else if (draggedControlPoint === 5) {
                // Right edge
                newP1 = { time: minX, price: minY }
                newP2 = { time: newDataPoint.time, price: maxY }
              } else if (draggedControlPoint === 6) {
                // Bottom edge
                newP1 = { time: minX, price: minY }
                newP2 = { time: maxX, price: newDataPoint.price }
              } else if (draggedControlPoint === 7) {
                // Left edge
                newP1 = { time: newDataPoint.time, price: minY }
                newP2 = { time: maxX, price: maxY }
              }

              return {
                ...drawing,
                points: [newP1, newP2],
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
              const s1 = toScreenCoords(p1)
              const cy = s1.y
              const shape = drawing.zoneShape ?? 'flat'
              const zh = drawing.zoneHeight ?? 50

              if (shape === 'curve') {
                // Curve: all 3 points fully free
                if (draggedControlPoint === 0) {
                  return { ...drawing, points: [newDataPoint, p2] }
                } else if (draggedControlPoint === 1) {
                  return { ...drawing, points: [p1, newDataPoint] }
                } else if (draggedControlPoint === 2) {
                  // Control point: update both Y (zoneHeight) and X (zoneCurveCtrlX)
                  const mx = (toScreenCoords(p1).x + toScreenCoords(p2).x) / 2
                  return { ...drawing, zoneHeight: cy - currentY, zoneCurveCtrlX: currentX - mx }
                }
                return drawing
              }
              if (draggedControlPoint === 0) {
                // Left time anchor — x only
                return { ...drawing, points: [{ time: newDataPoint.time, price: p1.price }, p2] }
              } else if (draggedControlPoint === 1) {
                // Right anchor — x always; for diagonal also sets tilt via y
                if (shape === 'diagonal') {
                  const botL = zh >= 0 ? cy : cy - zh
                  return {
                    ...drawing,
                    points: [p1, { time: newDataPoint.time, price: p2.price }],
                    zoneDiagOffset: currentY - botL,
                  }
                }
                return { ...drawing, points: [p1, { time: newDataPoint.time, price: p2.price }] }
              } else if (draggedControlPoint === 2) {
                // Yellow height handle — signed, up or down from anchor
                return { ...drawing, zoneHeight: cy - currentY }
              }
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
            } else if (drawing.type === 'fib' && drawing.points.length === 2) {
              const newPoints = [...drawing.points]
              newPoints[draggedControlPoint] = newDataPoint
              return { ...drawing, points: newPoints }
            } else if (
              (drawing.type === 'elliottWave' || drawing.type === 'path') &&
              draggedControlPoint < drawing.points.length
            ) {
              const newPoints = [...drawing.points]
              newPoints[draggedControlPoint] = newDataPoint
              return { ...drawing, points: newPoints }
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
              drawing.type === 'brush' ||
              drawing.type === 'fib' ||
              drawing.type === 'elliottWave' ||
              drawing.type === 'elliottWaveABC' ||
              drawing.type === 'path'
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
                points: [
                  {
                    time: originalDrawingPoints[0].time + dTime,
                    price: originalDrawingPoints[0].price + dPrice,
                  },
                ],
              }
            } else if (drawing.type === 'vertical') {
              return {
                ...drawing,
                points: [
                  {
                    time: originalDrawingPoints[0].time + dTime,
                    price: originalDrawingPoints[0].price,
                  },
                ],
              }
            }
          }
          return drawing
        })

        setDrawings(updatedDrawings)
        return
      }

      // For parallel channel, allow preview with 1 or 2 points
      // For elliottWave / path, allow preview with any number of points >= 1
      if (currentTool === 'parallelChannel') {
        if (currentPoints.length !== 1 && currentPoints.length !== 2) return
      } else if (currentTool === 'elliottWave' || currentTool === 'elliottWaveABC' || currentTool === 'path' || currentTool === 'fib') {
        if (currentPoints.length < 1) return
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
      const s1 = toScreenCoords(drawing.points[0])
      const s2 = toScreenCoords(drawing.points[1])
      const x1 = Math.min(s1.x, s2.x)
      const x2 = Math.max(s1.x, s2.x)
      const cy = s1.y
      const zh = drawing.zoneHeight ?? 50
      const shape = drawing.zoneShape ?? 'flat'
      const diagOff = drawing.zoneDiagOffset ?? 0
      const midX = (x1 + x2) / 2
      const topL = zh >= 0 ? cy - zh : cy
      const botL = zh >= 0 ? cy : cy - zh
      const topR = topL + (shape === 'diagonal' ? diagOff : 0)
      const botR = botL + (shape === 'diagonal' ? diagOff : 0)

      if (shape === 'curve') {
        // 3 fully free points: p0=start, p1=end, p2=bezier ctrl
        if (Math.hypot(x - s1.x, y - s1.y) < threshold) return 0
        if (Math.hypot(x - s2.x, y - s2.y) < threshold) return 1
        const ctrlX = (s1.x + s2.x) / 2 + (drawing.zoneCurveCtrlX ?? 0)
        const ctrlY = s1.y - zh
        if (Math.hypot(x - ctrlX, y - ctrlY) < threshold) return 2
        return null
      }
      // cp0 = left anchor, cp1 = right anchor (diagonal: also controls tilt via y)
      // For diagonal: anchors sit at bottom corners of the visible zone
      const la0Y = shape === 'diagonal' ? botL : cy
      const la1Y = shape === 'diagonal' ? botR : cy
      if (Math.hypot(x - x1, y - la0Y) < threshold) return 0
      if (Math.hypot(x - x2, y - la1Y) < threshold) return 1
      if (shape === 'diagonal') {
        // cp2 = left-center height handle only
        const lcY = (topL + botL) / 2
        if (Math.hypot(x - x1, y - lcY) < threshold) return 2
      } else {
        // cp2 = single height handle (far edge, center x)
        const farY = zh >= 0 ? topL : botL
        if (Math.hypot(x - midX, y - farY) < threshold) return 2
      }
    } else if (drawing.type === 'fib' && drawing.points.length === 2) {
      // Two endpoint handles for fib
      const s1 = toScreenCoords(drawing.points[0])
      const s2 = toScreenCoords(drawing.points[1])
      if (Math.hypot(x - s1.x, y - s1.y) < threshold) return 0
      if (Math.hypot(x - s2.x, y - s2.y) < threshold) return 1
    } else if ((drawing.type === 'elliottWave' || drawing.type === 'elliottWaveABC' || drawing.type === 'path') && drawing.points.length >= 2) {
      // Each vertex is a control point
      for (let i = 0; i < drawing.points.length; i++) {
        const pt = toScreenCoords(drawing.points[i])
        if (Math.hypot(x - pt.x, y - pt.y) < threshold) return i
      }
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
      const cy = screen1.y
      const zh = drawing.zoneHeight ?? 50
      const diagOff = drawing.zoneDiagOffset ?? 0
      const shape = drawing.zoneShape ?? 'flat'
      const topL = zh >= 0 ? cy - zh : cy
      const botL = zh >= 0 ? cy : cy - zh
      const topR = topL + (shape === 'diagonal' ? diagOff : 0)
      const botR = botL + (shape === 'diagonal' ? diagOff : 0)
      if (shape === 'curve') {
        // Sample along bezier and check proximity
        const midX = (screen1.x + screen2.x) / 2
        const ctrlX = midX + (drawing.zoneCurveCtrlX ?? 0)
        const ctrlY = cy - zh
        const sx0 = screen1.x, sy0 = screen1.y
        const sx1 = screen2.x, sy1 = screen2.y
        for (let t = 0; t <= 1; t += 0.04) {
          const bx = (1 - t) * (1 - t) * sx0 + 2 * (1 - t) * t * ctrlX + t * t * sx1
          const by = (1 - t) * (1 - t) * sy0 + 2 * (1 - t) * t * ctrlY + t * t * sy1
          if (Math.hypot(x - bx, y - by) < threshold * 2) return true
        }
        return false
      }
      return x >= x1 && x <= x2 && y >= Math.min(topL, topR) - 4 && y <= Math.max(botL, botR) + 4
    } else if (drawing.type === 'fib' && drawing.points.length === 2) {
      // Hit: near either endpoint OR near any enabled level line
      const [p1raw, p2raw] = drawing.points
      const screen1 = toScreenCoords(p1raw)
      const screen2 = toScreenCoords(p2raw)
      if (Math.hypot(x - screen1.x, y - screen1.y) < threshold * 2) return true
      if (Math.hypot(x - screen2.x, y - screen2.y) < threshold * 2) return true
      const levels: FibLevel[] = drawing.fibLevels ?? DEFAULT_FIB_LEVELS
      const priceRange = p2raw.price - p1raw.price
      for (const level of levels.filter(l => l.enabled)) {
        const levelPrice = p1raw.price + level.value * priceRange
        const screenY = priceToScreen ? priceToScreen(levelPrice) : 0
        if (Math.abs(y - screenY) < threshold) return true
      }
      return false
    } else if ((drawing.type === 'elliottWave' || drawing.type === 'elliottWaveABC') && drawing.points.length >= 2) {
      const pts = drawing.points.map(p => toScreenCoords(p))
      for (let i = 0; i < pts.length - 1; i++) {
        const ax = pts[i].x, ay = pts[i].y
        const bx = pts[i + 1].x, by = pts[i + 1].y
        const abx = bx - ax, aby = by - ay
        const lenSq = abx * abx + aby * aby
        if (lenSq === 0) { if (Math.hypot(x - ax, y - ay) <= threshold) return true; continue }
        const t = Math.max(0, Math.min(1, ((x - ax) * abx + (y - ay) * aby) / lenSq))
        if (Math.hypot(x - ax - t * abx, y - ay - t * aby) <= threshold) return true
      }
      return false
    } else if (drawing.type === 'path' && drawing.points.length >= 2) {
      const pts = drawing.points.map(p => toScreenCoords(p))
      const hitR = Math.max(threshold, (drawing.lineWidth || 2) / 2 + 6)
      for (let i = 0; i < pts.length - 1; i++) {
        const ax = pts[i].x, ay = pts[i].y
        const bx = pts[i + 1].x, by = pts[i + 1].y
        const abx = bx - ax, aby = by - ay
        const lenSq = abx * abx + aby * aby
        if (lenSq === 0) { if (Math.hypot(x - ax, y - ay) <= hitR) return true; continue }
        const t = Math.max(0, Math.min(1, ((x - ax) * abx + (y - ay) * aby) / lenSq))
        if (Math.hypot(x - ax - t * abx, y - ay - t * aby) <= hitR) return true
      }
      return false
    } else if (drawing.type === 'brush' && drawing.points.length > 1) {
      // Check if cursor is near any segment of the brush polyline
      const pts = drawing.points.map(p => toScreenCoords(p))
      const hitRadius = Math.max(threshold, (drawing.lineWidth || 4) / 2 + 6)
      for (let i = 0; i < pts.length - 1; i++) {
        const ax = pts[i].x, ay = pts[i].y
        const bx = pts[i + 1].x, by = pts[i + 1].y
        const abx = bx - ax, aby = by - ay
        const lenSq = abx * abx + aby * aby
        if (lenSq === 0) {
          if (Math.hypot(x - ax, y - ay) <= hitRadius) return true
          continue
        }
        const t = Math.max(0, Math.min(1, ((x - ax) * abx + (y - ay) * aby) / lenSq))
        const nearX = ax + t * abx
        const nearY = ay + t * aby
        if (Math.hypot(x - nearX, y - nearY) <= hitRadius) return true
      }
      return false
    }
    return false
  }

  const handleCanvasMouseDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return

    const rect = canvas.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top

    // Handle brush tool - start recording points
    if (currentTool === 'brush' && screenToPrice && screenToTime) {
      e.stopPropagation()
      e.preventDefault()
      // Capture pointer so pointerUp fires even if cursor leaves the element
      e.currentTarget.setPointerCapture(e.pointerId)
      setIsBrushing(true)
      lastBrushScreenPosRef.current = { x, y }
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
        e.currentTarget.setPointerCapture(e.pointerId)
        setEditingDrawing(drawings[i].id)
        setDraggedDrawing(drawings[i].id)
        setDragOffset({ x, y })
        setDragStartDataPoint({
          time: screenToTime ? screenToTime(x) : 0,
          price: screenToPrice ? screenToPrice(y) : 0,
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
    // Finish brush stroke - always reset brush state regardless of point count
    if (isBrushing) {
      setIsBrushing(false)
      lastBrushScreenPosRef.current = null
      if (currentTool === 'brush' && currentPoints.length > 1) {
        const newDrawing: Drawing = {
          id: Date.now().toString(),
          type: 'brush',
          points: currentPoints,
          color: color,
          lineWidth: brushSize,
        }
        setDrawings([...drawings, newDrawing])
        setCurrentPoints([])
        setEditingDrawing(null)
        setJustCompletedDrawing(true)
        setTimeout(() => setJustCompletedDrawing(false), 100)
        if (!isToolLocked) setCurrentTool('select')
      } else {
        // Click with no movement or too few points — discard, keep tool active
        setCurrentPoints([])
      }
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

    // Complete path drawing on double-click
    if (currentTool === 'path' && currentPoints.length >= 2 && screenToPrice && screenToTime) {
      e.stopPropagation()
      e.preventDefault()
      // Remove the last point added by the click that fired just before dblclick
      const finalPoints = currentPoints.slice(0, -1)
      if (finalPoints.length >= 2) {
        const newDrawing: Drawing = {
          id: Date.now().toString(),
          type: 'path',
          points: finalPoints,
          color,
          lineWidth: 3,
        }
        setDrawings([...drawings, newDrawing])
      }
      setCurrentPoints([])
      setPreviewPoint(null)
      setJustCompletedDrawing(true)
      setTimeout(() => setJustCompletedDrawing(false), 100)
      if (!isToolLocked) setCurrentTool('select')
      return
    }

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
      {/* Toolbar - Only show when active and using internal tool state (or always when left sidebar) */}
      {isActive && (!externalCurrentTool || toolbarPosition === 'left') && (
        <div
          style={{
            position: 'absolute',
            ...(toolbarPosition === 'left'
              ? {
                top: '110px',
                left: '10px',
                flexDirection: 'column' as const,
                maxHeight: 'calc(100% - 130px)',
                overflowY: 'auto' as const,
              }
              : { top: '10px', left: '10px', flexWrap: 'wrap' as const, maxWidth: '95%' }),
            background:
              'linear-gradient(180deg, #080808 0%, #030303 50%, #000000 100%)',
            border: '1px solid rgba(255,255,255,0.12)',
            borderRadius: '8px',
            padding: toolbarPosition === 'left' ? '4px 3px' : '6px 5px',
            display: 'flex',
            gap: toolbarPosition === 'left' ? '2px' : '4px',
            alignItems: 'center',
            boxShadow: '0 8px 32px rgba(0,0,0,0.95), inset 0 1px 0 rgba(255,255,255,0.08), inset 0 -1px 0 rgba(0,0,0,0.8)',
            zIndex: 101,
            pointerEvents: 'auto',
          }}
        >
          <style>{`
            .lw-tool-btn {
              width: clamp(30px, 3.5vh, 46px);
              height: clamp(30px, 3.5vh, 46px);
              padding: 0;
              border-radius: 5px;
              cursor: pointer;
              display: flex;
              flex-direction: column;
              align-items: center;
              justify-content: center;
              gap: 2px;
              transition: all 0.15s ease;
            }
            .lw-tool-btn span {
              font-size: clamp(5px, 0.65vh, 8px) !important;
            }
            .lw-tool-btn svg {
              width: clamp(10px, 1.4vh, 16px) !important;
              height: clamp(10px, 1.4vh, 16px) !important;
            }
          `}</style>
          {/* Tool Buttons */}
          <button
            onClick={() => {
              setCurrentTool('trendline')
              setCurrentPoints([])
            }}
            className="lw-tool-btn"
            style={{
              width: undefined, height: undefined, padding: 0,
              background: currentTool === 'trendline' ? '#FF8500' : '#3d2200',
              color: '#FF8500',
              border: '1px solid #FF8500',
              borderRadius: '5px', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '2px', transition: 'all 0.15s ease',
              boxShadow: currentTool === 'trendline' ? '0 0 12px rgba(255,133,0,0.6)' : 'none',
              ...navyBtnStyle(currentTool === 'trendline', '#FF8500'),
            }}
            title="Trendline"
          >
            <TbLine size={14} color={navyIconColor(currentTool === 'trendline', '#FF8500')} />
            <span style={{ fontSize: '7px', fontWeight: '700', letterSpacing: '0.8px', textTransform: 'uppercase', fontFamily: 'monospace', color: navyIconColor(currentTool === 'trendline', '#FF8500') }}>Trend</span>
          </button>

          <button
            onClick={() => { setCurrentTool('horizontal'); setCurrentPoints([]) }}
            className="lw-tool-btn" style={{
              width: undefined, height: undefined, padding: 0,
              background: currentTool === 'horizontal' ? '#FF8500' : '#3d2200',
              color: '#FF8500',
              border: '1px solid #FF8500',
              borderRadius: '5px', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '2px', transition: 'all 0.15s ease',
              boxShadow: currentTool === 'horizontal' ? '0 0 12px rgba(255,133,0,0.6)' : 'none',
              ...navyBtnStyle(currentTool === 'horizontal', '#FF8500'),
            }}
            title="Horizontal Line"
          >
            <TbMinus size={14} color={navyIconColor(currentTool === 'horizontal', '#FF8500')} />
            <span style={{ fontSize: '7px', fontWeight: '700', letterSpacing: '0.8px', textTransform: 'uppercase', fontFamily: 'monospace', color: navyIconColor(currentTool === 'horizontal', '#FF8500') }}>H-Line</span>
          </button>

          <button
            onClick={() => { setCurrentTool('vertical'); setCurrentPoints([]) }}
            className="lw-tool-btn" style={{
              width: undefined, height: undefined, padding: 0,
              background: currentTool === 'vertical' ? '#B06EFF' : '#1e0d33',
              color: '#B06EFF',
              border: '1px solid #B06EFF',
              borderRadius: '5px', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '2px', transition: 'all 0.15s ease',
              boxShadow: currentTool === 'vertical' ? '0 0 12px rgba(176,110,255,0.6)' : 'none',
              ...navyBtnStyle(currentTool === 'vertical', '#B06EFF'),
            }}
            title="Vertical Line"
          >
            <TbArrowsVertical size={14} color={navyIconColor(currentTool === 'vertical', '#B06EFF')} />
            <span style={{ fontSize: '7px', fontWeight: '700', letterSpacing: '0.8px', textTransform: 'uppercase', fontFamily: 'monospace', color: navyIconColor(currentTool === 'vertical', '#B06EFF') }}>V-Line</span>
          </button>

          <button
            onClick={() => { setCurrentTool('ray'); setCurrentPoints([]) }}
            className="lw-tool-btn" style={{
              width: undefined, height: undefined, padding: 0,
              background: currentTool === 'ray' ? '#FF8500' : '#3d2200',
              color: '#FF8500',
              border: '1px solid #FF8500',
              borderRadius: '5px', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '2px', transition: 'all 0.15s ease',
              boxShadow: currentTool === 'ray' ? '0 0 12px rgba(255,133,0,0.6)' : 'none',
              ...navyBtnStyle(currentTool === 'ray', '#FF8500'),
            }}
            title="Ray"
          >
            <TbArrowUpRight size={14} color={navyIconColor(currentTool === 'ray', '#FF8500')} />
            <span style={{ fontSize: '7px', fontWeight: '700', letterSpacing: '0.8px', textTransform: 'uppercase', fontFamily: 'monospace', color: navyIconColor(currentTool === 'ray', '#FF8500') }}>Ray</span>
          </button>

          <button
            onClick={() => { setCurrentTool('rectangle'); setCurrentPoints([]) }}
            className="lw-tool-btn" style={{
              width: undefined, height: undefined, padding: 0,
              background: currentTool === 'rectangle' ? '#4A9EFF' : '#0d2040',
              color: '#4A9EFF',
              border: '1px solid #4A9EFF',
              borderRadius: '5px', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '2px', transition: 'all 0.15s ease',
              boxShadow: currentTool === 'rectangle' ? '0 0 12px rgba(74,158,255,0.6)' : 'none',
              ...navyBtnStyle(currentTool === 'rectangle', '#4A9EFF'),
            }}
            title="Rectangle"
          >
            <TbSquare size={14} color={navyIconColor(currentTool === 'rectangle', '#4A9EFF')} />
            <span style={{ fontSize: '7px', fontWeight: '700', letterSpacing: '0.8px', textTransform: 'uppercase', fontFamily: 'monospace', color: navyIconColor(currentTool === 'rectangle', '#4A9EFF') }}>Box</span>
          </button>

          <button
            onClick={() => { setCurrentTool('text'); setCurrentPoints([]) }}
            className="lw-tool-btn" style={{
              width: undefined, height: undefined, padding: 0,
              background: currentTool === 'text' ? '#FFD700' : '#332900',
              color: '#FFD700',
              border: '1px solid #FFD700',
              borderRadius: '5px', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '2px', transition: 'all 0.15s ease',
              boxShadow: currentTool === 'text' ? '0 0 12px rgba(255,215,0,0.6)' : 'none',
              ...navyBtnStyle(currentTool === 'text', '#FFD700'),
            }}
            title="Text"
          >
            <TbTextSize size={14} color={navyIconColor(currentTool === 'text', '#FFD700')} />
            <span style={{ fontSize: '7px', fontWeight: '700', letterSpacing: '0.8px', textTransform: 'uppercase', fontFamily: 'monospace', color: navyIconColor(currentTool === 'text', '#FFD700') }}>Text</span>
          </button>

          <button
            onClick={() => { setCurrentTool('parallelChannel'); setCurrentPoints([]) }}
            className="lw-tool-btn" style={{
              width: undefined, height: undefined, padding: 0,
              background: currentTool === 'parallelChannel' ? '#FF8500' : '#3d2200',
              color: '#FF8500',
              border: '1px solid #FF8500',
              borderRadius: '5px', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '2px', transition: 'all 0.15s ease',
              boxShadow: currentTool === 'parallelChannel' ? '0 0 12px rgba(255,133,0,0.6)' : 'none',
              ...navyBtnStyle(currentTool === 'parallelChannel', '#FF8500'),
            }}
            title="Parallel Channel"
          >
            <TbLayout size={14} color={navyIconColor(currentTool === 'parallelChannel', '#FF8500')} />
            <span style={{ fontSize: '7px', fontWeight: '700', letterSpacing: '0.8px', textTransform: 'uppercase', fontFamily: 'monospace', color: navyIconColor(currentTool === 'parallelChannel', '#FF8500') }}>Channel</span>
          </button>

          <button
            onClick={() => { setCurrentTool('buyZone'); setCurrentPoints([]) }}
            className="lw-tool-btn" style={{
              width: undefined, height: undefined, padding: 0,
              background: currentTool === 'buyZone' ? '#00ff88' : '#001a0e',
              color: '#00ff88',
              border: '1px solid #00ff88',
              borderRadius: '5px', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '2px', transition: 'all 0.15s ease',
              boxShadow: currentTool === 'buyZone' ? '0 0 14px rgba(0,255,136,0.7)' : '0 0 4px rgba(0,255,136,0.15)',
              ...navyBtnStyle(currentTool === 'buyZone', '#00ff88'),
            }}
            title="Buy Zone"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <rect x="1" y="5" width="12" height="7" fill={navyButtonTheme ? 'rgba(0,255,136,0.15)' : (currentTool === 'buyZone' ? 'rgba(0,0,0,0.3)' : 'rgba(0,255,136,0.2)')} stroke={navyIconColor(currentTool === 'buyZone', '#00ff88')} strokeWidth="1.2" />
              <polyline points="4,8 7,4 10,8" stroke={navyIconColor(currentTool === 'buyZone', '#00ff88')} strokeWidth="1.5" fill="none" />
            </svg>
            <span style={{ fontSize: '7px', fontWeight: '700', letterSpacing: '0.8px', textTransform: 'uppercase', fontFamily: 'monospace', color: navyIconColor(currentTool === 'buyZone', '#00ff88') }}>Buy</span>
          </button>

          <button
            onClick={() => { setCurrentTool('sellZone'); setCurrentPoints([]) }}
            className="lw-tool-btn" style={{
              width: undefined, height: undefined, padding: 0,
              background: currentTool === 'sellZone' ? '#ff3366' : '#1a0008',
              color: '#ff3366',
              border: '1px solid #ff3366',
              borderRadius: '5px', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '2px', transition: 'all 0.15s ease',
              boxShadow: currentTool === 'sellZone' ? '0 0 14px rgba(255,51,102,0.7)' : '0 0 4px rgba(255,51,102,0.15)',
              ...navyBtnStyle(currentTool === 'sellZone', '#ff3366'),
            }}
            title="Sell Zone"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <rect x="1" y="2" width="12" height="7" fill={navyButtonTheme ? 'rgba(255,51,102,0.15)' : (currentTool === 'sellZone' ? 'rgba(0,0,0,0.3)' : 'rgba(255,51,102,0.2)')} stroke={navyIconColor(currentTool === 'sellZone', '#ff3366')} strokeWidth="1.2" />
              <polyline points="4,6 7,10 10,6" stroke={navyIconColor(currentTool === 'sellZone', '#ff3366')} strokeWidth="1.5" fill="none" />
            </svg>
            <span style={{ fontSize: '7px', fontWeight: '700', letterSpacing: '0.8px', textTransform: 'uppercase', fontFamily: 'monospace', color: navyIconColor(currentTool === 'sellZone', '#ff3366') }}>Sell</span>
          </button>

          {/* Brush Tool */}
          <button
            onClick={() => { setCurrentTool('brush'); setCurrentPoints([]); setColor('#ffffff') }}
            className="lw-tool-btn" style={{
              width: undefined, height: undefined, padding: 0,
              background: currentTool === 'brush' ? '#a855f7' : '#1e0a33',
              color: '#a855f7',
              border: '1px solid #a855f7',
              borderRadius: '5px', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '2px', transition: 'all 0.15s ease',
              boxShadow: currentTool === 'brush' ? '0 0 12px rgba(168,85,247,0.6)' : 'none',
              ...navyBtnStyle(currentTool === 'brush', '#a855f7'),
            }}
            title="Freehand Brush"
          >
            <TbBrush size={14} color={navyIconColor(currentTool === 'brush', '#a855f7')} />
            <span style={{ fontSize: '7px', fontWeight: '700', letterSpacing: '0.8px', textTransform: 'uppercase', fontFamily: 'monospace', color: navyIconColor(currentTool === 'brush', '#a855f7') }}>Brush</span>
          </button>

          {/* Brush size slider - only shown when brush is active */}
          {currentTool === 'brush' && (
            <div style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              gap: '2px', padding: '2px 4px', background: '#1e0a33',
              border: '1px solid #a855f7', borderRadius: '5px', minWidth: '42px',
            }}>
              <span style={{ fontSize: '7px', fontWeight: '700', color: '#a855f7', fontFamily: 'monospace', letterSpacing: '0.5px' }}>SIZE</span>
              <input
                type="range"
                min={1}
                max={24}
                value={brushSize}
                onChange={e => setBrushSize(Number(e.target.value))}
                style={{ width: '36px', accentColor: '#a855f7', cursor: 'pointer' }}
                title={`Brush size: ${brushSize}px`}
              />
              <span style={{ fontSize: '8px', fontWeight: '700', color: '#c084fc', fontFamily: 'monospace' }}>{brushSize}px</span>
            </div>
          )}

          {/* Fibonacci Retracement */}
          <button
            onClick={() => { setCurrentTool('fib'); setCurrentPoints([]) }}
            className="lw-tool-btn" style={{
              width: undefined, height: undefined, padding: 0,
              background: currentTool === 'fib' ? '#facc15' : '#1c1800',
              border: '1px solid #facc15',
              borderRadius: '5px', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '2px', transition: 'all 0.15s ease',
              boxShadow: currentTool === 'fib' ? '0 0 12px rgba(250,204,21,0.6)' : 'none',
              ...navyBtnStyle(currentTool === 'fib', '#facc15'),
            }}
            title="Fibonacci Retracement (2 clicks)"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <line x1="2" y1="2" x2="12" y2="12" stroke={navyIconColor(currentTool === 'fib', '#facc15')} strokeWidth="1.5" strokeDasharray="2 1.5" />
              <line x1="2" y1="5" x2="12" y2="5" stroke={navyIconColor(currentTool === 'fib', '#facc15')} strokeWidth="1" />
              <line x1="2" y1="8" x2="12" y2="8" stroke={navyIconColor(currentTool === 'fib', '#facc15')} strokeWidth="1" />
              <line x1="2" y1="11" x2="12" y2="11" stroke={navyIconColor(currentTool === 'fib', '#facc15')} strokeWidth="1" />
            </svg>
            <span style={{ fontSize: '7px', fontWeight: '700', letterSpacing: '0.8px', textTransform: 'uppercase', fontFamily: 'monospace', color: navyIconColor(currentTool === 'fib', '#facc15') }}>Fib</span>
          </button>

          {/* Elliott Wave Impulse (012345) */}
          <button
            onClick={() => { setCurrentTool('elliottWave'); setCurrentPoints([]) }}
            className="lw-tool-btn" style={{
              width: undefined, height: undefined, padding: 0,
              background: currentTool === 'elliottWave' ? '#38bdf8' : '#001520',
              border: '1px solid #38bdf8',
              borderRadius: '5px', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '2px', transition: 'all 0.15s ease',
              boxShadow: currentTool === 'elliottWave' ? '0 0 12px rgba(56,189,248,0.6)' : 'none',
              ...navyBtnStyle(currentTool === 'elliottWave', '#38bdf8'),
            }}
            title="Elliott Wave Impulse: 6 clicks = 0,1,2,3,4,5"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <polyline points="1,12 3,4 6,10 9,3 12,8" stroke={navyIconColor(currentTool === 'elliottWave', '#38bdf8')} strokeWidth="1.5" fill="none" />
            </svg>
            <span style={{ fontSize: '7px', fontWeight: '700', letterSpacing: '0.8px', textTransform: 'uppercase', fontFamily: 'monospace', color: navyIconColor(currentTool === 'elliottWave', '#38bdf8') }}>12345</span>
          </button>

          {/* Elliott Wave ABC Corrective */}
          <button
            onClick={() => { setCurrentTool('elliottWaveABC'); setCurrentPoints([]) }}
            className="lw-tool-btn" style={{
              width: undefined, height: undefined, padding: 0,
              background: currentTool === 'elliottWaveABC' ? '#818cf8' : '#0d0b20',
              border: '1px solid #818cf8',
              borderRadius: '5px', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '2px', transition: 'all 0.15s ease',
              boxShadow: currentTool === 'elliottWaveABC' ? '0 0 12px rgba(129,140,248,0.6)' : 'none',
              ...navyBtnStyle(currentTool === 'elliottWaveABC', '#818cf8'),
            }}
            title="Elliott Wave ABC Corrective: 4 clicks = 0,A,B,C"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <polyline points="1,12 5,4 9,10 13,5" stroke={navyIconColor(currentTool === 'elliottWaveABC', '#818cf8')} strokeWidth="1.5" fill="none" />
            </svg>
            <span style={{ fontSize: '7px', fontWeight: '700', letterSpacing: '0.8px', textTransform: 'uppercase', fontFamily: 'monospace', color: navyIconColor(currentTool === 'elliottWaveABC', '#818cf8') }}>ABC</span>
          </button>

          {/* Path Tool */}
          <button
            onClick={() => { setCurrentTool('path'); setCurrentPoints([]); setColor('#ffffff') }}
            className="lw-tool-btn" style={{
              width: undefined, height: undefined, padding: 0,
              background: currentTool === 'path' ? '#fb923c' : '#1a0d00',
              border: '1px solid #fb923c',
              borderRadius: '5px', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '2px', transition: 'all 0.15s ease',
              boxShadow: currentTool === 'path' ? '0 0 12px rgba(251,146,60,0.6)' : 'none',
              ...navyBtnStyle(currentTool === 'path', '#fb923c'),
            }}
            title="Path / Polyline (click points, double-click to finish)"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <polyline points="1,12 4,5 8,9 12,2" stroke={navyIconColor(currentTool === 'path', '#fb923c')} strokeWidth="1.5" fill="none" />
              <circle cx="1" cy="12" r="1.5" fill={navyIconColor(currentTool === 'path', '#fb923c')} />
              <circle cx="4" cy="5" r="1.5" fill={navyIconColor(currentTool === 'path', '#fb923c')} />
              <circle cx="8" cy="9" r="1.5" fill={navyIconColor(currentTool === 'path', '#fb923c')} />
              <circle cx="12" cy="2" r="1.5" fill={navyIconColor(currentTool === 'path', '#fb923c')} />
            </svg>
            <span style={{ fontSize: '7px', fontWeight: '700', letterSpacing: '0.8px', textTransform: 'uppercase', fontFamily: 'monospace', color: navyIconColor(currentTool === 'path', '#fb923c') }}>Path</span>
          </button>

          <button
            onClick={() => { if (drawings.length > 0) setDrawings(drawings.slice(0, -1)) }}
            className="lw-tool-btn" style={{
              width: undefined, height: undefined, padding: 0,
              background: drawings.length > 0 ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.05)',
              color: drawings.length > 0 ? '#ffffff' : 'rgba(255,255,255,0.3)',
              border: drawings.length > 0 ? '1px solid rgba(255,255,255,0.4)' : '1px solid rgba(255,255,255,0.1)',
              borderRadius: '5px', cursor: drawings.length > 0 ? 'pointer' : 'default', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '2px', transition: 'all 0.15s ease',
              boxShadow: 'none',
              ...(navyButtonTheme ? {
                background: drawings.length > 0
                  ? 'linear-gradient(160deg, #0d1b2e 0%, #060d1a 60%, #030912 100%)'
                  : 'linear-gradient(160deg, #060d18 0%, #030810 100%)',
                border: drawings.length > 0 ? '1px solid rgba(45,80,150,0.5)' : '1px solid rgba(45,80,150,0.2)',
                boxShadow: '0 2px 8px rgba(0,0,0,0.9), inset 0 1px 0 rgba(80,130,220,0.08)',
                color: drawings.length > 0 ? '#a0b8e0' : 'rgba(100,140,200,0.3)',
              } : {}),
            }}
            title="Undo last drawing"
          >
            <TbArrowBackUp size={14} />
            <span style={{ fontSize: '7px', fontWeight: '700', letterSpacing: '0.8px', textTransform: 'uppercase', fontFamily: 'monospace' }}>Undo</span>
          </button>

          <div
            style={{
              width: toolbarPosition === 'left' ? '100%' : '1px',
              height: toolbarPosition === 'left' ? '1px' : '36px',
              background: 'rgba(255,255,255,0.12)',
              margin: toolbarPosition === 'left' ? '2px 0' : '0 4px',
            }}
          />

          <button
            onClick={clearDrawings}
            className="lw-tool-btn" style={{
              width: undefined, height: undefined, padding: 0,
              background: '#2a0509',
              color: '#DC143C',
              border: '1px solid #DC143C',
              borderRadius: '5px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '3px',
              justifyContent: 'center',
              flexDirection: 'column' as const,
              boxShadow: 'none',
              ...navyBtnStyle(false, '#DC143C'),
            }}
            title="Clear all drawings"
          >
            <TbTrash size={14} />
            <span style={{ fontSize: '7px', fontWeight: '700', letterSpacing: '0.8px', textTransform: 'uppercase', fontFamily: 'monospace' }}>Clear</span>
          </button>
        </div>
      )}

      {/* Invisible Event Capture Layer */}
      <div
        onClick={handleCanvasClick}
        onDoubleClick={handleCanvasDoubleClick}
        onPointerDown={handleCanvasMouseDown}
        onPointerMove={handleCanvasMouseMove}
        onPointerUp={handleCanvasMouseUp}
        onPointerCancel={() => {
          // Cancel brushing if pointer is lost (e.g. stylus lifted, touch cancelled)
          if (isBrushing) {
            setIsBrushing(false)
            setCurrentPoints([])
            lastBrushScreenPosRef.current = null
          }
        }}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          pointerEvents:
            currentTool !== 'select' || isDragging || !!editingDrawing ? 'auto' : 'none',
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
                          setDragStartDataPoint({
                            time: screenToTime ? screenToTime(e.clientX - rect.left) : 0,
                            price: screenToPrice ? screenToPrice(e.clientY - rect.top) : 0,
                          })
                          setOriginalDrawingPoints([...drawing.points])
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
                          setDragStartDataPoint({
                            time: screenToTime ? screenToTime(e.clientX - rect.left) : 0,
                            price: screenToPrice ? screenToPrice(e.clientY - rect.top) : 0,
                          })
                          setOriginalDrawingPoints([...drawing.points])
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
                      x1={0}
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
                          setDragStartDataPoint({
                            time: screenToTime ? screenToTime(e.clientX - rect.left) : 0,
                            price: screenToPrice ? screenToPrice(e.clientY - rect.top) : 0,
                          })
                          setOriginalDrawingPoints([...drawing.points])
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
                          setDragStartDataPoint({
                            time: screenToTime ? screenToTime(e.clientX - rect.left) : 0,
                            price: screenToPrice ? screenToPrice(e.clientY - rect.top) : 0,
                          })
                          setOriginalDrawingPoints([...drawing.points])
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
                          setDragStartDataPoint({
                            time: screenToTime ? screenToTime(e.clientX - rect.left) : 0,
                            price: screenToPrice ? screenToPrice(e.clientY - rect.top) : 0,
                          })
                          setOriginalDrawingPoints([...drawing.points])
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
                  const isBuy = drawing.type === 'buyZone'
                  const screen1 = toScreenCoords(drawing.points[0])
                  const screen2 = toScreenCoords(drawing.points[1])
                  const x1 = Math.min(screen1.x, screen2.x)
                  const x2 = Math.max(screen1.x, screen2.x)
                  const cy = screen1.y
                  const zh = drawing.zoneHeight ?? 50
                  const diagOff = drawing.zoneDiagOffset ?? 0
                  const shape = drawing.zoneShape ?? 'flat'
                  const topL = zh >= 0 ? cy - zh : cy
                  const botL = zh >= 0 ? cy : cy - zh
                  const topR = topL + (shape === 'diagonal' ? diagOff : 0)
                  const botR = botL + (shape === 'diagonal' ? diagOff : 0)
                  const hitTop = Math.min(topL, topR) - 10
                  const hitBot = Math.max(botL, botR) + 10
                  const midX = (screen1.x + screen2.x) / 2
                  const ctrlX = midX + (drawing.zoneCurveCtrlX ?? 0)
                  const ctrlY = cy - zh

                  const hitHandlers = {
                    onClick: (e: React.MouseEvent) => { e.stopPropagation(); enableDrawingEdit(drawing.id) },
                    onMouseDown: (e: React.MouseEvent) => {
                      e.stopPropagation(); e.preventDefault()
                      const svgRect = (e.currentTarget as SVGElement).ownerSVGElement?.getBoundingClientRect()
                      if (svgRect && !justCompletedDrawing) {
                        const mx = e.clientX - svgRect.left
                        const my = e.clientY - svgRect.top
                        setEditingDrawing(drawing.id); setSelectedDrawing(drawing.id)
                        setDraggedDrawing(drawing.id); setDragOffset({ x: mx, y: my })
                        setDragStartDataPoint({ time: screenToTime ? screenToTime(mx) : 0, price: screenToPrice ? screenToPrice(my) : 0 })
                        setOriginalDrawingPoints([...drawing.points]); setIsDragging(true)
                      }
                    },
                    onDoubleClick: (e: React.MouseEvent) => {
                      e.stopPropagation(); e.preventDefault()
                      setIsDragging(false); setDraggedDrawing(null)
                      setEditingPropertiesId(drawing.id); setPropertiesEditorVisible(true)
                    },
                  }

                  if (shape === 'curve') {
                    return (
                      <path
                        key={drawing.id}
                        d={`M${screen1.x},${screen1.y} Q${ctrlX},${ctrlY} ${screen2.x},${screen2.y}`}
                        stroke="transparent"
                        strokeWidth="20"
                        fill="none"
                        style={{ pointerEvents: 'stroke', cursor: 'pointer' }}
                        {...hitHandlers}
                      />
                    )
                  }

                  return (
                    <rect
                      key={drawing.id}
                      x={x1}
                      y={hitTop}
                      width={x2 - x1}
                      height={hitBot - hitTop}
                      fill="transparent"
                      stroke="transparent"
                      strokeWidth="1"
                      style={{ pointerEvents: 'all', cursor: 'pointer' }}
                      {...hitHandlers}
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
                          setEditingDrawing(drawing.id)
                          setSelectedDrawing(drawing.id)
                          setDraggedDrawing(drawing.id)
                          setDragOffset({ x: e.clientX - rect.left, y: e.clientY - rect.top })
                          setDragStartDataPoint({
                            time: screenToTime ? screenToTime(e.clientX - rect.left) : 0,
                            price: screenToPrice ? screenToPrice(e.clientY - rect.top) : 0,
                          })
                          setOriginalDrawingPoints([...drawing.points])
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
                            setDragStartDataPoint({
                              time: screenToTime ? screenToTime(e.clientX - rect.left) : 0,
                              price: screenToPrice ? screenToPrice(e.clientY - rect.top) : 0,
                            })
                            setOriginalDrawingPoints([...drawing.points])
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
                            setDragStartDataPoint({
                              time: screenToTime ? screenToTime(e.clientX - rect.left) : 0,
                              price: screenToPrice ? screenToPrice(e.clientY - rect.top) : 0,
                            })
                            setOriginalDrawingPoints([...drawing.points])
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
                          setDragStartDataPoint({
                            time: screenToTime ? screenToTime(e.clientX - rect.left) : 0,
                            price: screenToPrice ? screenToPrice(e.clientY - rect.top) : 0,
                          })
                          setOriginalDrawingPoints([...drawing.points])
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
                        const svgRect = e.currentTarget.ownerSVGElement?.getBoundingClientRect()
                        if (svgRect && !justCompletedDrawing) {
                          const mx = e.clientX - svgRect.left
                          const my = e.clientY - svgRect.top
                          setEditingDrawing(drawing.id)
                          setSelectedDrawing(drawing.id)
                          setDraggedDrawing(drawing.id)
                          setDragOffset({ x: mx, y: my })
                          setDragStartDataPoint({
                            time: screenToTime ? screenToTime(mx) : 0,
                            price: screenToPrice ? screenToPrice(my) : 0,
                          })
                          setOriginalDrawingPoints([...drawing.points])
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
                } else if (drawing.type === 'fib' && drawing.points.length === 2) {
                  const s1 = toScreenCoords(drawing.points[0])
                  const s2 = toScreenCoords(drawing.points[1])
                  const xLeft = Math.min(s1.x, s2.x)
                  const xRight = Math.max(s1.x, s2.x)
                  const levels: FibLevel[] = drawing.fibLevels ?? DEFAULT_FIB_LEVELS
                  const p1raw = drawing.fibReverse ? drawing.points[1] : drawing.points[0]
                  const p2raw = drawing.fibReverse ? drawing.points[0] : drawing.points[1]
                  const priceRange = p2raw.price - p1raw.price
                  const svgHandlers = {
                    onMouseDown: (e: React.MouseEvent<SVGElement>) => {
                      e.stopPropagation()
                      e.preventDefault()
                      const svgRect = (e.currentTarget as SVGElement).ownerSVGElement?.getBoundingClientRect()
                      if (svgRect && !justCompletedDrawing) {
                        const mx = e.clientX - svgRect.left
                        const my = e.clientY - svgRect.top
                        setEditingDrawing(drawing.id)
                        setSelectedDrawing(drawing.id)
                        setDraggedDrawing(drawing.id)
                        setDragOffset({ x: mx, y: my })
                        setDragStartDataPoint({ time: screenToTime ? screenToTime(mx) : 0, price: screenToPrice ? screenToPrice(my) : 0 })
                        setOriginalDrawingPoints([...drawing.points])
                        setIsDragging(true)
                      }
                    },
                    onDoubleClick: (e: React.MouseEvent<SVGElement>) => {
                      e.stopPropagation()
                      e.preventDefault()
                      setIsDragging(false)
                      setDraggedDrawing(null)
                      setEditingPropertiesId(drawing.id)
                      setPropertiesEditorVisible(true)
                    },
                    onClick: (e: React.MouseEvent<SVGElement>) => { e.stopPropagation(); enableDrawingEdit(drawing.id) },
                  }
                  return (
                    <g key={drawing.id} style={{ cursor: 'pointer' }}>
                      {/* Invisible wide band across full fib x range for easy grab */}
                      <rect x={xLeft} y={Math.min(s1.y, s2.y) - 10} width={xRight - xLeft} height={Math.abs(s2.y - s1.y) + 20}
                        fill="transparent" stroke="none" style={{ pointerEvents: 'all' }} {...svgHandlers} />
                      {/* Transparent hit lines for each level */}
                      {levels.filter(l => l.enabled).map((level, idx) => {
                        const levelPrice = p1raw.price + level.value * priceRange
                        const sy = priceToScreen ? priceToScreen(levelPrice) : 0
                        return <line key={idx} x1={xLeft} y1={sy} x2={xRight} y2={sy} stroke="transparent" strokeWidth="14" style={{ pointerEvents: 'stroke' }} {...svgHandlers} />
                      })}
                    </g>
                  )
                } else if ((drawing.type === 'elliottWave' || drawing.type === 'elliottWaveABC') && drawing.points.length >= 2) {
                  const pts = drawing.points.map(p => toScreenCoords(p))
                  const svgHandlers = {
                    onMouseDown: (e: React.MouseEvent<SVGElement>) => {
                      e.stopPropagation()
                      e.preventDefault()
                      const svgRect = (e.currentTarget as SVGElement).ownerSVGElement?.getBoundingClientRect()
                      if (svgRect && !justCompletedDrawing) {
                        const mx = e.clientX - svgRect.left
                        const my = e.clientY - svgRect.top
                        setEditingDrawing(drawing.id)
                        setSelectedDrawing(drawing.id)
                        setDraggedDrawing(drawing.id)
                        setDragOffset({ x: mx, y: my })
                        setDragStartDataPoint({ time: screenToTime ? screenToTime(mx) : 0, price: screenToPrice ? screenToPrice(my) : 0 })
                        setOriginalDrawingPoints([...drawing.points])
                        setIsDragging(true)
                      }
                    },
                    onDoubleClick: (e: React.MouseEvent<SVGElement>) => {
                      e.stopPropagation()
                      e.preventDefault()
                      setIsDragging(false)
                      setDraggedDrawing(null)
                      setEditingPropertiesId(drawing.id)
                      setPropertiesEditorVisible(true)
                    },
                    onClick: (e: React.MouseEvent<SVGElement>) => { e.stopPropagation(); enableDrawingEdit(drawing.id) },
                  }
                  let pathData = `M ${pts[0].x} ${pts[0].y}`
                  for (let i = 1; i < pts.length; i++) pathData += ` L ${pts[i].x} ${pts[i].y}`
                  return (
                    <path key={drawing.id} d={pathData} stroke="transparent" strokeWidth="20" fill="none"
                      strokeLinecap="round" strokeLinejoin="round" style={{ pointerEvents: 'stroke', cursor: 'pointer' }}
                      {...svgHandlers} />
                  )
                } else if (drawing.type === 'path' && drawing.points.length >= 2) {
                  const pts = drawing.points.map(p => toScreenCoords(p))
                  const svgHandlers = {
                    onMouseDown: (e: React.MouseEvent<SVGElement>) => {
                      e.stopPropagation()
                      e.preventDefault()
                      const svgRect = (e.currentTarget as SVGElement).ownerSVGElement?.getBoundingClientRect()
                      if (svgRect && !justCompletedDrawing) {
                        const mx = e.clientX - svgRect.left
                        const my = e.clientY - svgRect.top
                        setEditingDrawing(drawing.id)
                        setSelectedDrawing(drawing.id)
                        setDraggedDrawing(drawing.id)
                        setDragOffset({ x: mx, y: my })
                        setDragStartDataPoint({ time: screenToTime ? screenToTime(mx) : 0, price: screenToPrice ? screenToPrice(my) : 0 })
                        setOriginalDrawingPoints([...drawing.points])
                        setIsDragging(true)
                      }
                    },
                    onDoubleClick: (e: React.MouseEvent<SVGElement>) => {
                      e.stopPropagation()
                      e.preventDefault()
                      setIsDragging(false)
                      setDraggedDrawing(null)
                      setEditingPropertiesId(drawing.id)
                      setPropertiesEditorVisible(true)
                    },
                    onClick: (e: React.MouseEvent<SVGElement>) => { e.stopPropagation(); enableDrawingEdit(drawing.id) },
                  }
                  let pathData = `M ${pts[0].x} ${pts[0].y}`
                  for (let i = 1; i < pts.length; i++) pathData += ` L ${pts[i].x} ${pts[i].y}`
                  return (
                    <path key={drawing.id} d={pathData} stroke="transparent" strokeWidth="20" fill="none"
                      strokeLinecap="round" strokeLinejoin="round" style={{ pointerEvents: 'stroke', cursor: 'pointer' }}
                      {...svgHandlers} />
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
                          <circle
                            cx={minX}
                            cy={minY}
                            r="8"
                            fill="#3b82f6"
                            stroke="#fff"
                            strokeWidth="2"
                            style={{ pointerEvents: 'all', cursor: 'nwse-resize' }}
                            onMouseDown={(e) => {
                              e.stopPropagation()
                              e.preventDefault()
                              setDraggedControlPoint(0)
                              setIsDragging(true)
                            }}
                          />
                          <circle
                            cx={maxX}
                            cy={minY}
                            r="8"
                            fill="#3b82f6"
                            stroke="#fff"
                            strokeWidth="2"
                            style={{ pointerEvents: 'all', cursor: 'nesw-resize' }}
                            onMouseDown={(e) => {
                              e.stopPropagation()
                              e.preventDefault()
                              setDraggedControlPoint(1)
                              setIsDragging(true)
                            }}
                          />
                          <circle
                            cx={maxX}
                            cy={maxY}
                            r="8"
                            fill="#3b82f6"
                            stroke="#fff"
                            strokeWidth="2"
                            style={{ pointerEvents: 'all', cursor: 'nwse-resize' }}
                            onMouseDown={(e) => {
                              e.stopPropagation()
                              e.preventDefault()
                              setDraggedControlPoint(2)
                              setIsDragging(true)
                            }}
                          />
                          <circle
                            cx={minX}
                            cy={maxY}
                            r="8"
                            fill="#3b82f6"
                            stroke="#fff"
                            strokeWidth="2"
                            style={{ pointerEvents: 'all', cursor: 'nesw-resize' }}
                            onMouseDown={(e) => {
                              e.stopPropagation()
                              e.preventDefault()
                              setDraggedControlPoint(3)
                              setIsDragging(true)
                            }}
                          />
                          {/* Edge handles */}
                          <rect
                            x={midX - 6}
                            y={minY - 6}
                            width="12"
                            height="12"
                            fill="#22c55e"
                            stroke="#fff"
                            strokeWidth="2"
                            style={{ pointerEvents: 'all', cursor: 'ns-resize' }}
                            onMouseDown={(e) => {
                              e.stopPropagation()
                              e.preventDefault()
                              setDraggedControlPoint(4)
                              setIsDragging(true)
                            }}
                          />
                          <rect
                            x={maxX - 6}
                            y={midY - 6}
                            width="12"
                            height="12"
                            fill="#22c55e"
                            stroke="#fff"
                            strokeWidth="2"
                            style={{ pointerEvents: 'all', cursor: 'ew-resize' }}
                            onMouseDown={(e) => {
                              e.stopPropagation()
                              e.preventDefault()
                              setDraggedControlPoint(5)
                              setIsDragging(true)
                            }}
                          />
                          <rect
                            x={midX - 6}
                            y={maxY - 6}
                            width="12"
                            height="12"
                            fill="#22c55e"
                            stroke="#fff"
                            strokeWidth="2"
                            style={{ pointerEvents: 'all', cursor: 'ns-resize' }}
                            onMouseDown={(e) => {
                              e.stopPropagation()
                              e.preventDefault()
                              setDraggedControlPoint(6)
                              setIsDragging(true)
                            }}
                          />
                          <rect
                            x={minX - 6}
                            y={midY - 6}
                            width="12"
                            height="12"
                            fill="#22c55e"
                            stroke="#fff"
                            strokeWidth="2"
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
                    const screenX = Math.max(0, timeToScreen ? timeToScreen(p.time) : 0)
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
                    const p = drawing.points[0]
                    const y = priceToScreen ? priceToScreen(p.price) : 0
                    const startX = Math.max(0, timeToScreen ? timeToScreen(p.time) : 0)
                    return (
                      <circle
                        key={`control-${drawing.id}`}
                        cx={startX}
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
                        cy={16}
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
                    const x1 = Math.min(screen1.x, screen2.x)
                    const x2 = Math.max(screen1.x, screen2.x)
                    const cy = screen1.y
                    const zh = drawing.zoneHeight ?? 50
                    const shape = drawing.zoneShape ?? 'flat'
                    const diagOff = drawing.zoneDiagOffset ?? 0
                    const midX = (x1 + x2) / 2
                    const topL = zh >= 0 ? cy - zh : cy
                    const botL = zh >= 0 ? cy : cy - zh
                    const topR = topL + (shape === 'diagonal' ? diagOff : 0)
                    const botR = botL + (shape === 'diagonal' ? diagOff : 0)
                    const isDiag = shape === 'diagonal'
                    const farY = zh >= 0 ? topL : botL
                    const lcY = (topL + botL) / 2
                    const rcY = (topR + botR) / 2
                    return (
                      <g key={`control-${drawing.id}`}>
                        {shape === 'curve' ? (
                          // Curve: 3 freely draggable blue circles
                          (() => {
                            const cCtrlX = midX + (drawing.zoneCurveCtrlX ?? 0)
                            const cCtrlY = cy - zh
                            return (
                              <>
                                <circle cx={screen1.x} cy={screen1.y} r="8" fill="#3b82f6" stroke="#fff" strokeWidth="2"
                                  style={{ pointerEvents: 'all', cursor: 'move' }}
                                  onMouseDown={(e) => { e.stopPropagation(); e.preventDefault(); setDraggedControlPoint(0); setIsDragging(true) }} />
                                <circle cx={screen2.x} cy={screen2.y} r="8" fill="#3b82f6" stroke="#fff" strokeWidth="2"
                                  style={{ pointerEvents: 'all', cursor: 'move' }}
                                  onMouseDown={(e) => { e.stopPropagation(); e.preventDefault(); setDraggedControlPoint(1); setIsDragging(true) }} />
                                <circle cx={cCtrlX} cy={cCtrlY} r="8" fill="#3b82f6" stroke="#fff" strokeWidth="2"
                                  style={{ pointerEvents: 'all', cursor: 'move' }}
                                  onMouseDown={(e) => { e.stopPropagation(); e.preventDefault(); setDraggedControlPoint(2); setIsDragging(true) }} />
                              </>
                            )
                          })()
                        ) : (
                          <>
                            {/* Blue: time anchors — bottom corners for diagonal so they sit ON the zone */}
                            <circle cx={x1} cy={isDiag ? botL : cy} r="8" fill="#3b82f6" stroke="#fff" strokeWidth="2"
                              style={{ pointerEvents: 'all', cursor: 'ew-resize' }}
                              onMouseDown={(e) => { e.stopPropagation(); e.preventDefault(); setDraggedControlPoint(0); setIsDragging(true) }} />
                            <circle cx={x2} cy={isDiag ? botR : cy} r="8" fill="#3b82f6" stroke="#fff" strokeWidth="2"
                              style={{ pointerEvents: 'all', cursor: 'ew-resize' }}
                              onMouseDown={(e) => { e.stopPropagation(); e.preventDefault(); setDraggedControlPoint(1); setIsDragging(true) }} />
                            {isDiag ? (
                              <>
                                {/* Left side spine */}
                                <line x1={x1} y1={topL} x2={x1} y2={botL} stroke="#facc1555" strokeWidth="1" strokeDasharray="4 3" style={{ pointerEvents: 'none' }} />
                                {/* Yellow: left-center height handle */}
                                <circle cx={x1} cy={lcY} r="8" fill="#facc15" stroke="#fff" strokeWidth="2"
                                  style={{ pointerEvents: 'all', cursor: 'ns-resize' }}
                                  onMouseDown={(e) => { e.stopPropagation(); e.preventDefault(); setDraggedControlPoint(2); setIsDragging(true) }} />
                              </>
                            ) : (
                              <>
                                {/* Yellow: single height handle — can go up or down from anchor */}
                                <line x1={midX} y1={cy} x2={midX} y2={farY} stroke="#facc1555" strokeWidth="1" strokeDasharray="4 3" style={{ pointerEvents: 'none' }} />
                                <circle cx={midX} cy={farY} r="8" fill="#facc15" stroke="#fff" strokeWidth="2"
                                  style={{ pointerEvents: 'all', cursor: 'ns-resize' }}
                                  onMouseDown={(e) => { e.stopPropagation(); e.preventDefault(); setDraggedControlPoint(2); setIsDragging(true) }} />
                              </>
                            )}
                          </>
                        )}
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
              ref={propertiesPanelRef}
              style={{
                position: 'absolute',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                background: 'linear-gradient(145deg, #0a0a0a 0%, #1a1a1a 100%)',
                border: '1px solid rgba(255, 120, 0, 0.3)',
                borderRadius: '0',
                padding: '0',
                minWidth: '279px',
                maxWidth: '320px',
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
                  <SolidColorPicker
                    value={drawing.color}
                    onChange={(c) => updateDrawingProperty('color', c)}
                    recentColors={recentColors}
                    onAddRecent={addRecentColor}
                  />
                </div>

                {/* Line Width (for lines, path and brush) */}
                {(drawing.type === 'trendline' ||
                  drawing.type === 'horizontal' ||
                  drawing.type === 'vertical' ||
                  drawing.type === 'ray' ||
                  drawing.type === 'rectangle' ||
                  drawing.type === 'parallelChannel' ||
                  drawing.type === 'path' ||
                  drawing.type === 'brush') && (
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
                        {drawing.type === 'brush' ? 'Brush Size' : 'Line Width'}:{' '}
                        <span style={{ color: '#ff7800' }}>{drawing.lineWidth || 4}px</span>
                      </label>
                      <input
                        type="range"
                        min="1"
                        max={drawing.type === 'brush' ? 24 : 10}
                        value={drawing.lineWidth || 4}
                        onChange={(e) => updateDrawingProperty('lineWidth', parseInt(e.target.value))}
                        style={{
                          width: '100%',
                          height: '6px',
                          borderRadius: '3px',
                          background: 'linear-gradient(90deg, #1a1a1a, #333)',
                          outline: 'none',
                          appearance: 'none',
                          cursor: 'pointer',
                          accentColor: drawing.type === 'brush' ? '#a855f7' : '#ff7800',
                        }}
                      />
                    </div>
                  )}

                {/* Line Style (for lines, path and brush) */}
                {(drawing.type === 'trendline' ||
                  drawing.type === 'horizontal' ||
                  drawing.type === 'vertical' ||
                  drawing.type === 'ray' ||
                  drawing.type === 'rectangle' ||
                  drawing.type === 'parallelChannel' ||
                  drawing.type === 'path' ||
                  drawing.type === 'brush') && (
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
                          background: '#0a0a0a',
                          color: '#ffffff',
                          border: '1px solid rgba(255, 120, 0, 0.2)',
                          borderRadius: '3px',
                          cursor: 'pointer',
                          fontSize: '17px',
                          fontWeight: '500',
                          boxShadow:
                            'inset 0 2px 4px rgba(0, 0, 0, 0.5), 0 1px 0 rgba(255, 255, 255, 0.05)',
                          outline: 'none',
                          colorScheme: 'dark',
                        }}
                      >
                        <option value="solid" style={{ background: '#0a0a0a', color: '#fff' }}>Solid</option>
                        <option value="dashed" style={{ background: '#0a0a0a', color: '#fff' }}>Dashed</option>
                        <option value="dotted" style={{ background: '#0a0a0a', color: '#fff' }}>Dotted</option>
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
                        <SolidColorPicker
                          value={
                            drawing.backgroundColor.startsWith('#')
                              ? drawing.backgroundColor
                              : '#ff7800'
                          }
                          onChange={(c) => updateDrawingProperty('backgroundColor', c)}
                          recentColors={recentColors}
                          onAddRecent={addRecentColor}
                        />
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

                {/* Zone shape + height */}
                {(drawing.type === 'buyZone' || drawing.type === 'sellZone') && (() => {
                  const isBuy = drawing.type === 'buyZone'
                  const accent = isBuy ? '#00ff88' : '#ff3366'
                  const accentBg = isBuy ? 'rgba(0,255,136,0.12)' : 'rgba(255,51,102,0.12)'
                  return (
                    <>
                      <div>
                        <label style={{ color: '#fff', fontSize: '14px', display: 'block', marginBottom: '8px', fontWeight: '600', letterSpacing: '0.5px', textTransform: 'uppercase' }}>Zone Shape</label>
                        <div style={{ display: 'flex', gap: '6px' }}>
                          {(['flat', 'diagonal', 'curve'] as const).map(s => (
                            <button key={s} onClick={() => updateDrawingProperty('zoneShape', s)}
                              style={{ flex: 1, padding: '8px 4px', background: (drawing.zoneShape ?? 'flat') === s ? accent : accentBg, color: (drawing.zoneShape ?? 'flat') === s ? '#000' : accent, border: `1px solid ${accent}`, borderRadius: '3px', cursor: 'pointer', fontSize: '11px', fontWeight: '700', textTransform: 'capitalize' }}>
                              {s === 'flat' && <svg width="36" height="18" viewBox="0 0 36 18" fill="none" style={{ display: 'block', margin: '0 auto 2px' }}><rect x="2" y="4" width="32" height="10" stroke={(drawing.zoneShape ?? 'flat') === 'flat' ? '#000' : accent} strokeWidth="1.5" fill="none" /></svg>}
                              {s === 'diagonal' && <svg width="36" height="18" viewBox="0 0 36 18" fill="none" style={{ display: 'block', margin: '0 auto 2px' }}><polygon points="2,14 34,8 34,2 2,8" stroke={(drawing.zoneShape ?? 'flat') === 'diagonal' ? '#000' : accent} strokeWidth="1.5" fill="none" /></svg>}
                              {s === 'curve' && <svg width="36" height="18" viewBox="0 0 36 18" fill="none" style={{ display: 'block', margin: '0 auto 2px' }}><path d="M2,14 Q18,2 34,14 Q18,20 2,14" stroke={(drawing.zoneShape ?? 'flat') === 'curve' ? '#000' : accent} strokeWidth="1.5" fill="none" /></svg>}
                              {s.charAt(0).toUpperCase() + s.slice(1)}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div>
                        <label style={{ color: '#fff', fontSize: '14px', display: 'block', marginBottom: '8px', fontWeight: '600', letterSpacing: '0.5px', textTransform: 'uppercase' }}>
                          Zone Height: <span style={{ color: accent }}>{Math.round(drawing.zoneHeight ?? 50)}px</span>
                        </label>
                        <input type="range" min="10" max="300" value={drawing.zoneHeight ?? 50}
                          onChange={e => updateDrawingProperty('zoneHeight', parseInt(e.target.value))}
                          style={{ width: '100%', height: '6px', borderRadius: '3px', background: 'linear-gradient(90deg, #1a1a1a, #333)', outline: 'none', appearance: 'none', cursor: 'pointer', accentColor: accent }} />
                      </div>
                    </>
                  )
                })()}

                {/* Path: End Style */}
                {drawing.type === 'path' && (
                  <div>
                    <label style={{ color: '#fff', fontSize: '14px', display: 'block', marginBottom: '8px', fontWeight: '600', letterSpacing: '0.5px', textTransform: 'uppercase' }}>End Style</label>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      {(['none', 'circle', 'arrow'] as const).map(style => (
                        <button
                          key={style}
                          onClick={() => updateDrawingProperty('pathEndStyle', style)}
                          style={{
                            flex: 1, padding: '8px 4px',
                            background: (drawing.pathEndStyle ?? 'none') === style ? '#fb923c' : 'rgba(251,146,60,0.1)',
                            color: (drawing.pathEndStyle ?? 'none') === style ? '#000' : '#fb923c',
                            border: '1px solid #fb923c',
                            borderRadius: '3px', cursor: 'pointer', fontSize: '12px', fontWeight: '700',
                            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px',
                          }}
                        >
                          {style === 'none' && (
                            <svg width="22" height="14" viewBox="0 0 22 14" fill="none">
                              <line x1="2" y1="7" x2="20" y2="7" stroke={(drawing.pathEndStyle ?? 'none') === 'none' ? '#000' : '#fb923c'} strokeWidth="2" />
                            </svg>
                          )}
                          {style === 'circle' && (
                            <svg width="22" height="14" viewBox="0 0 22 14" fill="none">
                              <line x1="2" y1="7" x2="18" y2="7" stroke={(drawing.pathEndStyle ?? 'none') === 'circle' ? '#000' : '#fb923c'} strokeWidth="2" />
                              <circle cx="19" cy="7" r="3" fill={(drawing.pathEndStyle ?? 'none') === 'circle' ? '#000' : '#fb923c'} />
                            </svg>
                          )}
                          {style === 'arrow' && (
                            <svg width="22" height="14" viewBox="0 0 22 14" fill="none">
                              <line x1="2" y1="7" x2="16" y2="7" stroke={(drawing.pathEndStyle ?? 'none') === 'arrow' ? '#000' : '#fb923c'} strokeWidth="2" />
                              <polygon points="16,3 22,7 16,11" fill={(drawing.pathEndStyle ?? 'none') === 'arrow' ? '#000' : '#fb923c'} />
                            </svg>
                          )}
                          {style.charAt(0).toUpperCase() + style.slice(1)}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Elliott Wave type toggle */}
                {drawing.type === 'elliottWave' && (
                  <div>
                    <label style={{ color: '#fff', fontSize: '14px', display: 'block', marginBottom: '8px', fontWeight: '600', letterSpacing: '0.5px', textTransform: 'uppercase' }}>Wave Type</label>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      {(['impulse', 'corrective'] as const).map(t => (
                        <button
                          key={t}
                          onClick={() => updateDrawingProperty('elliottType', t)}
                          style={{
                            flex: 1, padding: '8px', background: drawing.elliottType === t ? '#38bdf8' : 'rgba(56,189,248,0.1)',
                            color: drawing.elliottType === t ? '#000' : '#38bdf8', border: '1px solid #38bdf8',
                            borderRadius: '3px', cursor: 'pointer', fontSize: '13px', fontWeight: '600',
                          }}
                        >
                          {t === 'impulse' ? '1-2-3-4-5' : 'A-B-C'}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Fib properties */}
                {drawing.type === 'fib' && (
                  <>
                    <div>
                      <label style={{ color: '#fff', fontSize: '14px', display: 'block', marginBottom: '8px', fontWeight: '600', letterSpacing: '0.5px', textTransform: 'uppercase' }}>Trend Line Style</label>
                      <select
                        value={drawing.fibTrendLineStyle || 'dashed'}
                        onChange={e => updateDrawingProperty('fibTrendLineStyle', e.target.value)}
                        style={{ width: '100%', padding: '8px', background: '#0a0a0a', color: '#fff', border: '1px solid rgba(250,204,21,0.3)', borderRadius: '3px', cursor: 'pointer', fontSize: '14px', colorScheme: 'dark' as const }}
                      >
                        <option value="solid" style={{ background: '#0a0a0a', color: '#fff' }}>Solid</option>
                        <option value="dashed" style={{ background: '#0a0a0a', color: '#fff' }}>Dashed</option>
                        <option value="dotted" style={{ background: '#0a0a0a', color: '#fff' }}>Dotted</option>
                      </select>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      {[
                        { key: 'fibUseOneColor', label: 'Use One Color' },
                        { key: 'fibBackground', label: 'Background Fill' },
                        { key: 'fibShowPrices', label: 'Show Prices' },
                        { key: 'fibReverse', label: 'Reverse Direction' },
                      ].map(({ key, label }) => (
                        <label key={key} style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', color: '#fff', fontSize: '14px' }}>
                          <input
                            type="checkbox"
                            checked={!!((drawing as any)[key])}
                            onChange={e => updateDrawingProperty(key, e.target.checked)}
                            style={{ cursor: 'pointer', width: '15px', height: '15px', accentColor: '#facc15' }}
                          />
                          {label}
                        </label>
                      ))}
                    </div>
                    <div>
                      <label style={{ color: '#fff', fontSize: '14px', display: 'block', marginBottom: '10px', fontWeight: '600', letterSpacing: '0.5px', textTransform: 'uppercase' }}>Fib Levels</label>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', maxHeight: '300px', overflowY: 'auto' }}>
                        {(drawing.fibLevels ?? DEFAULT_FIB_LEVELS).map((level, idx) => (
                          <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '4px 6px', background: 'rgba(255,255,255,0.04)', borderRadius: '3px' }}>
                            <input
                              type="checkbox"
                              checked={level.enabled}
                              onChange={e => {
                                const newLevels = (drawing.fibLevels ?? DEFAULT_FIB_LEVELS).map((l, i) => i === idx ? { ...l, enabled: e.target.checked } : l)
                                updateDrawingProperty('fibLevels', newLevels)
                              }}
                              style={{ cursor: 'pointer', accentColor: '#facc15', flexShrink: 0 }}
                            />
                            <span style={{ color: level.enabled ? '#fff' : '#666', fontSize: '13px', flex: 1, fontFamily: 'monospace' }}>{level.value}</span>
                            <input
                              type="color"
                              value={level.color}
                              onChange={e => {
                                const newLevels = (drawing.fibLevels ?? DEFAULT_FIB_LEVELS).map((l, i) => i === idx ? { ...l, color: e.target.value } : l)
                                updateDrawingProperty('fibLevels', newLevels)
                              }}
                              style={{ width: '22px', height: '22px', padding: 0, border: 'none', borderRadius: '3px', cursor: 'pointer', background: 'none' }}
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  </>
                )}

                {/* Delete Button */}
                {/* Opacity (for brush and other drawings) */}
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
                    <span style={{ color: drawing.type === 'brush' ? '#a855f7' : '#ff7800' }}>
                      {Math.round((drawing.opacity ?? 1) * 100)}%
                    </span>
                  </label>
                  <input
                    type="range"
                    min="5"
                    max="100"
                    value={Math.round((drawing.opacity ?? 1) * 100)}
                    onChange={(e) => updateDrawingProperty('opacity', parseInt(e.target.value) / 100)}
                    style={{
                      width: '100%',
                      height: '6px',
                      borderRadius: '3px',
                      background: 'linear-gradient(90deg, #1a1a1a, #333)',
                      outline: 'none',
                      appearance: 'none',
                      cursor: 'pointer',
                      accentColor: drawing.type === 'brush' ? '#a855f7' : '#ff7800',
                    }}
                  />
                </div>

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

