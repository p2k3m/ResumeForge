export default {
  create() {
    return {
      helpers: {},
      registerHelper(name, fn) {
        this.helpers[name] = fn
      },
      compile(template) {
        return () => template
      }
    }
  }
}
