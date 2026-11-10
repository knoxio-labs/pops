import AppCore
import SwiftUI
import Testing
import ViewInspector

@testable import FeatureTrips

@Suite("Timeline controls")
@MainActor
internal struct TripsTimelineControlTests {
    @Test("grouping, booking scope and alternative selection control one projection")
    internal func controls() throws {
        var filter = TripTimelineFilter()
        let controls = TripsTimelineControls(filter: Binding(get: { filter }, set: { filter = $0 }))
        let pickers = try controls.inspect().findAll(ViewType.Picker.self)
        #expect(pickers.count == 2)
        try pickers[0].select(value: TripTimelineGrouping.month)
        #expect(filter.grouping == .month)
        try pickers[1].select(value: TripBookingScope.past)
        #expect(filter.scope == .past)
        let toggles = try controls.inspect().findAll(ViewType.Toggle.self)
        try toggles[0].tap()
        #expect(!filter.includeAlternatives)
    }

    @Test("the Documents shortcut opens the original Trip snapshot")
    internal func documents() throws {
        let snapshot = try TripNavigationTestContext.snapshot()
        let view = TripsDocumentShortcut(snapshot: snapshot, repository: ShortcutReader())
        let destination = try view.inspect().find(ViewType.NavigationLink.self)
            .view(TripsDocumentsView.self).actualView()
        #expect(destination.snapshot == snapshot)
    }
}

private actor ShortcutReader: DocumentsReading {
    func document(id: Int) async throws -> DocumentOriginal? { nil }
    func file(id: Int) async throws -> DownloadedDocument { throw DocumentAccessError.notFound }
}
