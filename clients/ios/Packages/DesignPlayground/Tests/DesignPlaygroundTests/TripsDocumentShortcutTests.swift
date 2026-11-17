import AppCore
import Testing
import ViewInspector

@testable import FeatureTrips

@Suite("Trip documents shortcut")
@MainActor
internal struct TripsDocumentShortcutTests {
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
