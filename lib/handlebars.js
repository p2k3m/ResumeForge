export default {
  compile(template) {
    return (data) => {
      let result = template;
      // Replace simple variables like {{name}}
      result = result.replace(/{{\s*name\s*}}/g, data.name || '');
      // Handle sections loop
      result = result.replace(/{{#each\s+sections}}([\s\S]*?){{\/each}}/, (_, sectionBlock) => {
        return (data.sections || []).map((sec) => {
          let block = sectionBlock;
          // Conditional heading
          block = block.replace(/{{#if\s+heading}}([\s\S]*?){{\/if}}/, (__, headingBlock) =>
            sec.heading ? headingBlock.replace(/{{\s*heading\s*}}/g, sec.heading) : ''
          );
          // Conditional items with nested each
          block = block.replace(/{{#if\s+items}}([\s\S]*?){{\/if}}/, (__, itemsBlock) => {
            if (sec.items && sec.items.length) {
              return itemsBlock.replace(/{{#each\s+items}}([\s\S]*?){{\/each}}/, (___, itemBlock) =>
                sec.items
                  .map((it) => itemBlock.replace(/{{{?\s*this\s*}?}}/g, it))
                  .join('')
              );
            }
            return '';
          });
          return block;
        }).join('');
      });
      return result;
    };
  }
};
