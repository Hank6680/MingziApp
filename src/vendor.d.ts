declare module 'jspdf' {
  export default class jsPDF {
    constructor(orientation?: string, unit?: string, format?: string)
    setFontSize(size: number): void
    text(text: string, x: number, y: number): void
    addImage(data: string, format: string, x: number, y: number, w: number, h: number): void
    save(filename: string): void
    getImageProperties(data: string): { width: number; height: number }
    internal: { pageSize: { getWidth(): number; getHeight(): number } }
  }
}

declare module 'html2canvas' {
  export default function html2canvas(element: HTMLElement, options?: Record<string, unknown>): Promise<HTMLCanvasElement>
}
