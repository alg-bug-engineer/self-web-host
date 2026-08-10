export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs' || !process.env.APP_COMMIT_SHA) return

  const { initializeAnalyticsStore } = await import('./lib/analytics-storage')
  await initializeAnalyticsStore()
}
