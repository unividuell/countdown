<script setup lang="ts">
// One Three.js view of blocks on a gridded floor: the build field (`build`: with its cage) or the
// template.
//
// Renders on input only, no animation loop. Gestures:
//   one finger moves > TAP_SLOP_PX → turn (orbit the camera; up stays up, below is in reach)
//   one finger lifts before that   → tap: the block and the free cell under it
//   two fingers / mouse wheel      → zoom
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import {
  BoxGeometry,
  BufferGeometry,
  Color,
  DoubleSide,
  EdgesGeometry,
  Float32BufferAttribute,
  Group,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  Raycaster,
  Scene,
  Vector2,
  Vector3,
  WebGLRenderer,
  type Intersection,
  type Material,
  type Object3D,
} from 'three'
import { blockMaterials } from './textures'
import { TAP_SLOP_PX } from './view'
import type { Camera, Hit } from './view'
import type { Box, Cell } from './field'
import type { Mark } from './reveal'
import type { GuessBlock } from './types'

const props = withDefaults(
  defineProps<{
    blocks: readonly GuessBlock[]
    /** The floor's extent, and the cage's when building; the camera frames it unless [frame] is set. */
    field: Box
    /** What the camera frames instead of [field] — the reveal keeps it while the floor moves. */
    frame?: Box | undefined
    /** Build field: draws the cage. */
    build?: boolean
    marks?: readonly Mark[]
    background: string
  }>(),
  { build: false, frame: undefined, marks: () => [] },
)
const camera = defineModel<Camera>('camera', { required: true })
const emit = defineEmits<{ tap: [Hit] }>()

const TURN = 0.009

const host = ref<HTMLDivElement | null>(null)
const canvas = ref<HTMLCanvasElement | null>(null)
/** No WebGL on this device: a sentence stands in for the canvas. */
const unsupported = ref(false)

const scene = new Scene()
const eye = new PerspectiveCamera(40, 1, 0.1, 500)
/** Shifted so the field's centre sits at 0. */
const content = new Group()
const blockLayer = new Group()
const markLayer = new Group()
content.add(blockLayer, markLayer)
scene.add(content)

const cube = new BoxGeometry(1, 1, 1)
const markCube = new BoxGeometry(1.08, 1.08, 1.08)
const markEdges = new EdgesGeometry(markCube)
const MARK_COLORS = { missing: '#facc15', extra: '#ef4444', wrongType: '#f97316' }

let floor: Mesh | null = null
let fieldParts: (Mesh | LineSegments)[] = []
let renderer: WebGLRenderer | null = null
/** Local copy: moves within one task must add up before the parent's v-model comes back. */
let view: Camera = { ...camera.value }
const raycaster = new Raycaster()

function render(): void {
  if (!renderer) return
  const r = view.zoom * fit()
  eye.position.set(
    r * Math.cos(view.pitch) * Math.sin(view.yaw),
    r * Math.sin(view.pitch),
    r * Math.cos(view.pitch) * Math.cos(view.yaw),
  )
  eye.lookAt(0, 0, 0)
  eye.updateMatrixWorld()
  renderer.render(scene, eye)
}

/** The framed box in world units. */
function framedBox(): { lo: Vector3; hi: Vector3 } {
  const { lo, hi } = props.frame ?? props.field
  return { lo: new Vector3(...lo), hi: new Vector3(hi[0] + 1, hi[1] + 1, hi[2] + 1) }
}

/** The camera's distance at zoom 1. */
function fit(): number {
  const { lo, hi } = framedBox()
  const size = hi.sub(lo)
  return Math.max(size.x, size.y, size.z) * (props.build ? 2.9 : 2.4)
}

function centre(): Vector3 {
  const { lo, hi } = framedBox()
  return lo.add(hi).multiplyScalar(0.5)
}

function clear(group: Group): void {
  for (const child of [...group.children]) {
    group.remove(child)
    if (child instanceof LineSegments) (child.material as LineBasicMaterial).dispose()
    if (child instanceof Mesh && child.userData.ownMaterial)
      (child.material as MeshBasicMaterial).dispose()
  }
}

function rebuildBlocks(): void {
  clear(blockLayer)
  for (const b of props.blocks) {
    const mesh = new Mesh(cube, blockMaterials(b.type))
    mesh.position.set(b.x + 0.5, b.y + 0.5, b.z + 0.5)
    mesh.userData.cell = [b.x, b.y, b.z] satisfies Cell
    blockLayer.add(mesh)
  }
  render()
}

