import AppCore
import Testing
import ViewInspector

@testable import FeatureTrips

@Suite("Selected Trip canonical capture composition")
@MainActor
internal struct TripCaptureCompositionTests {
    @Test("the actual root Capture action retains the same Trip draft across close and reopen")
    internal func retainedComposer() async throws {
        let context = try await TripNavigationTestContext.make()
        let writer = ComposerWriter()
        let drafts = TripCaptureDrafts(writer: writer)
        let root = TripsRootView(
            model: context.model, documents: context.reader, captureDrafts: drafts)
        try root.inspect().find(button: "Capture").tap()
        let first = try #require(context.model.capture)
        #expect(first.tripID == context.first.trip.id)
        first.input.originalText = "  source retained\n"
        let composer = TripCaptureComposer(draft: first)
        try composer.inspect().find(button: "Save capture").tap()
        await first.writeTask?.value
        let submitted = try #require(first.pending)
        #expect(await writer.operations == [submitted])
        context.model.capture = nil
        try root.inspect().find(button: "Capture").tap()
        let reopened = try #require(context.model.capture)
        #expect(reopened === first)
        #expect(reopened.input.originalText == "  source retained\n")
        #expect(reopened.pending == submitted)
        try TripCaptureComposer(draft: reopened).inspect().find(button: "Retry saved request").tap()
        await reopened.writeTask?.value
        #expect(await writer.operations == [submitted, submitted])
        #expect(try root.inspect().findAll(ViewType.TabView.self).count == 1)
    }

    @Test(
        "without a bound writer the existing source reader does not advertise an active capture action"
    )
    internal func readOnlyComposition() async throws {
        let context = try await TripNavigationTestContext.make()
        let buttons = try context.root.inspect().findAll(ViewType.Button.self)
        #expect(
            try buttons.filter {
                try $0.labelView().findAll(ViewType.Text.self).contains {
                    try $0.string() == "Capture"
                }
            }.isEmpty)
        #expect(context.model.capture == nil)
    }
}

private actor ComposerWriter: TripCapturesWriting {
    internal private(set) var operations: [TripCaptureCreateOperation] = []
    internal func createCapture(tripID: Int, operation: TripCaptureCreateOperation) async throws
        -> TripCaptureOperationResult
    {
        operations.append(operation)
        throw RepositoryError.unavailable
    }
}
