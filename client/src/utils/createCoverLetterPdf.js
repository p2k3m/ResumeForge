import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'

const DEFAULT_MARGIN = 72 // 1 inch
const FONT_SIZE = 12
const LINE_HEIGHT = FONT_SIZE * 1.4

const defaultOptions = {
  text: '',
  title: 'Cover Letter'
}

export async function createCoverLetterPdf(options = defaultOptions) {
  const { text = defaultOptions.text, title = defaultOptions.title } = options
  const normalizedText = typeof text === 'string' ? text.replace(/\r\n/g, '\n') : ''

  const pdfDoc = await PDFDocument.create()
  if (title) {
    pdfDoc.setTitle(title)
    pdfDoc.setSubject('Tailored cover letter draft')
  }

  const font = await pdfDoc.embedFont(StandardFonts.Helvetica)
  let page = pdfDoc.addPage()
  let { width, height } = page.getSize()
  const maxWidth = width - DEFAULT_MARGIN * 2
  let cursorY = height - DEFAULT_MARGIN

  const ensurePageSpace = (lineCount = 1) => {
    if (cursorY - LINE_HEIGHT * (lineCount - 0) < DEFAULT_MARGIN) {
      page = pdfDoc.addPage()
      ;({ width, height } = page.getSize())
      cursorY = height - DEFAULT_MARGIN
    }
  }

  const drawLine = (line) => {
    ensurePageSpace()
    page.drawText(line, {
      x: DEFAULT_MARGIN,
      y: cursorY,
      size: FONT_SIZE,
      font,
      color: rgb(0, 0, 0)
    })
    cursorY -= LINE_HEIGHT
  }

  const wrapParagraph = (paragraph) => {
    const cleanParagraph = paragraph.trim()
    if (!cleanParagraph) {
      return ['']
    }
    const words = cleanParagraph.split(/\s+/).filter(Boolean)
    const lines = []
    let currentLine = ''

    words.forEach((word) => {
      const testLine = currentLine ? `${currentLine} ${word}` : word
      const testWidth = font.widthOfTextAtSize(testLine, FONT_SIZE)
      if (testWidth > maxWidth && currentLine) {
        lines.push(currentLine)
        currentLine = word
      } else if (testWidth > maxWidth) {
        lines.push(word)
        currentLine = ''
      } else {
        currentLine = testLine
      }
    })

    if (currentLine) {
      lines.push(currentLine)
    }

    return lines.length > 0 ? lines : ['']
  }

  const paragraphs = normalizedText
    .split(/\n{2,}/)
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0)

  if (paragraphs.length === 0) {
    wrapParagraph(' ').forEach(drawLine)
  } else {
    paragraphs.forEach((paragraph, index) => {
      const lines = wrapParagraph(paragraph)
      lines.forEach(drawLine)
      if (index < paragraphs.length - 1) {
        ensurePageSpace()
        cursorY -= LINE_HEIGHT
      }
    })
  }

  const pdfBytes = await pdfDoc.save()
  return new Blob([pdfBytes], { type: 'application/pdf' })
}

export default createCoverLetterPdf
