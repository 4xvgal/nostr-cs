// Canvas API로 이미지를 재렌더링해 EXIF(GPS, 카메라 정보 등) 메타데이터를 제거한다.
// GIF(애니메이션 손실)와 SVG(벡터→래스터 변환)는 건너뛴다.
// 처리 실패 시 원본을 그대로 반환해 업로드가 중단되지 않도록 한다.

const SKIP_TYPES = new Set(['image/gif', 'image/svg+xml'])
const CANVAS_SUPPORTED = new Set(['image/jpeg', 'image/png', 'image/webp'])

export async function stripImageMetadata(
  data: Uint8Array,
  mime: string,
): Promise<{ data: Uint8Array; mime: string }> {
  if (!mime.startsWith('image/') || SKIP_TYPES.has(mime)) return { data, mime }

  const url = URL.createObjectURL(new Blob([data], { type: mime }))
  try {
    const img = await loadImage(url)
    const canvas = document.createElement('canvas')
    canvas.width = img.naturalWidth
    canvas.height = img.naturalHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) return { data, mime }
    ctx.drawImage(img, 0, 0)

    // HEIC/AVIF 등 canvas가 출력 불가한 포맷은 JPEG로 대체
    const outMime = CANVAS_SUPPORTED.has(mime) ? mime : 'image/jpeg'
    const stripped = await canvasToBlob(canvas, outMime)
    return { data: new Uint8Array(await stripped.arrayBuffer()), mime: stripped.type }
  } catch {
    return { data, mime }
  } finally {
    URL.revokeObjectURL(url)
  }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Image load failed'))
    img.src = src
  })
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('canvas.toBlob returned null'))),
      type,
      0.95,
    ),
  )
}
