import AppCore

internal enum TransactionsRetry {
    @MainActor
    internal static func perform(
        after error: RepositoryError,
        wait: @escaping @MainActor (Duration) async throws -> Void = {
            try await Task.sleep(for: $0)
        },
        retry: @escaping @MainActor () async -> Void
    ) async {
        if case .rateLimited(let retryAfterSeconds) = error {
            let seconds = max(1, retryAfterSeconds ?? 60)
            do {
                try await wait(.seconds(seconds))
            } catch {
                return
            }
            guard !Task.isCancelled else { return }
        }
        await retry()
    }
}
