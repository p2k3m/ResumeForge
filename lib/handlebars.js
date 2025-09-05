export default {
  compile(template) {
    // simplify templates by removing unsupported bullet helpers
    template = template.replace(
      /{{#if\s+this\.bullets}}([\s\S]*?){{else}}([\s\S]*?){{\/if}}/g,
      '$2'
    );
    template = template.replace(/{{#if\s+this\.bullets}}([\s\S]*?){{\/if}}/g, '');
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
              /{{#each\s+items}}([\s\S]*){{\/each}}/g,
              (__, itemBlock) =>
                (sec.items || [])
                  .map((it) => {
                    let inner = itemBlock;
                    inner = inner.replace(
                      /{{#if\s+this\.bullets}}([\s\S]*?)(?:{{else}}([\s\S]*?))?{{\/if}}/g,
                      (___, bulletsBlock, elseBlock = '') => {
                        if (it && typeof it === 'object' && Array.isArray(it.bullets)) {
                          let bBlock = bulletsBlock.replace(/{{{\s*this\.title\s*}}}/g, it.title || '');
                          bBlock = bBlock.replace(
                            /{{#each\s+this\.bullets}}([\s\S]*?){{\/each}}/g,
                            (____, bulletTpl) =>
                              (it.bullets || [])
                                .map((b) => bulletTpl.replace(/{{{?\s*this\s*}?}}/g, b))
                                .join('')
                          );
                          return bBlock;
                        }
                        return elseBlock.replace(/{{{?\s*this\s*}?}}/g, typeof it === 'string' ? it : '');
                      }
                    );
                    return inner
                      .replace(/{{{?\s*this\s*}?}}/g, it && typeof it === 'string' ? it : '')
                      .trim();
                  })
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
