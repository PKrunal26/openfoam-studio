/** Known Foundation startup status lines report trapping support, not a solver failure. */
function isTrappingStatus(line: string): boolean {
  return /^\s*sigFpe\s*:\s*(?:Floating point exception trapping\s*-\s*not supported on this platform|Enabling floating point exception trapping\s*\(FOAM_SIGFPE\)\.)\s*$/i.test(line)
}

/** Ignore only complete known informational lines; retain crashes and non-finite evidence. */
export function hasFatalSolverLog(log: string): boolean {
  return log.split(/\r?\n/).some(line => !isTrappingStatus(line) &&
    /FOAM FATAL|floating point exception|\bSIGFPE\b|(?:^|[\s=(,])[-+]?(?:nan|inf|infinity)(?=[\s),;]|$)/i.test(line))
}
