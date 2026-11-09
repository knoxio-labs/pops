import AppCore
import Testing

@testable import FeatureTrips

@Suite("Trip failure recovery")
@MainActor
internal struct TripsFailureTests {
    @Test(
        "changed sources can be retried while invalid contracts and grants have no dead retry action"
    )
    internal func retryPolicy() {
        #expect(TripsFailureView.canRetry(.conflict(TripsReadPolicy.sourceChangedReason)))
        #expect(TripsFailureView.canRetry(.unavailable))
        #expect(!TripsFailureView.canRetry(.contractMismatch))
        #expect(!TripsFailureView.canRetry(.requestRejected))
        #expect(!TripsFailureView.canRetry(.featureUnavailable))
        #expect(!TripsFailureView.canRetry(.dependencyNotBound))
        #expect(!TripsFailureView.canRetry(.unauthorized))
    }
}
