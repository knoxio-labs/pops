import AppCore
import Testing

@testable import FeatureTrips

@Suite("Trip source presentation ownership")
@MainActor
internal struct TripsSourceBindingTests {
    @Test("a source binding from before tab ABA cannot dismiss or replace a newer destination")
    internal func tabABA() async throws {
        let snapshot = try TripNavigationTestContext.snapshot()
        let reader = BindingTripReader(snapshot: snapshot)
        let model = TripsModel(repository: reader)
        await model.select(snapshot.trip.id)
        model.tab = .plan
        let first = TripSource.stay(try #require(snapshot.stays.first))
        let second = TripSource.journey(try #require(snapshot.journeys.first))
        model.source = first
        let stack = TripsSelectedTripStack(
            model: model, tab: .plan, documents: reader, capture: nil)
        let old = stack.sourceSelection
        model.tab = .trips
        model.tab = .plan
        model.source = second
        old.wrappedValue = nil
        #expect(model.source == second)
        old.wrappedValue = first
        #expect(model.source == second)
        #expect(old.wrappedValue == nil)
        stack.sourceSelection.wrappedValue = nil
        #expect(model.source == nil)
    }

    @Test("a binding from an earlier selection cannot affect a reselected Trip")
    internal func tripABA() async throws {
        let snapshot = try TripNavigationTestContext.snapshot()
        let reader = BindingTripReader(snapshot: snapshot)
        let model = TripsModel(repository: reader)
        await model.select(snapshot.trip.id)
        model.tab = .plan
        let first = TripSource.stay(try #require(snapshot.stays.first))
        let second = TripSource.journey(try #require(snapshot.journeys.first))
        model.source = first
        let stack = TripsSelectedTripStack(
            model: model, tab: .plan, documents: reader, capture: nil)
        let old = stack.sourceSelection
        await model.select(987)
        await model.select(snapshot.trip.id)
        model.source = second
        old.wrappedValue = nil
        old.wrappedValue = first
        #expect(model.source == second)
        #expect(old.wrappedValue == nil)
        #expect(stack.sourceSelection.wrappedValue == second)
    }
}

private struct BindingTripReader: TripsReading, DocumentsReading {
    let snapshot: TripSnapshot
    func trips() async throws -> [TripRecord] { [snapshot.trip] }
    func trip(id: Int) async throws -> TripSnapshot? { id == snapshot.trip.id ? snapshot : nil }
    func document(id: Int) async throws -> DocumentOriginal? { nil }
    func file(id: Int) async throws -> DownloadedDocument { throw DocumentAccessError.notFound }
}