function rebuildMarks(): void {
  clear(markLayer)
  for (const m of props.marks) {
    const color = MARK_COLORS[m.kind]
    const opacity = m.kind === 'missing' ? 0.35 : 0.55
    const box = new Mesh(
      markCube,
      new MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false }),
    )
    box.userData.ownMaterial = true
    const edges = new LineSegments(markEdges, new LineBasicMaterial({ color }))
    for (const o of [box, edges]) {
      o.position.set(m.x + 0.5, m.y + 0.5, m.z + 0.5)
      markLayer.add(o)
    }
  }
  render()
}

function dropField(): void {
  for (const part of fieldParts) {
    content.remove(part)
    part.geometry.dispose()
    ;(part.material as Material).dispose()
  }
  fieldParts = []
  floor = null
}

function rebuildField(): void {
  dropField()

  // A translucent floor you can tap from above or below, its grid, and the cage of the volume.
  const { lo, hi } = props.field
  const w = hi[0] - lo[0] + 1
  const h = hi[1] - lo[1] + 1
  const d = hi[2] - lo[2] + 1
  content.position.copy(centre()).negate()

  floor = new Mesh(
    new PlaneGeometry(w, d),
    new MeshBasicMaterial({
      color: '#5f8f3e',
      transparent: true,
      opacity: 0.55,
      side: DoubleSide,
      depthWrite: false,
    }),
  )
  floor.rotation.x = -Math.PI / 2
  floor.position.set(lo[0] + w / 2, lo[1], lo[2] + d / 2)

  const lines: number[] = []
  const y = lo[1] + 0.002
  for (let i = 0; i <= w; i++) lines.push(lo[0] + i, y, lo[2], lo[0] + i, y, lo[2] + d)
  for (let i = 0; i <= d; i++) lines.push(lo[0], y, lo[2] + i, lo[0] + w, y, lo[2] + i)
  const grid = new LineSegments(
    new BufferGeometry().setAttribute('position', new Float32BufferAttribute(lines, 3)),
    new LineBasicMaterial({ color: '#2f4f1f' }),
  )

  fieldParts = [floor, grid]
  if (props.build) {
    const cage = new LineSegments(
      new EdgesGeometry(new BoxGeometry(w, h, d)),
      new LineBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.4 }),
    )
    cage.position.set(lo[0] + w / 2, lo[1] + h / 2, lo[2] + d / 2)
    fieldParts.push(cage)
  }
  content.add(...fieldParts)
}

/** Everything from the props: on mount, and once a lost GL context is back. */
function redraw(): void {
  rebuildField()
  rebuildBlocks()
  rebuildMarks()
}

/** The first surface along a screen ray, at normalised device coordinates. */
function cast(ndc: Vector2): Intersection | undefined {
  // A block added since the last frame has no world matrix yet.
  scene.updateMatrixWorld()
  raycaster.setFromCamera(ndc, eye)
  const targets: Object3D[] = [...blockLayer.children]
  if (floor) targets.push(floor)
  const hits = raycaster.intersectObjects(targets, false)
  // From below, a block's bottom face and the floor are coplanar: the block wins.
  return hits.find((h) => h.object !== floor && h.distance - hits[0]!.distance < 1e-4) ?? hits[0]
}

function pick(clientX: number, clientY: number): Hit {
  const rect = canvas.value!.getBoundingClientRect()
  return hitOf(
    cast(
      new Vector2(
        ((clientX - rect.left) / rect.width) * 2 - 1,
        -((clientY - rect.top) / rect.height) * 2 + 1,
      ),
    ),
  )
}

function hitOf(hit: Intersection | undefined): Hit {
  if (!hit) return { block: null, place: null }

  if (hit.object === floor) {
    const p = content.worldToLocal(hit.point.clone())
    return { block: null, place: [Math.floor(p.x), props.field.lo[1], Math.floor(p.z)] }
  }
  const cell = hit.object.userData.cell as Cell
  const nrm = hit.face!.normal
  return {
    block: cell,
    place: [cell[0] + Math.round(nrm.x), cell[1] + Math.round(nrm.y), cell[2] + Math.round(nrm.z)],
  }
}

function turn(dx: number, dy: number): void {
  const limit = Math.PI / 2 - 0.01
  view = {
    ...view,
    yaw: view.yaw - dx * TURN,
    pitch: Math.max(-limit, Math.min(limit, view.pitch + dy * TURN)),
  }
  camera.value = { ...view }
  render()
}

function zoomBy(factor: number): void {
  view = { ...view, zoom: Math.max(0.25, Math.min(4, view.zoom * factor)) }
  camera.value = { ...view }
  render()
}

// --- Gestures ---------------------------------------------------------------

