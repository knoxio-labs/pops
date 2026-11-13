import AppCore
import Testing
import ViewInspector

@testable import FeatureTrips

@Suite("Inbox recovery actions")
@MainActor
internal struct TripsInboxRecoveryTests {
    @Test(arguments: [
        RepositoryError.featureUnavailable, .unauthorized, .contractMismatch,
        .requestRejected, .dependencyNotBound,
    ])
    internal func permanentFailure(_ error: RepositoryError) async throws {
        let model = TripsInboxModel(reader: FailingInboxReader(error: error))
        model.select(1)
        await model.readTask?.value
        let view = TripsInboxView(model: model, capture: nil)
        #expect(try view.inspect().findAll(ViewType.Button.self).isEmpty)
    }

    @Test("a temporary read failure keeps its explicit Retry action")
    internal func temporaryFailure() async throws {
        let model = TripsInboxModel(reader: FailingInboxReader(error: .unavailable))
        model.select(1)
        await model.readTask?.value
        let view = TripsInboxView(model: model, capture: nil)
        #expect(try view.inspect().findAll(ViewType.Button.self).count == 1)
        try view.inspect().find(button: "Retry").tap()
        await model.readTask?.value
        #expect(model.state == .failed(.unavailable))
    }
}

private struct FailingInboxReader: TripCapturesReading {
    let error: RepositoryError
    func captures(tripID: Int) async throws -> TripCaptureWorkspace { throw error }
}
