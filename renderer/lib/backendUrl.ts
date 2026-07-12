const base = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, '') ?? ''

export function backendUrl(path: string): string {
  return base ? `${base}${path}` : path
}
