export default {
  toString() {
    return 'MOCK_QR_CODE'
  },
  async toDataURL() {
    const transparentPixelBase64 =
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIW2P8z8BQDwAFgwJ/lwKc8wAAAABJRU5ErkJggg=='
    return `data:image/png;base64,${transparentPixelBase64}`
  }
}
