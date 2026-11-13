import Foundation

/// An accepted Documents identity. A local file or its metadata is never an attachment identity.
public enum TripCaptureAttachment: Codable, Hashable, Sendable {
    case task(String)
    case document(id: Int, taskID: String?)

    private enum CodingKeys: String, CodingKey { case kind, taskId, documentId }
    private enum Kind: String, Codable { case task, document }

    /// Decodes the owner-issued task or original identity, rejecting other attachment kinds.
    public init(from decoder: any Decoder) throws {
        let value = try decoder.container(keyedBy: CodingKeys.self)
        switch try value.decode(Kind.self, forKey: .kind) {
        case .task: self = .task(try value.decode(String.self, forKey: .taskId))
        case .document:
            self = .document(
                id: try value.decode(Int.self, forKey: .documentId),
                taskID: try value.decodeIfPresent(String.self, forKey: .taskId))
        }
    }

    /// Encodes the canonical discriminator and identity without serializing local file metadata.
    public func encode(to encoder: any Encoder) throws {
        var value = encoder.container(keyedBy: CodingKeys.self)
        switch self {
        case .task(let id):
            try value.encode(Kind.task, forKey: .kind)
            try value.encode(id, forKey: .taskId)
        case .document(let id, let taskID):
            try value.encode(Kind.document, forKey: .kind)
            try value.encode(id, forKey: .documentId)
            try value.encodeIfPresent(taskID, forKey: .taskId)
        }
    }
}
