import AppCore
import Foundation
import GRDB

/// The `media.upload_state` column: how far a staged photo has got.
internal enum StagedUploadState: String {
    case waiting
    case uploading
    case uploaded
    case failed
}

/// The `media.upload_failure` column, and the refusal an attach waiting on
/// such a photo is recorded with, which opens the failed photo repair.
internal enum StagedUploadFailure: String {
    case tooLarge = "too_large"
    case unsupported
    case bytesMissing = "bytes_missing"

    init(_ failure: InventoryPhotoUploadFailure) {
        switch failure {
        case .tooLarge: self = .tooLarge
        case .unsupported: self = .unsupported
        case .bytesMissing: self = .bytesMissing
        }
    }

    var failure: InventoryPhotoUploadFailure {
        switch self {
        case .tooLarge: .tooLarge
        case .unsupported: .unsupported
        case .bytesMissing: .bytesMissing
        }
    }

    /// The reason the refused attach is stored with. Never sent: the attach
    /// is refused on the phone, because its photo never reached the server.
    var rejectionReason: String {
        switch self {
        case .tooLarge: "media_too_large"
        case .unsupported: "media_unsupported"
        case .bytesMissing: "media_unavailable"
        }
    }

    var rejectionMessage: String {
        switch self {
        case .tooLarge: "The photo is larger than the server accepts."
        case .unsupported: "The photo is in a format the server does not accept."
        case .bytesMissing: "The photo is no longer on this phone."
        }
    }

    /// Every refusal of a photo attach that means "the server does not have
    /// the bytes": the server's own `media_missing` and the phone's three.
    static let photoRejectionReasons: Set<String> = [
        InventoryRejectedReason.mediaMissing.storageValue,
        Self.tooLarge.rejectionReason, Self.unsupported.rejectionReason,
        Self.bytesMissing.rejectionReason,
    ]
}

/// A staged photo the drain has still to send.
internal struct StagedUpload: Equatable, Sendable {
    let sha256: String
    let contentType: InventoryMediaContentType
}
