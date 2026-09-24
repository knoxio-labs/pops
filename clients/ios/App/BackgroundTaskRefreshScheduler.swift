import AppCore
import BackgroundTasks
import Foundation

/// ``AppCore/BackgroundRefreshScheduler`` over `BGTaskScheduler`: submits a
/// `BGAppRefreshTaskRequest`, which replaces any pending one with the same
/// identifier. The identifier must be listed under
/// `BGTaskSchedulerPermittedIdentifiers` in `Info.plist`, or the submit
/// throws. `BGTaskScheduler` asks for this off the main thread, which a
/// nonisolated `async` function is.
internal struct BackgroundTaskRefreshScheduler: BackgroundRefreshScheduler {
    internal func submitRefresh(identifier: String, earliestBeginDate: Date) async throws {
        let request = BGAppRefreshTaskRequest(identifier: identifier)
        request.earliestBeginDate = earliestBeginDate
        try await BGTaskScheduler.shared.submitTaskRequest(request)
    }
}
