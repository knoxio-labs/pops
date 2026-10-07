import AppCore
import Foundation

/// An identity and revision persisted as the active pairing snapshot.
public struct PairedDeviceSnapshot: Sendable, Equatable {
    /// Monotonic revision used to reject credentials produced by an older
    /// pairing or refresh operation.
    public let revision: UInt64

    /// The current identity, or `nil` when the persisted revision is a wipe
    /// tombstone.
    public let device: PairedDevice?

    /// Creates a persisted view of the active credential identity.
    public init(revision: UInt64, device: PairedDevice?) {
        self.revision = revision
        self.device = device.map {
            PairedDevice(id: $0.id, baseURL: $0.baseURL, credentialRevision: revision)
        }
    }
}

/// Where the device's own identity is remembered between launches.
///
/// The revision is part of the persisted snapshot so a delayed pairing or
/// refresh cannot replace credentials that became active after it started.
public protocol PairedDeviceStore: Sendable {
    /// Loads the active identity and revision, or `nil` before the first write.
    func loadSnapshot() throws -> PairedDeviceSnapshot?

    /// Replaces the stored snapshot as one persistence operation.
    func saveSnapshot(_ snapshot: PairedDeviceSnapshot) throws
}

extension PairedDeviceStore {
    /// The device this app is paired as, or `nil` when it is not paired.
    public func load() throws -> PairedDevice? {
        try loadSnapshot()?.device
    }

    /// Replaces the active device and advances its persisted revision.
    public func save(_ device: PairedDevice) throws {
        let revision = try nextRevision(after: loadSnapshot()?.revision ?? 0)
        try saveSnapshot(PairedDeviceSnapshot(revision: revision, device: device))
    }

    /// Persists a newer empty revision so in-flight work cannot restore a wiped
    /// identity after it completes.
    public func wipe() throws {
        let revision = try nextRevision(after: loadSnapshot()?.revision ?? 0)
        try saveSnapshot(PairedDeviceSnapshot(revision: revision, device: nil))
    }

    private func nextRevision(after revision: UInt64) throws -> UInt64 {
        let (next, overflow) = revision.addingReportingOverflow(1)
        guard !overflow else { throw PairedDeviceStoreError.revisionExhausted }
        return next
    }
}

/// Why a paired-device read or write failed.
public enum PairedDeviceStoreError: Error, Equatable {
    /// Something is stored and it is not a ``PairedDevice`` — a downgrade, a
    /// truncated write, a base URL that no longer parses. Treated as unpaired
    /// by callers rather than crashed on.
    case corruptedPayload

    /// The monotonic revision reached its maximum value.
    case revisionExhausted
}

/// `UserDefaults`-backed ``PairedDeviceStore``.
///
/// ## Why not the Keychain
///
/// Neither field is a secret. A device id is an opaque handle the BFM issues
/// and prints on its own operator screen, and a base URL is a hostname. Putting
/// them behind `kSecAttrAccessibleWhenUnlockedThisDeviceOnly` would buy no
/// confidentiality and would cost availability — nothing here can be read
/// before first unlock, which is a constraint worth accepting for a refresh
/// token and not for a hostname.
///
/// The second reason is the one that decides it. Keychain items **survive app
/// deletion**, so an identity kept there would outlive a reinstall and the app
/// would silently resume a session the person had just deleted. `UserDefaults`
/// goes with the app, so a reinstall reaches the pairing screen — which is what
/// somebody who deleted the app and installed it again is expecting.
///
/// That leaves the token and the key behind in the Keychain after a reinstall.
/// Pairing stages a replacement key and preserves the old identity until the
/// server accepts the code; a new install has no stored identity to resume.
public struct UserDefaultsPairedDeviceStore: PairedDeviceStore {
    private let suiteName: String?
    private let key: String

    /// - Parameters:
    ///   - suiteName: `nil` for the app's own defaults, which is what ships. A
    ///     test passes a suite of its own rather than writing into the one the
    ///     app reads.
    ///   - key: The defaults key holding the encoded device.
    public init(
        suiteName: String? = nil,
        key: String = "com.knoxiolabs.pops.auth.paired-device"
    ) {
        self.suiteName = suiteName
        self.key = key
    }

    /// Resolved per call rather than stored. `UserDefaults` is documented
    /// thread-safe but is not `Sendable`, and holding one would make this type
    /// unusable from the actor that owns the credentials — the alternative
    /// being a `nonisolated(unsafe)` that states the same fact without the
    /// compiler being able to check it. Suite lookup is cached by Foundation,
    /// so this costs a dictionary read.
    private var defaults: UserDefaults {
        suiteName.flatMap(UserDefaults.init(suiteName:)) ?? .standard
    }

    public func loadSnapshot() throws -> PairedDeviceSnapshot? {
        guard let data = defaults.data(forKey: key) else { return nil }
        guard let stored = try? JSONDecoder().decode(StoredPairedDevice.self, from: data),
            let snapshot = stored.snapshot
        else {
            throw PairedDeviceStoreError.corruptedPayload
        }
        return snapshot
    }

    public func saveSnapshot(_ snapshot: PairedDeviceSnapshot) throws {
        guard let data = try? JSONEncoder().encode(StoredPairedDevice(snapshot)) else {
            throw PairedDeviceStoreError.corruptedPayload
        }
        defaults.set(data, forKey: key)
    }
}

/// ``PairedDevice`` on its way to disk.
///
/// Hand-written rather than a `Codable` conformance on the domain type, so the
/// stored shape is this file's to change and `AppCore` stays a package with no
/// opinion about persistence. The URL is held as a string because a `URL` that
/// no longer parses has to be readable as corruption rather than as a decode
/// failure indistinguishable from a truncated file.
private struct StoredPairedDevice: Codable {
    let id: String?
    let baseURL: String?
    let revision: UInt64?

    init(_ snapshot: PairedDeviceSnapshot) {
        id = snapshot.device?.id
        baseURL = snapshot.device?.baseURL.absoluteString
        revision = snapshot.revision
    }

    var snapshot: PairedDeviceSnapshot? {
        let revision = revision ?? 0
        switch (id, baseURL) {
        case (nil, nil):
            return PairedDeviceSnapshot(revision: revision, device: nil)
        case (.some(let id), .some(let baseURL)):
            guard !id.isEmpty, let url = URL(string: baseURL), url.host() != nil else {
                return nil
            }
            return PairedDeviceSnapshot(
                revision: revision, device: PairedDevice(id: id, baseURL: url))
        default:
            return nil
        }
    }
}
