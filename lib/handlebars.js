export default {
  compile(template) {
    return (data) => {
      let result = template;

      // Handle sections loop
      result = result.replace(
        /{{#each\s+sections}}([\s\S]*){{\/each}}/g,
        (_, sectionBlock) => {
          return (data.sections || []).map((sec) => {
            let block = sectionBlock;

            // Conditional heading
            block = block.replace(
              /{{#if\s+heading}}([\s\S]*?){{\/if}}/g,
              (__, headingBlock) =>
                sec.heading
                  ? headingBlock.replace(/{{\s*heading\s*}}/g, sec.heading)
                  : ''
            );

            // Conditionally keep items block
            block = block.replace(
              /{{#if\s+items}}([\s\S]*?){{\/if}}/g,
              (__, itemsBlock) => (sec.items && sec.items.length ? itemsBlock : '')
            );

            // Iterate over items
            block = block.replace(
              /{{#each\s+items}}([\s\S]*?){{\/each}}/g,
              (__, itemBlock) =>
                (sec.items || [])
                  .map((it) => itemBlock.replace(/{{{?\s*this\s*}?}}/g, it))
                  .join('')
            );

            return block;
          }).join('');
        }
      );

      // Replace remaining simple variables like {{name}} or {{email}}
      result = result.replace(
        /{{\s*([a-zA-Z0-9_]+)\s*}}/g,
        (_, key) => (data[key] != null ? data[key] : '')
      );

      return result;
    };
  }
};
