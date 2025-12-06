import { jest } from '@jest/globals';

const createModuleNotFoundError = (moduleName) => {
  const error = new Error(`Cannot find module '${moduleName}'`);
  error.code = 'MODULE_NOT_FOUND';
  return error;
};

class StubPdfKitDocument {
  constructor() {
    this.listeners = new Map();
    this.chunks = [];
  }

  on(event, handler) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event).push(handler);
    return this;
  }

  emit(event, ...args) {
    const handlers = this.listeners.get(event) || [];
    handlers.forEach((handler) => handler(...args));
  }

  font() {
    return this;
  }

  fontSize() {
    return this;
  }

  text(value = '') {
    this.chunks.push(String(value));
    return this;
  }

  moveDown() {
    this.chunks.push('');
    return this;
  }

  end() {
    const content = this.chunks.join('\n');
    const buffer = Buffer.from(`%PDF-STUB\n${content || 'stub pdfkit content'}`);
    this.emit('data', buffer);
    this.emit('end');
  }
}

class StubPdfLibFont {
  constructor(name) {
    this.name = name;
  }

  widthOfTextAtSize(text = '', size = 12) {
    const normalized = typeof text === 'string' ? text : String(text ?? '');
    return Math.max(1, normalized.length * size * 0.5);
  }
}

class StubPdfLibDocument {
  constructor() {
    this.entries = [];
    this.pageSize = [612, 792];
  }

  addPage(size = this.pageSize) {
    const [width, height] = Array.isArray(size) ? size : this.pageSize;
    const page = {
      getWidth: () => width,
      getHeight: () => height,
      drawText: (text = '', options = {}) => {
        this.entries.push({ text: String(text), options });
      },
    };
    return page;
  }

  embedFont(name) {
    return new StubPdfLibFont(name);
  }

  async save() {
    const body = this.entries.map((entry) => entry.text).join('\n');
    return Buffer.from(`%PDF-STUB\n${body || 'stub pdf-lib content'}`);
  }
}

class StubPdfLibModule {
  static async create() {
    return new StubPdfLibDocument();
  }
}

const STANDARD_FONTS = {
  Helvetica: 'Helvetica',
  HelveticaBold: 'Helvetica-Bold',
  HelveticaOblique: 'Helvetica-Oblique',
};

const createServerModule = async ({ pdfLibLoader, pdfKitLoader } = {}) => {
  const logEvent = jest.fn().mockResolvedValue(undefined);
  const logErrorTrace = jest.fn().mockResolvedValue(undefined);
  let module;
  await jest.isolateModulesAsync(async () => {
    jest.unstable_mockModule('../logger.js', () => ({
      logEvent,
      logErrorTrace,
    }));
    jest.unstable_mockModule('pdfkit', () => {
      throw createModuleNotFoundError('pdfkit');
    });
    module = await import('../server.js');
  });
  module.setChromiumLauncher(() => null);
  if (pdfLibLoader || pdfKitLoader) {
    module.setPlainPdfFallbackEngines({
      ...(pdfLibLoader ? { pdfLibLoader } : {}),
      ...(pdfKitLoader ? { pdfKitLoader } : {}),
    });
  }
  return { module, logEvent, logErrorTrace };
};

describe.skip('plain PDF fallback generation', () => {
  afterEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  test('uses pdf-lib fallback for resume and cover letter documents', async () => {
    const pdfLibLoader = async () => ({
      PDFDocument: StubPdfLibModule,
      StandardFonts: STANDARD_FONTS,
    });
    const pdfKitLoader = async () => {
      throw new Error('pdfkit fallback should not be invoked');
    };
    const { module } = await createServerModule({ pdfLibLoader, pdfKitLoader });
    const { generatePdf } = module;

    const resumeBuffer = await generatePdf('Jane Doe\nExperience details', 'modern');
    expect(resumeBuffer).toBeInstanceOf(Buffer);
    expect(resumeBuffer.toString()).toContain('Jane Doe');

    const coverBuffer = await generatePdf('Jane Doe\nCover letter body', 'cover_modern');
    expect(coverBuffer).toBeInstanceOf(Buffer);
    const coverContent = coverBuffer.toString();
    expect(coverContent).toContain('Jane Doe');
    expect(coverContent).toContain('Cover Letter');
  });

  test('uses pdfkit fallback when pdf-lib is unavailable for both document types', async () => {
    const pdfLibLoader = async () => {
      throw createModuleNotFoundError('pdf-lib');
    };
    const pdfKitLoader = async () => ({ default: StubPdfKitDocument });
    const { module } = await createServerModule({ pdfLibLoader, pdfKitLoader });
    const { generatePdf } = module;

    const resumeBuffer = await generatePdf('Alex Smith\nExperience summary', 'modern');
    expect(resumeBuffer).toBeInstanceOf(Buffer);
    expect(resumeBuffer.toString()).toContain('Alex Smith');

    const coverBuffer = await generatePdf('Alex Smith\nCover content example', 'cover_modern');
    expect(coverBuffer).toBeInstanceOf(Buffer);
    const coverContent = coverBuffer.toString();
    expect(coverContent).toContain('Alex Smith');
    expect(coverContent).toContain('Cover Letter');
  });
});
