import AppCore
import Testing
import ViewInspector

@testable import FeatureTrips

@Suite("Canonical Plan in the selected Trip")
@MainActor
internal struct TripsPlanNavigationTests {
    @Test("Today and Plan are native tabs sharing one Trip and exact source action")
    internal func selectedPlan() async throws {
        let snapshot = try TripNavigationTestContext.snapshot()
        let journey = try #require(snapshot.journeys.first)
        let route = TripRouteSnapshot(
            tripId: snapshot.trip.id, revision: 3, order: [.journey(journey.id)],
            paths: [], missingSources: [])
        let reader = PlanNavigationReader(snapshot: snapshot, route: route)
        let model = TripsModel(repository: reader, routeReader: reader)
        await model.select(snapshot.trip.id)
        await model.route.readTask?.value
        let root = TripsRootView(model: model, documents: reader)
        #expect(try root.inspect().findAll(TripsTimelineView.self).count == 1)
        model.tab = .plan
        let workspace = TripsWorkspaceView(model: model, tab: .plan)
        let plan = try workspace.inspect().find(TripsPlanLineView.self).actualView()
        #expect(plan.route == route)
        #expect(plan.snapshot == snapshot)
        #expect(try root.inspect().find(ViewType.TabView.self).count == 4)
        let sourceRow = try #require(
            plan.inspect().findAll(TripsPlanLineSourceRow.self).first {
                try $0.actualView().source == .journey(journey)
            })
        #expect(try sourceRow.actualView().source == .journey(journey))
        try sourceRow.find(ViewType.Button.self).tap()
        #expect(model.source == .journey(journey))
        #expect(model.canonicalSource(try #require(model.source)) == .journey(journey))
        model.tab = .trips
        #expect(try root.inspect().find(TripsTimelineView.self).actualView().snapshot == snapshot)
    }

    @Test("route failure is presented only in Plan while Today stays usable")
    internal func failedRoute() async throws {
        let snapshot = try TripNavigationTestContext.snapshot()
        let reader = PlanNavigationReader(snapshot: snapshot, route: nil, failure: .unavailable)
        let model = TripsModel(repository: reader, routeReader: reader)
        await model.select(snapshot.trip.id)
        await model.route.readTask?.value
        let today = TripsWorkspaceView(model: model, tab: .trips)
        #expect(try today.inspect().findAll(TripsTimelineView.self).count == 1)
        model.tab = .plan
        let view = TripsWorkspaceView(model: model, tab: .plan)
        let failure = try view.inspect().find(TripsFailureView.self).actualView()
        #expect(failure.failure == .unavailable)
        #expect(try view.inspect().findAll(TripsPlanLineView.self).isEmpty)
    }

    @Test("an explicit missing route never renders a successful empty plan")
    internal func missingRoute() async throws {
        let snapshot = try TripNavigationTestContext.snapshot()
        let reader = PlanNavigationReader(snapshot: snapshot, route: nil)
        let model = TripsModel(repository: reader, routeReader: reader)
        await model.select(snapshot.trip.id)
        await model.route.readTask?.value
        model.tab = .plan
        let view = TripsWorkspaceView(model: model, tab: .plan)
        #expect(try view.inspect().find(text: "Route unavailable").string() == "Route unavailable")
        #expect(try view.inspect().findAll(TripsPlanLineView.self).isEmpty)
        #expect(model.route.state == .missing)
    }

    @Test("an unbound Plan is visible instead of falling back to Today")
    internal func unboundRoute() async throws {
        let snapshot = try TripNavigationTestContext.snapshot()
        let reader = PlanNavigationReader(snapshot: snapshot, route: nil)
        let model = TripsModel(repository: reader)
        await model.select(snapshot.trip.id)
        model.tab = .plan
        let view = TripsWorkspaceView(model: model, tab: .plan)
        #expect(
            try view.inspect().find(text: "Plan is not connected").string()
                == "Plan is not connected")
        #expect(try view.inspect().findAll(TripsTimelineView.self).isEmpty)
        #expect(try view.inspect().findAll(TripsPlanLineView.self).isEmpty)
    }

    @Test("detail failure preserves independently loaded Plan structure")
    internal func failedDetail() async throws {
        let snapshot = try TripNavigationTestContext.snapshot()
        let route = TripRouteSnapshot(
            tripId: snapshot.trip.id, revision: 3, order: [.journey(7)],
            paths: [], missingSources: [])
        let reader = PlanNavigationReader(
            snapshot: snapshot, route: route, detailFailure: .unavailable)
        let model = TripsModel(repository: reader, routeReader: reader)
        await model.select(snapshot.trip.id)
        await model.route.readTask?.value
        model.tab = .plan
        let view = TripsWorkspaceView(model: model, tab: .plan)
        let plan = try view.inspect().find(TripsPlanLineView.self).actualView()
        #expect(plan.route == route)
        #expect(plan.snapshot == nil)
        #expect(model.failure == .unavailable)
    }

    @Test("a producer-missing journey cannot open stale source detail from Plan")
    internal func missingSource() throws {
        let snapshot = try TripNavigationTestContext.snapshot()
        let journey = try #require(snapshot.journeys.first)
        let route = TripRouteSnapshot(
            tripId: snapshot.trip.id, revision: 3, order: [.journey(journey.id)],
            paths: [], missingSources: [.journey(journey.id)])
        var opened: [TripSource] = []
        let plan = TripsPlanLineView(route: route, snapshot: snapshot) { opened.append($0) }
        let journeyRows = try plan.inspect().findAll(TripsPlanLineSourceRow.self)
            .map { try $0.actualView().source }
            .filter { $0 == .journey(journey) }
        #expect(journeyRows.isEmpty)
        #expect(try plan.inspect().find(text: "Source missing").string() == "Source missing")
        #expect(opened.isEmpty)
    }

    @Test("an applied-only path is history rather than an available alternative")
    internal func appliedHistory() throws {
        let route = TripRouteSnapshot(
            tripId: 1, revision: 3, order: [.gap(5), .journey(7)],
            paths: [
                TripRoutePath(
                    id: 8, title: "Coast", gapId: 5, state: .applied, members: [.journey(7)])
            ],
            missingSources: [])
        let plan = TripsPlanLineView(route: route, snapshot: nil) { _ in }
        #expect(
            try plan.inspect().find(text: "Applied path history").string() == "Applied path history"
        )
        #expect(
            try plan.inspect().find(text: "Paths are shown below.").string()
                == "Paths are shown below.")
        #expect(
            try plan.inspect().findAll(ViewType.Text.self).allSatisfy {
                try $0.string() != "Alternative path"
            })
    }
}

private struct PlanNavigationReader: TripsReading, TripsRouteReading, DocumentsReading {
    let snapshot: TripSnapshot
    let route: TripRouteSnapshot?
    var failure: RepositoryError?
    var detailFailure: RepositoryError?
    func trips() async throws -> [TripRecord] { [snapshot.trip] }
    func trip(id: Int) async throws -> TripSnapshot? {
        if let detailFailure { throw detailFailure }
        return snapshot
    }
    func route(tripId: Int) async throws -> TripRouteSnapshot? {
        if let failure { throw failure }
        return route
    }
    func document(id: Int) async throws -> DocumentOriginal? { nil }
    func file(id: Int) async throws -> DownloadedDocument { throw DocumentAccessError.notFound }
}
