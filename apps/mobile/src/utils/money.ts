const MONEY_INPUT_STRIP = /[^0-9.]/g;

export function sanitizeMoneyInput(value: string): string {
  const stripped = value.replace(MONEY_INPUT_STRIP, '');
  const dot = stripped.indexOf('.');
  if (dot === -1) return stripped;
  const intPart = stripped.slice(0, dot);
  const fracPart = stripped.slice(dot + 1).replace(/\./g, '').slice(0, 2);
  return fracPart === '' ? intPart : `${intPart}.${fracPart}`;
}