import Foundation

/// What has happened to one photograph's bytes.
///
/// Staged is the state that matters: the bytes are held before the record
/// exists, so cancelling is the only thing that throws them away and a
/// relaunch finds them again.
internal enum InventoryPhotoUpload: Equatable {
    case staged
    case uploading
    case uploaded
    case failed(String)
}

internal struct InventoryDraftPhoto: Identifiable, Equatable {
    internal let id: String
    /// What the photograph is of, when the item alone does not say. Empty is
    /// the ordinary case.
    internal var caption: String
    internal var upload: InventoryPhotoUpload
    /// A bundled sample JPEG (``SamplePhoto``) standing in for the bytes a
    /// camera capture would hand the draft. `nil` draws the strip's ordinary
    /// placeholder tile.
    internal var imageData: Data?

    internal init(
        id: String, caption: String = "", upload: InventoryPhotoUpload = .staged,
        imageData: Data? = nil
    ) {
        self.id = id
        self.caption = caption
        self.upload = upload
        self.imageData = imageData
    }
}

/// How far a set of photographs has got, as one fact a screen can state.
///
/// Derived rather than stored, because a count kept beside the photographs is
/// a count that disagrees with them the first time one is deleted.
internal enum InventoryPhotoProgress: Equatable {
    case none
    case staged(Int)
    case partial(done: Int, total: Int)
    case complete(Int)
    case failed(done: Int, total: Int, reason: String)

    internal var message: String? {
        switch self {
        case .none, .complete: nil
        case .staged(let count): "\(count) held on this phone until the item is created."
        case .partial(let done, let total): "\(done) of \(total) photos sent."
        case .failed(let done, let total, let reason):
            "\(done) of \(total) photos sent. \(reason)"
        }
    }
}

extension Array where Element == InventoryDraftPhoto {
    /// The photograph at `from` moved to sit at `to`, out of range left alone.
    ///
    /// Bounds-checked rather than trusted: a reorder is driven by a gesture,
    /// and a gesture that ends off the end of the strip is ordinary.
    internal func moved(from: Int, to: Int) -> [InventoryDraftPhoto] {
        guard indices.contains(from), to >= 0, to <= count, from != to else { return self }
        var moved = self
        let photo = moved.remove(at: from)
        moved.insert(photo, at: to > from ? to - 1 : to)
        return moved
    }

    internal func removing(id: String) -> [InventoryDraftPhoto] {
        filter { $0.id != id }
    }

    internal var progress: InventoryPhotoProgress {
        guard !isEmpty else { return .none }
        let done = filter { $0.upload == .uploaded }.count
        let failure = compactMap { photo -> String? in
            guard case .failed(let reason) = photo.upload else { return nil }
            return reason
        }.first
        if let failure { return .failed(done: done, total: count, reason: failure) }
        if done == count { return .complete(count) }
        if allSatisfy({ $0.upload == .staged }) { return .staged(count) }
        return .partial(done: done, total: count)
    }
}

/// An identifier somebody else assigned, and what they call it.
///
/// A pair rather than a string, because "SN-4471" alone is a number nobody can
/// look up. Several are allowed: a laptop has a serial and a model, and they
/// are not interchangeable.
internal struct InventoryExternalIdentifier: Identifiable, Equatable {
    internal let id: String
    internal var label: String
    internal var value: String

    /// The labels the picker offers. A closed list, so two people recording
    /// the same fact write the same word.
    internal static let labels = ["Serial", "Model", "Barcode", "Licence"]

    internal var isComplete: Bool {
        !value.trimmingCharacters(in: .whitespaces).isEmpty
    }
}
