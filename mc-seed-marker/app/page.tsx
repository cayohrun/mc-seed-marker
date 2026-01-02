'use client'

import { useState, useEffect, useRef, useCallback } from 'react'

interface Marker {
  id: string
  name: string
  x: number
  z: number
  color: string
}

interface MarkersData {
  [seed: string]: Marker[]
}

const COLORS = [
  { name: '紅色', value: '#ef4444' },
  { name: '綠色', value: '#22c55e' },
  { name: '藍色', value: '#3b82f6' },
  { name: '黃色', value: '#eab308' },
  { name: '紫色', value: '#a855f7' },
  { name: '橙色', value: '#f97316' },
  { name: '青色', value: '#06b6d4' },
  { name: '粉色', value: '#ec4899' },
]

export default function Home() {
  const [seed, setSeed] = useState('')
  const [activeSeed, setActiveSeed] = useState('')
  const [markers, setMarkers] = useState<Marker[]>([])
  const [newMarker, setNewMarker] = useState({ name: '', x: '', z: '', color: '#22c55e' })
  const [mouseCoords, setMouseCoords] = useState({ x: 0, z: 0 })
  const [viewOffset, setViewOffset] = useState({ x: 0, z: 0 })
  const [zoom, setZoom] = useState(1)
  const [isDragging, setIsDragging] = useState(false)
  const [dragStart, setDragStart] = useState({ x: 0, z: 0 })
  
  const canvasRef = useRef<HTMLCanvasElement>(null)

  // Load markers from localStorage
  useEffect(() => {
    if (activeSeed) {
      const stored = localStorage.getItem('mc-markers')
      if (stored) {
        const data: MarkersData = JSON.parse(stored)
        setMarkers(data[activeSeed] || [])
      } else {
        setMarkers([])
      }
    }
  }, [activeSeed])

  // Save markers to localStorage
  const saveMarkers = useCallback((newMarkers: Marker[]) => {
    if (!activeSeed) return
    const stored = localStorage.getItem('mc-markers')
    const data: MarkersData = stored ? JSON.parse(stored) : {}
    data[activeSeed] = newMarkers
    localStorage.setItem('mc-markers', JSON.stringify(data))
  }, [activeSeed])

  // Draw canvas
  const drawCanvas = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const rect = canvas.getBoundingClientRect()
    canvas.width = rect.width
    canvas.height = rect.height

    const centerX = canvas.width / 2
    const centerZ = canvas.height / 2
    
    // Clear
    ctx.fillStyle = '#0f0f23'
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    // Grid
    const gridSize = 100 * zoom
    ctx.strokeStyle = '#1a1a3e'
    ctx.lineWidth = 1

    const offsetX = (viewOffset.x * zoom) % gridSize
    const offsetZ = (viewOffset.z * zoom) % gridSize

    for (let x = offsetX; x < canvas.width; x += gridSize) {
      ctx.beginPath()
      ctx.moveTo(x, 0)
      ctx.lineTo(x, canvas.height)
      ctx.stroke()
    }
    for (let z = offsetZ; z < canvas.height; z += gridSize) {
      ctx.beginPath()
      ctx.moveTo(0, z)
      ctx.lineTo(canvas.width, z)
      ctx.stroke()
    }

    // Axes
    const axisX = centerX + viewOffset.x * zoom
    const axisZ = centerZ + viewOffset.z * zoom
    
    ctx.strokeStyle = '#333'
    ctx.lineWidth = 2
    
    // X axis (horizontal)
    if (axisZ >= 0 && axisZ <= canvas.height) {
      ctx.beginPath()
      ctx.moveTo(0, axisZ)
      ctx.lineTo(canvas.width, axisZ)
      ctx.stroke()
    }
    
    // Z axis (vertical)
    if (axisX >= 0 && axisX <= canvas.width) {
      ctx.beginPath()
      ctx.moveTo(axisX, 0)
      ctx.lineTo(axisX, canvas.height)
      ctx.stroke()
    }

    // Origin label
    if (axisX >= 0 && axisX <= canvas.width && axisZ >= 0 && axisZ <= canvas.height) {
      ctx.fillStyle = '#666'
      ctx.font = '12px monospace'
      ctx.fillText('0, 0', axisX + 5, axisZ - 5)
    }

    // Draw markers
    markers.forEach(marker => {
      const screenX = centerX + (marker.x + viewOffset.x) * zoom
      const screenZ = centerZ + (marker.z + viewOffset.z) * zoom

      if (screenX < -20 || screenX > canvas.width + 20 || screenZ < -20 || screenZ > canvas.height + 20) {
        return
      }

      // Marker dot
      ctx.beginPath()
      ctx.arc(screenX, screenZ, 8, 0, Math.PI * 2)
      ctx.fillStyle = marker.color
      ctx.fill()
      ctx.strokeStyle = '#fff'
      ctx.lineWidth = 2
      ctx.stroke()

      // Label
      ctx.fillStyle = '#fff'
      ctx.font = 'bold 12px sans-serif'
      ctx.fillText(marker.name, screenX + 12, screenZ - 8)
      
      ctx.fillStyle = '#888'
      ctx.font = '10px monospace'
      ctx.fillText(`${marker.x}, ${marker.z}`, screenX + 12, screenZ + 6)
    })

  }, [markers, viewOffset, zoom])

  useEffect(() => {
    drawCanvas()
  }, [drawCanvas])

  useEffect(() => {
    const handleResize = () => drawCanvas()
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [drawCanvas])

  const screenToWorld = (screenX: number, screenZ: number) => {
    const canvas = canvasRef.current
    if (!canvas) return { x: 0, z: 0 }
    
    const rect = canvas.getBoundingClientRect()
    const centerX = rect.width / 2
    const centerZ = rect.height / 2
    
    const worldX = Math.round((screenX - centerX) / zoom - viewOffset.x)
    const worldZ = Math.round((screenZ - centerZ) / zoom - viewOffset.z)
    
    return { x: worldX, z: worldZ }
  }

  const handleCanvasMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return
    
    const rect = canvas.getBoundingClientRect()
    const x = e.clientX - rect.left
    const z = e.clientY - rect.top
    
    const worldCoords = screenToWorld(x, z)
    setMouseCoords(worldCoords)

    if (isDragging) {
      const dx = (e.clientX - dragStart.x) / zoom
      const dz = (e.clientY - dragStart.z) / zoom
      setViewOffset(prev => ({
        x: prev.x + dx,
        z: prev.z + dz
      }))
      setDragStart({ x: e.clientX, z: e.clientY })
    }
  }

  const handleCanvasMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (e.button === 0) { // Left click
      setIsDragging(true)
      setDragStart({ x: e.clientX, z: e.clientY })
    }
  }

  const handleCanvasMouseUp = () => {
    setIsDragging(false)
  }

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    // Only add marker if we didn't drag
    if (isDragging) return
    
    const canvas = canvasRef.current
    if (!canvas) return
    
    const rect = canvas.getBoundingClientRect()
    const x = e.clientX - rect.left
    const z = e.clientY - rect.top
    
    const worldCoords = screenToWorld(x, z)
    setNewMarker(prev => ({ ...prev, x: worldCoords.x.toString(), z: worldCoords.z.toString() }))
  }

  const handleCanvasDoubleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return
    
    const rect = canvas.getBoundingClientRect()
    const x = e.clientX - rect.left
    const z = e.clientY - rect.top
    
    const worldCoords = screenToWorld(x, z)
    
    const name = prompt('輸入標記名稱:', '新標記')
    if (name) {
      const marker: Marker = {
        id: Date.now().toString(),
        name,
        x: worldCoords.x,
        z: worldCoords.z,
        color: newMarker.color
      }
      const updated = [...markers, marker]
      setMarkers(updated)
      saveMarkers(updated)
    }
  }

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault()
    const delta = e.deltaY > 0 ? 0.9 : 1.1
    setZoom(prev => Math.min(Math.max(prev * delta, 0.1), 10))
  }

  const handleLoadSeed = () => {
    if (seed.trim()) {
      setActiveSeed(seed.trim())
      setViewOffset({ x: 0, z: 0 })
      setZoom(1)
    }
  }

  const handleAddMarker = (e: React.FormEvent) => {
    e.preventDefault()
    if (!newMarker.name || !newMarker.x || !newMarker.z) return

    const marker: Marker = {
      id: Date.now().toString(),
      name: newMarker.name,
      x: parseInt(newMarker.x),
      z: parseInt(newMarker.z),
      color: newMarker.color
    }

    const updated = [...markers, marker]
    setMarkers(updated)
    saveMarkers(updated)
    setNewMarker({ name: '', x: '', z: '', color: newMarker.color })
  }

  const handleDeleteMarker = (id: string) => {
    const updated = markers.filter(m => m.id !== id)
    setMarkers(updated)
    saveMarkers(updated)
  }

  const handleGoToMarker = (marker: Marker) => {
    setViewOffset({ x: -marker.x, z: -marker.z })
  }

  const chunkbaseUrl = activeSeed 
    ? `https://www.chunkbase.com/apps/seed-map#seed=${activeSeed}&platform=java&dimension=overworld`
    : ''

  return (
    <div className="container">
      <header>
        <h1>🗺️ MC Seed Marker</h1>
        <div className="seed-input-group">
          <input
            type="text"
            placeholder="輸入 Seed..."
            value={seed}
            onChange={e => setSeed(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleLoadSeed()}
          />
          <button className="btn btn-primary" onClick={handleLoadSeed}>
            載入
          </button>
        </div>
      </header>

      <div className="main-content">
        <div className="map-container">
          <div className="map-header">
            <span>
              {activeSeed ? `Seed: ${activeSeed}` : '請輸入 Seed 開始'}
            </span>
            <div className="zoom-controls">
              <button onClick={() => setZoom(prev => Math.min(prev * 1.2, 10))}>+</button>
              <button onClick={() => setZoom(prev => Math.max(prev / 1.2, 0.1))}>−</button>
              <button onClick={() => { setZoom(1); setViewOffset({ x: 0, z: 0 }) }}>⌂</button>
            </div>
          </div>
          
          <div className="map-canvas-wrapper">
            <canvas
              ref={canvasRef}
              className="map-canvas"
              onMouseMove={handleCanvasMouseMove}
              onMouseDown={handleCanvasMouseDown}
              onMouseUp={handleCanvasMouseUp}
              onMouseLeave={handleCanvasMouseUp}
              onClick={handleCanvasClick}
              onDoubleClick={handleCanvasDoubleClick}
              onWheel={handleWheel}
            />
            <div className="coords-display">
              X: {mouseCoords.x} &nbsp; Z: {mouseCoords.z} &nbsp; | &nbsp; Zoom: {zoom.toFixed(1)}x
            </div>
          </div>

          {activeSeed && (
            <a href={chunkbaseUrl} target="_blank" rel="noopener noreferrer" className="chunkbase-link">
              🔗 在 ChunkBase 查看此 Seed 的結構位置
            </a>
          )}
        </div>

        <div className="sidebar">
          <h2>新增標記</h2>
          <form className="add-marker-form" onSubmit={handleAddMarker}>
            <input
              type="text"
              placeholder="標記名稱"
              value={newMarker.name}
              onChange={e => setNewMarker(prev => ({ ...prev, name: e.target.value }))}
            />
            <div className="coord-inputs">
              <input
                type="number"
                placeholder="X 座標"
                value={newMarker.x}
                onChange={e => setNewMarker(prev => ({ ...prev, x: e.target.value }))}
              />
              <input
                type="number"
                placeholder="Z 座標"
                value={newMarker.z}
                onChange={e => setNewMarker(prev => ({ ...prev, z: e.target.value }))}
              />
            </div>
            <select
              value={newMarker.color}
              onChange={e => setNewMarker(prev => ({ ...prev, color: e.target.value }))}
            >
              {COLORS.map(c => (
                <option key={c.value} value={c.value}>{c.name}</option>
              ))}
            </select>
            <button type="submit" className="btn btn-primary" disabled={!activeSeed}>
              新增標記
            </button>
          </form>

          <h2>標記列表 ({markers.length})</h2>
          <div className="marker-list">
            {markers.length === 0 ? (
              <div className="empty-state">
                <p>尚無標記</p>
                <p style={{ fontSize: '0.8rem', marginTop: '5px' }}>
                  雙擊地圖快速新增<br/>或填寫上方表單
                </p>
              </div>
            ) : (
              markers.map(marker => (
                <div key={marker.id} className="marker-item">
                  <div className="marker-info" onClick={() => handleGoToMarker(marker)} style={{ cursor: 'pointer' }}>
                    <div className="marker-color" style={{ backgroundColor: marker.color }} />
                    <div>
                      <div className="marker-name">{marker.name}</div>
                      <div className="marker-coords">{marker.x}, {marker.z}</div>
                    </div>
                  </div>
                  <button className="btn btn-danger" onClick={() => handleDeleteMarker(marker.id)}>
                    ✕
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
