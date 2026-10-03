"use strict";

/**
 * Temporary runtime-only backport for GHSA-vfj7-8cjw-p6xm (CVE-2026-93687).
 * Source: https://github.com/micromatch/braces/pull/72
 * Pinned PR head: 28d440b5dd449dbf1fe6f3506cf94ecca4d02660
 * PR base: e53730e6f935498326c72d768889ac194eedc0e0
 * Applied to published braces 3.0.3, excluding unrelated unreleased changes.
 * Upstream is MIT licensed; see licenses/braces-MIT.txt. This is a local
 * backport of an unmerged proposal, not an official patched release.
 */

/** Apply exact upstream hunks; reject source drift instead of guessing offsets. */
function replaceExactly(source, replacements) {
  let result = source;
  for (const [before, after] of replacements) {
    if (result.indexOf(before) === -1 || result.indexOf(before) !== result.lastIndexOf(before)) {
      throw new Error("The braces backport no longer matches its pinned source.");
    }
    result = result.replace(before, () => after);
  }
  return result;
}

module.exports = {
  name: "braces",
  version: "3.0.3",
  advisory: "GHSA-vfj7-8cjw-p6xm",
  files: [
    {
      path: "lib/compile.js",
      originalHash: "dc98f22eee3d511785d92a00758d5f0d48efed5f5813bdecc2de430c529b5c9f",
      patchedHash: "b651f7715e6db8942ce61d3394357b4d81c8ece88240aa31a458ea1165edd195",
      /** Backport the pinned upstream depth and cycle guards. */
      patch(source) {
        return replaceExactly(source, [
          [
`
const fill = require('fill-range');
const utils = require('./utils');

const compile = (ast, options = {}) => {
  const walk = (node, parent = {}) => {
    const invalidBlock = utils.isInvalidBrace(parent);
    const invalidNode = node.invalid === true && options.escapeInvalid === true;
    const invalid = invalidBlock === true || invalidNode === true;
`,
`
const fill = require('fill-range');
const utils = require('./utils');
const { MAX_DEPTH } = require('./constants');

const compile = (ast, options = {}) => {
  const maxDepth = Number.isFinite(options.maxDepth) ? Math.min(MAX_DEPTH, options.maxDepth) : MAX_DEPTH;

  const walk = (node, parent = {}, depth = 0) => {
    if (node.nodes && depth > maxDepth) {
      throw new RangeError(\`AST depth (\${depth}), exceeds max depth (\${maxDepth})\`);
    }
    const invalidBlock = utils.isInvalidBrace(parent);
    const invalidNode = node.invalid === true && options.escapeInvalid === true;
    const invalid = invalidBlock === true || invalidNode === true;
`
          ],
          [
`
    if (node.nodes) {
      for (const child of node.nodes) {
        output += walk(child, node);
      }
    }

    return output;
  };

  return walk(ast);
};

module.exports = compile;
`,
`
    if (node.nodes) {
      for (const child of node.nodes) {
        output += walk(child, node, child.nodes ? depth + 1 : depth);
      }
    }

    return output;
  };

  return walk(ast, {}, ast.type === 'root' ? 0 : 1);
};

module.exports = compile;
`
          ],
        ]);
      },
    },
    {
      path: "lib/constants.js",
      originalHash: "c18ac5adb57308f1ce42a28552da3a31f5d83709743ebd9a636336813a744d4b",
      patchedHash: "f9fb688959232eee3e6ad7906a5b0e3234815db49ee857ef86983d65b917dc7c",
      /** Backport the pinned upstream depth and cycle guards. */
      patch(source) {
        return replaceExactly(source, [
          [
`'use strict';

module.exports = {
  MAX_LENGTH: 10000,

  // Digits
`,
`'use strict';

module.exports = {
  MAX_DEPTH: 100,
  MAX_LENGTH: 10000,

  // Digits
`
          ],
        ]);
      },
    },
    {
      path: "lib/expand.js",
      originalHash: "41ccc196ebfa7b7781a634e721eb744e4e7bcb54cba427a7e3d6806a1b9e58f7",
      patchedHash: "7ea3e14c2b2b256ef244fd3d83b8fcaa20aa2232b4e6d768c3bb6ab567f66cf5",
      /** Backport the pinned upstream depth and cycle guards. */
      patch(source) {
        return replaceExactly(source, [
          [
`const fill = require('fill-range');
const stringify = require('./stringify');
const utils = require('./utils');

const append = (queue = '', stash = '', enclose = false) => {
  const result = [];
`,
`const fill = require('fill-range');
const stringify = require('./stringify');
const utils = require('./utils');
const { MAX_DEPTH } = require('./constants');

const append = (queue = '', stash = '', enclose = false) => {
  const result = [];
`
          ],
          [
`  return utils.flatten(result);
};

const expand = (ast, options = {}) => {
  const rangeLimit = options.rangeLimit === undefined ? 1000 : options.rangeLimit;

  const walk = (node, parent = {}) => {
    node.queue = [];

    let p = parent;
    let q = parent.queue;

    while (p.type !== 'brace' && p.type !== 'root' && p.parent) {
      p = p.parent;
      q = p.queue;
    }

    if (node.invalid || node.dollar) {
      q.push(append(q.pop(), stringify(node, options)));
`,
`  return utils.flatten(result);
};

const queueOwner = node => {
  if (node.type === 'brace' || node.type === 'root' || !node.parent) return node;

  const seen = new Set();
  while (node.type !== 'brace' && node.type !== 'root' && node.parent) {
    if (seen.has(node)) {
      throw new RangeError('AST parent chain contains a cycle');
    }
    seen.add(node);
    node = node.parent;
  }
  return node;
};

const expand = (ast, options = {}) => {
  const rangeLimit = options.rangeLimit === undefined ? 1000 : options.rangeLimit;
  const maxDepth = Number.isFinite(options.maxDepth) ? Math.min(MAX_DEPTH, options.maxDepth) : MAX_DEPTH;

  const walk = (node, parent = {}, depth = 0) => {
    if (node.nodes && depth > maxDepth) {
      throw new RangeError(\`AST depth (\${depth}), exceeds max depth (\${maxDepth})\`);
    }
    node.queue = [];

    const q = queueOwner(parent).queue;

    if (node.invalid || node.dollar) {
      q.push(append(q.pop(), stringify(node, options)));
`
          ],
          [
`    }

    const enclose = utils.encloseBrace(node);
    let queue = node.queue;
    let block = node;

    while (block.type !== 'brace' && block.type !== 'root' && block.parent) {
      block = block.parent;
      queue = block.queue;
    }

    for (let i = 0; i < node.nodes.length; i++) {
      const child = node.nodes[i];
`,
`    }

    const enclose = utils.encloseBrace(node);
    const queue = queueOwner(node).queue;

    for (let i = 0; i < node.nodes.length; i++) {
      const child = node.nodes[i];
`
          ],
          [
`      }

      if (child.nodes) {
        walk(child, node);
      }
    }

    return queue;
  };

  return utils.flatten(walk(ast));
};

module.exports = expand;
`,
`      }

      if (child.nodes) {
        walk(child, node, child.nodes ? depth + 1 : depth);
      }
    }

    return queue;
  };

  return utils.flatten(walk(ast, {}, ast.type === 'root' ? 0 : 1));
};

module.exports = expand;
`
          ],
        ]);
      },
    },
    {
      path: "lib/parse.js",
      originalHash: "e572166565f15fa6ad9865ae49d678218e32aabfd1b3720f6d0d43d39800d310",
      patchedHash: "72aabaadaa555cdfbd07fbd7c7f743373e4dc8eec04a97550cc57bbeec30eb6c",
      /** Backport the pinned upstream depth and cycle guards. */
      patch(source) {
        return replaceExactly(source, [
          [
` */

const {
  MAX_LENGTH,
  CHAR_BACKSLASH, /* \\ */
  CHAR_BACKTICK, /* \` */
`,
` */

const {
  MAX_DEPTH,
  MAX_LENGTH,
  CHAR_BACKSLASH, /* \\ */
  CHAR_BACKTICK, /* \` */
`
          ],
          [
`
  const opts = options || {};
  const max = typeof opts.maxLength === 'number' ? Math.min(MAX_LENGTH, opts.maxLength) : MAX_LENGTH;
  if (input.length > max) {
    throw new SyntaxError(\`Input length (\${input.length}), exceeds max characters (\${max})\`);
  }
`,
`
  const opts = options || {};
  const max = typeof opts.maxLength === 'number' ? Math.min(MAX_LENGTH, opts.maxLength) : MAX_LENGTH;
  const maxDepth = Number.isFinite(opts.maxDepth) ? Math.min(MAX_DEPTH, opts.maxDepth) : MAX_DEPTH;
  if (input.length > max) {
    throw new SyntaxError(\`Input length (\${input.length}), exceeds max characters (\${max})\`);
  }
`
          ],
          [
`  const length = input.length;
  let index = 0;
  let depth = 0;
  let value;

  /**
`,
`  const length = input.length;
  let index = 0;
  let depth = 0;
  let nesting = 0;
  let value;

  /**
`
          ],
          [
`     */

    if (value === CHAR_LEFT_PARENTHESES) {
      block = push({ type: 'paren', nodes: [] });
      stack.push(block);
      push({ type: 'text', value });
`,
`     */

    if (value === CHAR_LEFT_PARENTHESES) {
      if (nesting + 1 > maxDepth) {
        throw new SyntaxError(\`Input depth (\${nesting + 1}), exceeds max depth (\${maxDepth})\`);
      }
      nesting++;
      block = push({ type: 'paren', nodes: [] });
      stack.push(block);
      push({ type: 'text', value });
`
          ],
          [
`      }
      block = stack.pop();
      push({ type: 'text', value });
      block = stack[stack.length - 1];
      continue;
    }
`,
`      }
      block = stack.pop();
      push({ type: 'text', value });
      nesting--;
      block = stack[stack.length - 1];
      continue;
    }
`
          ],
          [
`     */

    if (value === CHAR_LEFT_CURLY_BRACE) {
      depth++;

      const dollar = prev.value && prev.value.slice(-1) === '$' || block.dollar === true;
`,
`     */

    if (value === CHAR_LEFT_CURLY_BRACE) {
      if (nesting + 1 > maxDepth) {
        throw new SyntaxError(\`Input depth (\${nesting + 1}), exceeds max depth (\${maxDepth})\`);
      }
      nesting++;
      depth++;

      const dollar = prev.value && prev.value.slice(-1) === '$' || block.dollar === true;
`
          ],
          [
`
      push({ type, value });
      depth--;

      block = stack[stack.length - 1];
      continue;
`,
`
      push({ type, value });
      depth--;
      nesting--;

      block = stack[stack.length - 1];
      continue;
`
          ],
        ]);
      },
    },
    {
      path: "lib/stringify.js",
      originalHash: "379f22d77bfa1478341ccd49c5e4267464aabcbba03558bab332aac23fc6f23a",
      patchedHash: "49dc2d8bafa74f34715a18a845bcb82ce66caaf3bab4cf117998e06b1f9a50a9",
      /** Backport the pinned upstream depth and cycle guards. */
      patch(source) {
        return replaceExactly(source, [
          [
`'use strict';

const utils = require('./utils');

module.exports = (ast, options = {}) => {
  const stringify = (node, parent = {}) => {
    const invalidBlock = options.escapeInvalid && utils.isInvalidBrace(parent);
    const invalidNode = node.invalid === true && options.escapeInvalid === true;
    let output = '';
`,
`'use strict';

const utils = require('./utils');
const { MAX_DEPTH } = require('./constants');

module.exports = (ast, options = {}) => {
  const maxDepth = Number.isFinite(options.maxDepth) ? Math.min(MAX_DEPTH, options.maxDepth) : MAX_DEPTH;

  const stringify = (node, parent = {}, depth = 0) => {
    if (node.nodes && depth > maxDepth) {
      throw new RangeError(\`AST depth (\${depth}), exceeds max depth (\${maxDepth})\`);
    }
    const invalidBlock = options.escapeInvalid && utils.isInvalidBrace(parent);
    const invalidNode = node.invalid === true && options.escapeInvalid === true;
    let output = '';
`
          ],
          [
`
    if (node.nodes) {
      for (const child of node.nodes) {
        output += stringify(child);
      }
    }
    return output;
  };

  return stringify(ast);
};

`,
`
    if (node.nodes) {
      for (const child of node.nodes) {
        output += stringify(child, undefined, child.nodes ? depth + 1 : depth);
      }
    }
    return output;
  };

  return stringify(ast, {}, ast.type === 'root' ? 0 : 1);
};
`
          ],
        ]);
      },
    }
  ],
};
