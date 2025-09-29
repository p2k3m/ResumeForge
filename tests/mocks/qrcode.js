export default {
  toString() {
    return 'MOCK_QR_CODE'
  },
  async toDataURL() {
    return 'data:image/png;base64,MOCK'
  }
}
