export const extractToken = (request: Request): string | null => {
  const url = new URL(request.url)
  const authHeader = request.headers.get('Authorization')
  if (authHeader) {
    return authHeader.replace('Bearer ', '')
  }
  return url.searchParams.get('token')
}

export const extractSessionId = (request: Request): string | null => {
  const url = new URL(request.url)
  const pathParts = url.pathname.split('/')
  const sessionIndex = pathParts.findIndex((part) => part === 'session')
  if (sessionIndex !== -1 && pathParts.length > sessionIndex + 1) {
    return pathParts[sessionIndex + 1] || null
  }
  return null
}
