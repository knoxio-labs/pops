import AppCore
import Foundation
import Testing

@testable import InventoryReplica

@Suite("Replica activity overlay")
internal struct ReplicaActivityTests {
    private static let refreshed = Date(timeIntervalSinceReferenceDate: 800_000_000)

    private static func overlay(
        _ stored: InventoryReplicaStatus, _ change: (inout ReplicaActivity) -> Void
    ) -> InventoryReplicaStatus {
        var activity = ReplicaActivity()
        change(&activity)
        return activity.overlay(on: stored, lastRefreshAt: refreshed)
    }

    @Test("with nothing going on, the stored status stands")
    func idle() {
        for stored in [
            InventoryReplicaStatus.empty, .downloading(progress: 0.5), .current,
            .stale(lastRefreshAt: Self.refreshed),
        ] {
            #expect(Self.overlay(stored) { _ in } == stored)
        }
    }

    @Test("blocked wins over every stored status and every other activity")
    func blockedWins() {
        #expect(
            Self.overlay(.downloading(progress: 0.5)) {
                $0.blocked = .appTooOld
                $0.isDownloading = true
                $0.isOffline = true
            } == .blocked(reason: .appTooOld))
        #expect(
            Self.overlay(.current) { $0.blocked = .sessionExpired }
                == .blocked(reason: .sessionExpired))
    }

    @Test("a download shows from nothing before its first page, then its stored progress")
    func downloading() {
        #expect(Self.overlay(.empty) { $0.isDownloading = true } == .downloading(progress: 0))
        #expect(
            Self.overlay(.downloading(progress: 0.25)) {
                $0.isDownloading = true
                $0.isOffline = true
            } == .downloading(progress: 0.25))
    }

    @Test("an interrupted download with the server unreachable shows offline")
    func interruptedDownloadOffline() {
        #expect(
            Self.overlay(.downloading(progress: 0.25)) { $0.isOffline = true }
                == .offline(lastRefreshAt: Self.refreshed))
    }

    @Test("a refresh shows as refreshing from current and from stale")
    func refreshing() {
        #expect(Self.overlay(.current) { $0.isRefreshing = true } == .refreshing)
        #expect(
            Self.overlay(.stale(lastRefreshAt: Self.refreshed)) { $0.isRefreshing = true }
                == .refreshing)
    }

    @Test("offline covers current, but a stale replica stays stale")
    func offline() {
        #expect(
            Self.overlay(.current) { $0.isOffline = true }
                == .offline(lastRefreshAt: Self.refreshed))
        #expect(
            Self.overlay(.stale(lastRefreshAt: Self.refreshed)) { $0.isOffline = true }
                == .stale(lastRefreshAt: Self.refreshed))
        #expect(Self.overlay(.empty) { $0.isOffline = true } == .empty)
    }
}
