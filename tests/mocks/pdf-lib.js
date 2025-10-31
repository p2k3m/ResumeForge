class MockDictionary {
  constructor() {
    this.store = new Map();
  }

  has(key) {
    const normalized = key instanceof PDFName ? key.value : key;
    return this.store.has(normalized);
  }

  get(key) {
    const normalized = key instanceof PDFName ? key.value : key;
    return this.store.get(normalized);
  }

  set(key, value) {
    const normalized = key instanceof PDFName ? key.value : key;
    this.store.set(normalized, value);
    return this;
  }

  delete(key) {
    const normalized = key instanceof PDFName ? key.value : key;
    this.store.delete(normalized);
  }
}

class MockNode {
  constructor() {
    this.store = new Map();
  }

  lookup(key) {
    const normalized = key instanceof PDFName ? key.value : key;
    return this.store.get(normalized);
  }

  set(key, value) {
    const normalized = key instanceof PDFName ? key.value : key;
    this.store.set(normalized, value);
  }
}

class MockFont {
  constructor(name) {
    this.name = name;
  }

  widthOfTextAtSize(text = '', size = 12) {
    const normalized = typeof text === 'string' ? text : String(text ?? '');
    return Math.max(1, normalized.length) * size * 0.5;
  }
}

class MockPage {
  constructor(width = 612, height = 792) {
    this.width = width;
    this.height = height;
    this.node = new MockNode();
  }

  getWidth() {
    return this.width;
  }

  getHeight() {
    return this.height;
  }

  drawText() {
    // no-op for tests
  }

  drawRectangle() {
    // no-op for tests
  }

  drawLine() {
    // no-op for tests
  }

  drawImage() {
    // no-op for tests
  }
}

export class PDFName {
  constructor(value) {
    this.value = value;
  }

  static of(value) {
    return new PDFName(value);
  }

  toString() {
    return String(this.value);
  }
}

export class PDFString {
  constructor(value) {
    this.value = value;
  }

  static of(value) {
    return new PDFString(value);
  }

  toString() {
    return String(this.value);
  }
}

export class PDFArray extends Array {}

export class PDFDocument {
  constructor() {
    this.context = {
      trailer: new MockDictionary(),
      obj(value) {
        return value;
      },
      register(value) {
        return value;
      },
    };
    this.catalog = { dict: new MockDictionary() };
    this.pages = [];
  }

  static async load() {
    return new PDFDocument();
  }

  static async create() {
    return new PDFDocument();
  }

  addPage(size = [612, 792]) {
    const [width, height] = Array.isArray(size) ? size : [612, 792];
    const page = new MockPage(width, height);
    this.pages.push(page);
    return page;
  }

  embedFont(name) {
    return new MockFont(name);
  }

  setTitle() {}

  setAuthor() {}

  setSubject() {}

  setKeywords() {}

  setProducer() {}

  setCreator() {}

  async embedPng() {
    return {
      width: 256,
      height: 256,
      scale: (factor = 1) => ({
        width: 256 * factor,
        height: 256 * factor,
      }),
    };
  }

  async save() {
    return Buffer.from('%PDF-STUB');
  }
}

export const StandardFonts = {
  Helvetica: 'Helvetica',
  HelveticaBold: 'Helvetica-Bold',
  HelveticaOblique: 'Helvetica-Oblique',
};

export function rgb(r = 0, g = 0, b = 0) {
  return {
    type: 'rgb',
    r: Number(r) || 0,
    g: Number(g) || 0,
    b: Number(b) || 0,
  };
}

export default { PDFDocument, PDFName, PDFString, PDFArray, StandardFonts, rgb };
