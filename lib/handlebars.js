import Handlebars from 'handlebars';

const runtime = Handlebars.create();

runtime.registerHelper('eq', (a, b) => a === b);

export default {
  compile(template) {
    return runtime.compile(template, { noEscape: true });
  }
};
