import AppCore
import Testing

@testable import FeatureTrips

@Suite("Source duration presentation")
internal struct TripVisitDurationLabelTests {
    @Test("independent duration bounds retain their source unit without synthesizing a bound")
    internal func sourceBounds() {
        #expect(
            tripVisitDurationLabel(.init(min: 2, max: nil, unit: "weeks")) == "At least 2 weeks")
        #expect(tripVisitDurationLabel(.init(min: nil, max: 5, unit: "days")) == "Up to 5 days")
        #expect(tripVisitDurationLabel(.init(min: 2, max: 5, unit: "days")) == "2–5 days")
        #expect(tripVisitDurationLabel(.init(min: nil, max: nil, unit: "days")) == nil)
    }
}
