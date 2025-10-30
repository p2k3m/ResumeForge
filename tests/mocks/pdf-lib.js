export class PDFDocument {
  static async load() {
    return new PDFDocument();
  }

  constructor() {
    this.context = {};
  }
}

export default { PDFDocument };