const pointers = new Map<number, { x: number; y: number }>()
let gesture: {
  id: number
  start: { x: number; y: number }
  last: { x: number; y: number }
  moved: boolean
} | null = null
let pinch: { span: number; zoom: number } | null = null

const span = (): number => {
  const [a, b] = [...pointers.values()]
  return Math.hypot(a!.x - b!.x, a!.y - b!.y)
}

function onDown(e: PointerEvent): void {
  // A right or middle click means nothing here.
  if (e.button !== 0) return
  try {
    canvas.value!.setPointerCapture(e.pointerId)
  } catch {
    // Untracked pointer: dragging degrades at the edges, nothing else.
  }
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })

  if (pointers.size === 1) {
    const start = { x: e.clientX, y: e.clientY }
    gesture = { id: e.pointerId, start, last: start, moved: false }
  } else if (pointers.size === 2) {
    gesture = null
    pinch = { span: span(), zoom: view.zoom }
  }
}

function onMove(e: PointerEvent): void {
  if (!pointers.has(e.pointerId)) return
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })

  if (pinch && pointers.size === 2) {
    view = { ...view, zoom: pinch.zoom }
    zoomBy(pinch.span / Math.max(1, span()))
    return
  }
  const g = gesture
  if (!g || g.id !== e.pointerId) return
  if (!g.moved && Math.hypot(e.clientX - g.start.x, e.clientY - g.start.y) > TAP_SLOP_PX)
    g.moved = true
  if (g.moved) turn(e.clientX - g.last.x, e.clientY - g.last.y)
  g.last = { x: e.clientX, y: e.clientY }
}

function onUp(e: PointerEvent): void {
  pointers.delete(e.pointerId)
  if (pointers.size < 2) pinch = null
  const g = gesture
  if (!g || g.id !== e.pointerId) return
  if (!g.moved) emit('tap', pick(e.clientX, e.clientY))
  gesture = null
}

function onCancel(e: PointerEvent): void {
  pointers.delete(e.pointerId)
  pinch = null
  gesture = null
}

function onWheel(e: WheelEvent): void {
  zoomBy(Math.exp(e.deltaY * 0.001))
}

// --- Lifecycle --------------------------------------------------------------

let resize: ResizeObserver | null = null

/** Asks the browser to give a lost context back. */
function keepContext(e: Event): void {
  e.preventDefault()
}

onMounted(() => {
  try {
    renderer = new WebGLRenderer({ canvas: canvas.value!, antialias: true })
  } catch {
    // Three.js has logged why.
    unsupported.value = true
    return
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  scene.background = new Color(props.background)
  // After Three.js's own listeners: on restore it rebuilds its GL state before we draw.
  canvas.value!.addEventListener('webglcontextlost', keepContext)
  canvas.value!.addEventListener('webglcontextrestored', redraw)
  redraw()

  resize = new ResizeObserver(() => {
    const { clientWidth: w, clientHeight: h } = host.value!
    if (!w || !h) return
    renderer!.setSize(w, h, false)
    eye.aspect = w / h
    eye.updateProjectionMatrix()
    render()
  })
  resize.observe(host.value!)
})

onBeforeUnmount(() => {
  resize?.disconnect()
  canvas.value?.removeEventListener('webglcontextlost', keepContext)
  canvas.value?.removeEventListener('webglcontextrestored', redraw)

  // Before the renderer goes: their dispose events are what free its GPU buffers.
  clear(blockLayer)
  clear(markLayer)
  dropField()
  for (const geometry of [cube, markCube, markEdges]) geometry.dispose()

  renderer?.dispose()
  // Contexts are a per-page budget, and the shared materials keep this one reachable: release it.
  renderer?.forceContextLoss()
  renderer = null
})

watch(
  () => JSON.stringify([props.field, props.frame]),
  () => {
    rebuildField()
    render()
  },
)
watch(() => props.blocks, rebuildBlocks)
watch(() => props.marks, rebuildMarks)
watch(camera, (v) => {
  view = { ...v }
  render()
})
</script>

<template>
  <div ref="host" class="h-full w-full">
    <p v-if="unsupported" class="grid h-full place-items-center p-4 text-center text-sm">
      Dein Gerät kann die 3D-Ansicht nicht zeigen.
    </p>
    <canvas
      v-else
      ref="canvas"
      class="block h-full w-full touch-none select-none [-webkit-touch-callout:none]"
      @pointerdown="onDown"
      @pointermove="onMove"
      @pointerup="onUp"
      @pointercancel="onCancel"
      @wheel.prevent="onWheel"
      @contextmenu.prevent
    />
  </div>
</template>
