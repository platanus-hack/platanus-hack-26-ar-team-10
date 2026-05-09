'use strict';

const COMMAND_RES = [
  /(?:^|\s)npx\s+skills\s+add\s+(\S+)/,
  /(?:^|\s)claude\s+skills\s+add\s+(\S+)/,
  /(?:^|\s)claude\s+plugin\s+add\s+(\S+)/,
];

function match(cmd) {
  const out = [];
  for (const re of COMMAND_RES) {
    const m = cmd.match(re);
    if (m) {
      let target = m[1];
      let version = 'latest';
      const at = target.lastIndexOf('@');
      if (at > 0 && !target.startsWith('@')) {
        version = target.slice(at + 1);
        target = target.slice(0, at);
      } else if (target.startsWith('@')) {
        const second = target.indexOf('@', 1);
        if (second > 0) {
          version = target.slice(second + 1);
          target = target.slice(0, second);
        }
      }
      out.push({
        type: 'skill',
        name: target,
        version,
        source: 'skills-marketplace',
        manager: 'skills',
        exotic: false,
      });
    }
  }
  return out;
}

module.exports = { match };
