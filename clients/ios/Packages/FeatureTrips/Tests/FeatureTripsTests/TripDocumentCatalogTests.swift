import AppCore
import Testing

@testable import FeatureTrips

@Suite("Documents metadata identity")
@MainActor
internal struct TripDocumentCatalogTests {
    @Test(
        "same-filename originals keep IDs, repeated links read once and failures remain distinct"
    )
    internal func originalIdentity() async throws {
        let first = document(10)
        let second = document(11)
        let reader = CatalogReader(values: [
            10: .success(first), 11: .success(second), 12: .success(nil),
            13: .failure(RepositoryError.featureUnavailable), 14: .success(document(99)),
        ])
        let model = TripDocumentCatalogModel(repository: reader)
        await model.load([10, 10, 11, 12, 13, 14])
        guard case .available(let one) = model.states[10],
            case .available(let two) = model.states[11]
        else {
            Issue.record("Both actual originals must remain available by their own IDs")
            return
        }
        #expect(one.id == 10)
        #expect(two.id == 11)
        #expect(one.originalFileName == two.originalFileName)
        guard case .missing = model.states[12] else {
            Issue.record("Owner404 must remain missing")
            return
        }
        guard case .failed(let denied) = model.states[13],
            case .failed(let mismatch) = model.states[14]
        else {
            Issue.record("Refused and substituted source reads must remain failures")
            return
        }
        #expect(denied as? RepositoryError == .featureUnavailable)
        #expect(mismatch as? RepositoryError == .contractMismatch)
        #expect(await reader.requested == [10, 11, 12, 13, 14])
        #expect(await reader.fileRequests == 0)
    }

    @Test(
        "display labels use actual title then filename, keeping source IDs as the final functional identity"
    )
    internal func sourceLabels() {
        #expect(tripDocumentTitle(document(10)) == "Source title")
        #expect(tripDocumentTitle(document(10, title: "")) == "Same.pdf")
        #expect(tripDocumentTitle(document(10, title: "", file: "")) == "Document 10")
    }

    private func document(_ id: Int, title: String = "Source title", file: String = "Same.pdf")
        -> DocumentOriginal
    {
        DocumentOriginal(
            id: id, title: title, created: "", originalFileName: file, thumbnailUrl: "")
    }
}

private actor CatalogReader: DocumentsReading {
    internal let values: [Int: Result<DocumentOriginal?, any Error>]
    internal private(set) var requested: [Int] = []
    internal private(set) var fileRequests = 0

    internal init(values: [Int: Result<DocumentOriginal?, any Error>]) { self.values = values }

    internal func document(id: Int) async throws -> DocumentOriginal? {
        requested.append(id)
        guard let result = values[id] else { throw RepositoryError.contractMismatch }
        return try result.get()
    }

    internal func file(id: Int) async throws -> DownloadedDocument {
        fileRequests += 1
        throw DocumentAccessError.notFound
    }
}
