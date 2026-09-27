import Testing

@testable import DesignPlayground

@Suite("Error presentation")
internal struct ErrorPresentationTests {
    @Test("retryable failures leave automatically and non-retryable failures stay")
    func bannerLifetimeFollowsRetryability() {
        #expect(ErrorPresentationFixtures.retryable.bannerLifetime == .automatic)
        #expect(ErrorPresentationFixtures.nonRetryable.bannerLifetime == .untilDismissed)
    }

    @Test("recent errors retains only the newest 50 failures")
    func recentErrorsCap() {
        let source = ErrorPresentationFixtures.recent
        let recent = RecentErrors(source)

        #expect(source.count == 52)
        #expect(recent.entries.count == RecentErrors.limit)
        #expect(recent.entries.first == source.first)
        #expect(recent.entries.last == source[49])
        #expect(!recent.entries.contains(source[50]))
    }

    @Test("copied details carry every reportable field")
    func copiedDetails() {
        let error = ErrorPresentationFixtures.nonRetryable
        let details = error.copiedDetails

        #expect(details.contains(error.message))
        #expect(details.contains("Code: \(error.code)"))
        #expect(details.contains("Request: \(error.requestID)"))
        #expect(details.contains("Operation: \(error.operation)"))
        #expect(details.contains("Time: \(error.occurredAt)"))
        #expect(details.contains("Build: \(error.build)"))
    }
}
