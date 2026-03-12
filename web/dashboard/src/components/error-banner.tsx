export function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="rounded-lg border border-critical/30 bg-critical/10 px-4 py-3 text-sm text-critical">
      {message}
    </div>
  )
}
