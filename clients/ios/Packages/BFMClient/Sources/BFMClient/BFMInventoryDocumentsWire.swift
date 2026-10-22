import AppCore
import Foundation

/// The statuses every document route answers with a meaning of its own.
internal enum BFMDocumentsFailure {
    internal static func error(status: Int, message: String?) -> InventoryDocumentsError? {
        switch status {
        case 400, 422: message.map(InventoryDocumentsError.refused)
        case 404: .notFound
        case 412: .paperlessNotConnected
        case 413: .tooLarge
        case 415: .unsupportedType
        case 502, 503: .unavailable
        default: nil
        }
    }
}

/// Reads a file response's size, type and name off its headers: the total
/// after the slash of a `206`'s `Content-Range`, or a `200`'s
/// `Content-Length` when the server sent the whole file instead.
internal enum BFMDocumentFileHeaders {
    internal static func version(of response: HTTPURLResponse) -> InventoryDocumentFileVersion? {
        let byteCount: Int?
        if response.statusCode == 206 {
            byteCount = response.value(forHTTPHeaderField: "Content-Range")
                .flatMap { $0.split(separator: "/").last }
                .flatMap { Int($0.trimmingCharacters(in: .whitespaces)) }
        } else {
            byteCount = response.value(forHTTPHeaderField: "Content-Length").flatMap { Int($0) }
        }
        guard let byteCount else { return nil }
        return InventoryDocumentFileVersion(
            byteCount: byteCount,
            contentType: response.value(forHTTPHeaderField: "Content-Type"),
            fileName: response.value(forHTTPHeaderField: "Content-Disposition")
                .flatMap(fileName(fromDisposition:)))
    }

    /// `filename*=UTF-8''…` wins over `filename="…"`, per RFC 6266.
    internal static func fileName(fromDisposition value: String) -> String? {
        let parameters = value.split(separator: ";").map {
            $0.trimmingCharacters(in: .whitespaces)
        }
        if let extended = parameters.first(where: { $0.lowercased().hasPrefix("filename*=") }) {
            let encoded = extended.dropFirst("filename*=".count)
            let name = encoded.split(separator: "'", maxSplits: 2, omittingEmptySubsequences: false)
                .last.map(String.init)?.removingPercentEncoding
            if let name, !name.isEmpty { return name }
        }
        guard let plain = parameters.first(where: { $0.lowercased().hasPrefix("filename=") })
        else { return nil }
        let name = plain.dropFirst("filename=".count).trimmingCharacters(
            in: CharacterSet(charactersIn: "\""))
        return name.isEmpty ? nil : name
    }
}

internal struct WireDocumentRefusal: Decodable {
    let message: String
}

internal struct WireDocumentIngestionBody: Decodable, WireDocumentIngestion {
    let id: Int
    let documentType: String
    let title: String?
    let fileName: String
    let state: String
    let reason: String?

    var stateRawValue: String { state }
}

internal protocol WireDocumentIngestion {
    var id: Int { get }
    var documentType: String { get }
    var title: String? { get }
    var fileName: String { get }
    var stateRawValue: String { get }
    var reason: String? { get }
}

/// The wire's `missing`: `true`, `false`, or `null` when Paperless could not be asked.
internal func presence(
    of document: Operations.MobileInventory_listItemDocuments.Output.Ok.Body.JsonPayload
        .LinkedPayloadPayload
)
    -> InventoryLinkedDocument.Presence
{
    switch document.missing {
    case true?: .missing
    case false?: .present
    case nil: .unknown
    }
}

internal func ingestion(from wire: some WireDocumentIngestion) -> InventoryDocumentIngestion {
    InventoryDocumentIngestion(
        id: wire.id, kind: InventoryDocumentKind(wire: wire.documentType), title: wire.title,
        fileName: wire.fileName,
        state: InventoryDocumentIngestion.State(rawValue: wire.stateRawValue) ?? .failed,
        reason: wire.reason)
}

extension List.Output.Ok.Body.JsonPayload.PendingPayloadPayload: WireDocumentIngestion {
    var stateRawValue: String { state.rawValue }
}

extension List.Output.Ok.Body.JsonPayload.FailedPayloadPayload: WireDocumentIngestion {
    var stateRawValue: String { state.rawValue }
}

private typealias List = Operations.MobileInventory_listItemDocuments
