import AppCore
import Foundation
import Observation

@MainActor
internal protocol ErrorHistoryPersistence: AnyObject {
    func load() -> Data?
    func save(_ data: Data)
}

@MainActor
internal final class UserDefaultsErrorHistoryPersistence: ErrorHistoryPersistence {
    private static let key = "pops.recent-errors.v1"
    private let defaults: UserDefaults

    internal init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
    }

    internal func load() -> Data? {
        defaults.data(forKey: Self.key)
    }

    internal func save(_ data: Data) {
        defaults.set(data, forKey: Self.key)
    }
}

@MainActor @Observable
internal final class AppErrorPresenter: ErrorPresenter {
    internal private(set) var banner: PresentedError?
    internal var detail: PresentedError?
    internal var showsRecentErrors = false
    internal private(set) var recentErrors: RecentErrors

    private let persistence: any ErrorHistoryPersistence
    private let now: () -> Date
    private let build: String
    private var automaticDismissal: Task<Void, Never>?

    internal init(
        persistence: any ErrorHistoryPersistence = UserDefaultsErrorHistoryPersistence(),
        now: @escaping () -> Date = { .now },
        build: String = AppErrorPresenter.currentBuild
    ) {
        self.persistence = persistence
        self.now = now
        self.build = build
        recentErrors = Self.decode(persistence.load())
    }

    internal func present(
        _ error: PopsError,
        operation: String,
        context: ErrorPresentationContext
    ) {
        let presented = PresentedError(
            error: error,
            operation: operation,
            occurredAt: now(),
            build: build)
        recentErrors.record(presented)
        persist()

        guard context == .foreground else { return }
        banner = presented
        scheduleAutomaticDismissal(for: presented)
    }

    internal func showRecentErrors() {
        showsRecentErrors = true
    }

    internal func showDetails(_ error: PresentedError) {
        detail = error
    }

    internal func dismiss(_ error: PresentedError) {
        guard banner?.id == error.id else { return }
        automaticDismissal?.cancel()
        banner = nil
    }

    internal func finishAutomaticDismissal(for id: PresentedError.ID) {
        guard banner?.id == id, banner?.bannerLifetime == .automatic else { return }
        banner = nil
    }

    private func scheduleAutomaticDismissal(for error: PresentedError) {
        automaticDismissal?.cancel()
        guard error.bannerLifetime == .automatic else { return }
        automaticDismissal = Task { [weak self] in
            try? await Task.sleep(for: .seconds(6))
            guard !Task.isCancelled else { return }
            self?.finishAutomaticDismissal(for: error.id)
        }
    }

    private func persist() {
        guard let encoded = try? JSONEncoder().encode(recentErrors) else { return }
        persistence.save(encoded)
    }

    private static func decode(_ data: Data?) -> RecentErrors {
        guard let data, let decoded = try? JSONDecoder().decode(RecentErrors.self, from: data)
        else {
            return RecentErrors()
        }
        return RecentErrors(decoded.entries)
    }

    private static var currentBuild: String {
        let version =
            Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString")
            as? String ?? "Unknown"
        let build =
            Bundle.main.object(forInfoDictionaryKey: "CFBundleVersion")
            as? String ?? "Unknown"
        return "Pops \(version) (\(build))"
    }
}
