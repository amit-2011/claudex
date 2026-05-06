const c = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  cyan: '\x1b[36m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  white: '\x1b[37m',
  gray: '\x1b[90m',
};

export const green = (s) => `${c.green}${s}${c.reset}`;
export const cyan = (s) => `${c.cyan}${s}${c.reset}`;
export const yellow = (s) => `${c.yellow}${s}${c.reset}`;
export const red = (s) => `${c.red}${s}${c.reset}`;
export const bold = (s) => `${c.bold}${s}${c.reset}`;
export const dim = (s) => `${c.dim}${s}${c.reset}`;
export const gray = (s) => `${c.gray}${s}${c.reset}`;

export const tick = green('✓');
export const cross = red('✗');
export const arrow = cyan('›');
