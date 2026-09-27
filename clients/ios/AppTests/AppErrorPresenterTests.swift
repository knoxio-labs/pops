import AppCore
import Foundation
import Testing

@testable import Pops

@MainActor
@Suite("App error presenter")
internal struct AppErrorPresenterTests {
    @Test("foreground failures present while background failures only record")
    func foregroundVersusBackground() {
        let presenter = AppErrorPresenter(
            persistence: MemoryErrorHistoryPersistence(),
            now: { Date(timeIntervalSince1970: 1) },
            build: "Test")

        presenter.present(Self.failure("background"), operation: "Refresh", context: .background)
        #expect(presenter.banner == nil)
        #expect(presenter.recentErrors.entries.map(\.error.code) == ["background"])

        presenter.present(Self.failure("foreground"), operation: "Save", context: .foreground)
        #expect(presenter.banner?.error.code == "foreground")
        #expect(
            presenter.recentErrors.entries.map(\.error.code)
                == ["foreground", "background"])
    }

    @Test("retryable banners can expire but sticky banners wait for dismissal")
    func bannerBehavior() throws {
        let presenter = AppErrorPresenter(
            persistence: MemoryErrorHistoryPersistence(), build: "Test")
        presenter.present(Self.failure("retryable"), operation: "Refresh", context: .foreground)
        let retryable = try #require(presenter.banner)
        #expect(retryable.bannerLifetime == .automatic)

        presenter.finishAutomaticDismissal(for: retryable.id)
        #expect(presenter.banner == nil)

        presenter.present(
            Self.failure("sticky", retryable: false),
            operation: "Save",
            context: .foreground)
        let sticky = try #require(presenter.banner)
        #expect(sticky.bannerLifetime == .untilDismissed)

        presenter.finishAutomaticDismissal(for: sticky.id)
        #expect(presenter.banner?.id == sticky.id)

        presenter.dismiss(sticky)
        #expect(presenter.banner == nil)
    }

    @Test("the newest 50 failures survive presenter reconstruction")
    func persistenceBoundAndRelaunch() {
        let persistence = MemoryErrorHistoryPersistence()
        let first = AppErrorPresenter(persistence: persistence, build: "Test")
        for index in 0..<52 {
            first.present(
                Self.failure("failure.\(index)"),
                operation: "Background refresh",
                context: .background)
        }

        let relaunched = AppErrorPresenter(persistence: persistence, build: "Test")

        #expect(relaunched.recentErrors.entries.count == RecentErrors.limit)
        #expect(relaunched.recentErrors.entries.first?.error.code == "failure.51")
        #expect(relaunched.recentErrors.entries.last?.error.code == "failure.2")
    }

    private static func failure(_ code: String, retryable: Bool = true) -> PopsError {
        PopsError(code: code, message: "Message for \(code)", retryable: retryable, kind: .server)
    }
}

@MainActor
private final class MemoryErrorHistoryPersistence: ErrorHistoryPersistence {
    private var stored: Data?

    func load() -> Data? { stored }

    func save(_ data: Data) { stored = data }
}
