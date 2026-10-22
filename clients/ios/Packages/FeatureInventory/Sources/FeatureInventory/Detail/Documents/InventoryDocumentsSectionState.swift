import AppCore
import Foundation

/// One row of the Documents section.
internal struct InventoryDocumentRow: Identifiable, Equatable {
    internal enum Status: Equatable {
        /// Opens in QuickLook.
        case linked(InventoryLinkedDocument)
        /// Linked, but Paperless no longer has it.
        case missing(InventoryLinkedDocument)
        case processing(InventoryDocumentIngestion)
        case failed(InventoryDocumentIngestion)
        /// A title the replica knows, with nothing to open it by.
        case titleOnly
    }

    internal let id: String
    internal let title: String
    internal let kind: InventoryDocumentKind?
    internal let status: Status

    internal var linkedDocument: InventoryLinkedDocument? {
        switch status {
        case .linked(let document), .missing(let document): document
        case .processing, .failed, .titleOnly: nil
        }
    }

    internal var ingestion: InventoryDocumentIngestion? {
        switch status {
        case .processing(let ingestion), .failed(let ingestion): ingestion
        case .linked, .missing, .titleOnly: nil
        }
    }
}

/// What the Documents section draws: its rows, whether Paperless could be
/// reached, and whether a document can be added from here.
internal struct InventoryDocumentsSectionState: Equatable {
    internal enum Notice: Equatable {
        /// Paperless is not connected or not answering (`412`/`503`).
        case paperlessUnavailable
    }

    internal let rows: [InventoryDocumentRow]
    internal let notice: Notice?
    internal let canAdd: Bool

    /// Nothing at all: the section is not drawn.
    internal static let hidden = InventoryDocumentsSectionState(
        rows: [], notice: nil, canAdd: false)

    internal var isHidden: Bool { rows.isEmpty && notice == nil && !canAdd }
    internal var hasPending: Bool {
        rows.contains { if case .processing = $0.status { true } else { false } }
    }

    /// The section for the server's latest answer.
    ///
    /// - Parameters:
    ///   - answer: `nil` before the first read finishes.
    ///   - snapshot: The list this item last showed, drawn while loading and
    ///     whenever the server cannot answer.
    ///   - replica: The synced titles, the floor when there is no snapshot.
    internal static func make(
        answer: Result<InventoryItemDocuments, any Error>?,
        snapshot: InventoryItemDocuments?,
        replica: InventoryDocumentsStatus
    ) -> InventoryDocumentsSectionState {
        switch answer {
        case .success(let documents):
            return InventoryDocumentsSectionState(
                rows: rows(documents), notice: nil, canAdd: true)
        case .failure(let error) where isPaperlessUnavailable(error):
            return InventoryDocumentsSectionState(
                rows: snapshot.map(rows) ?? [], notice: .paperlessUnavailable, canAdd: false)
        case .failure:
            return InventoryDocumentsSectionState(
                rows: snapshot.map(rows) ?? rows(replica), notice: nil, canAdd: true)
        case nil:
            let rows = snapshot.map(rows) ?? rows(replica)
            return rows.isEmpty
                ? .hidden : InventoryDocumentsSectionState(rows: rows, notice: nil, canAdd: false)
        }
    }

    private static func isPaperlessUnavailable(_ error: any Error) -> Bool {
        switch error {
        case InventoryDocumentsError.paperlessNotConnected, InventoryDocumentsError.unavailable:
            true
        default:
            false
        }
    }

    private static func rows(_ documents: InventoryItemDocuments) -> [InventoryDocumentRow] {
        let linked = documents.linked.map { document in
            InventoryDocumentRow(
                id: "link-\(document.id)",
                title: document.title ?? InventoryDocumentCopy.kindName(document.kind),
                kind: document.kind,
                status: document.presence == .missing ? .missing(document) : .linked(document))
        }
        let ingestions = (documents.pending + documents.failed).map { ingestion in
            InventoryDocumentRow(
                id: "ingestion-\(ingestion.id)",
                title: ingestion.title ?? ingestion.fileName,
                kind: ingestion.kind,
                status: ingestion.state == .pending ? .processing(ingestion) : .failed(ingestion))
        }
        return linked + ingestions
    }

    private static func rows(_ replica: InventoryDocumentsStatus) -> [InventoryDocumentRow] {
        guard case .linked(let titles) = replica else { return [] }
        return titles.enumerated().map { index, title in
            InventoryDocumentRow(id: "title-\(index)", title: title, kind: nil, status: .titleOnly)
        }
    }
}

/// The section's words.
internal enum InventoryDocumentCopy {
    internal static let sectionTitle = "Documents"
    internal static let add = "Add document"
    internal static let chooseFile = "Choose File"
    internal static let scan = "Scan"
    internal static let photoLibrary = "Photo Library"
    internal static let paperlessUnavailable = "Paperless unavailable"
    internal static let missing = "Missing from Paperless"
    internal static let processing = "Processing"
    internal static let failed = "Not added"
    internal static let needsConnection = "Needs a connection"
    internal static let uploadOffline = "Uploads need a connection and are not saved for later."
    internal static let unsupportedType = "Paperless does not take this kind of file."
    internal static let notChanged = "Not changed"

    internal static func kindName(_ kind: InventoryDocumentKind) -> String {
        switch kind {
        case .receipt: "Receipt"
        case .warranty: "Warranty"
        case .manual: "Manual"
        case .invoice: "Invoice"
        case .other: "Document"
        }
    }

    internal static func tooLarge(maxUploadBytes: Int) -> String {
        let limit = Int64(maxUploadBytes).formatted(.byteCount(style: .file))
        return "Larger than \(limit), the most Paperless takes."
    }

    internal static func message(for refusal: InventoryDocumentUploadRefusal) -> String {
        switch refusal {
        case .tooLarge(let maxUploadBytes): tooLarge(maxUploadBytes: maxUploadBytes)
        case .unsupportedType: unsupportedType
        }
    }

    internal static func message(for error: any Error) -> String {
        switch error {
        case InventoryDocumentsError.offline, InventoryDocumentsError.needsConnection:
            needsConnection
        case InventoryDocumentsError.paperlessNotConnected, InventoryDocumentsError.unavailable:
            paperlessUnavailable
        case InventoryDocumentsError.notFound: "That document is no longer there."
        case InventoryDocumentsError.tooLarge: "Larger than Paperless takes."
        case InventoryDocumentsError.unsupportedType: unsupportedType
        case InventoryDocumentsError.refused(let message): message
        case let failure as RepositoryError: InventoryCopy.message(for: failure)
        default: InventoryCopy.unavailable
        }
    }
}
