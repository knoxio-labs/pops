import Foundation

/// How far a photo staged on this phone has got towards the server
/// (ADR-002 D11: photos are written on the phone before the change that
/// attaches them, and sent ahead of it).
public enum InventoryPhotoUpload: Hashable, Sendable {
    /// On the phone, waiting for the network.
    case waiting
    /// Being sent now.
    case uploading
    /// The server has the bytes.
    case uploaded
    /// The server refused the bytes, or they are gone from the phone.
    /// Sending them again would change nothing, so the photo waits for
    /// Retry or Remove.
    case failed(InventoryPhotoUploadFailure)
}

/// Why a staged photo will not upload as it stands.
public enum InventoryPhotoUploadFailure: Hashable, Sendable {
    /// Over the media route's size cap (`413`).
    case tooLarge
    /// A format the media route does not take (`415`).
    case unsupported
    /// The staged bytes are no longer on the phone.
    case bytesMissing
}
