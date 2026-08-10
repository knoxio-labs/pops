import AppCore
import Foundation

/// Where the device's own identity is remembered between launches.
///
/// The two things in ``PairedDevice`` are the only parts of a session that a
/// cold launch cannot obtain any other way. The device id names this handset to
/// the BFM; the base URL is where the BFM *is*, and it arrives with the pairing
/// code rather than being compiled in — a Release build names no host, so a
/// process that has forgotten this has no way to ask anybody anything.
///
/// Separate from ``TokenStore`` because it is separate material with a
/// different reason to exist, and joined to it by ``DeviceCredentialStore``,
/// which is what makes a wipe cover both.
public protocol PairedDeviceStore: Sendable {
    /// The device this app is paired as, or `nil` when it is not paired.
    func load() throws -> PairedDevice?

    /// Replaces what is stored. Called once, at the end of pairing.
    func save(_ device: PairedDevice) throws

    /// Removes it. Idempotent, and total.
    func wipe() throws
}

/// Why a paired-device read or write failed.
public enum PairedDeviceStoreError: Error, Equatable {
    /// Something is stored and it is not a ``PairedDevice`` — a downgrade, a
    /// truncated write, a base URL that no longer parses. Treated as unpaired
    /// by callers rather than crashed on.
    case corruptedPayload
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
/// That leaves the token and the key behind in the Keychain after a reinstall,
/// which is inert: pairing wipes every credential before it creates anything,
/// so the first thing the fresh install does is remove them.
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

    public func load() throws -> PairedDevice? {
        guard let data = defaults.data(forKey: key) else { return nil }
        guard let stored = try? JSONDecoder().decode(StoredPairedDevice.self, from: data),
            let device = stored.device
        else {
            throw PairedDeviceStoreError.corruptedPayload
        }
        return device
    }

    public func save(_ device: PairedDevice) throws {
        guard let data = try? JSONEncoder().encode(StoredPairedDevice(device)) else {
            throw PairedDeviceStoreError.corruptedPayload
        }
        defaults.set(data, forKey: key)
    }

    public func wipe() throws {
        defaults.removeObject(forKey: key)
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
    let id: String
    let baseURL: String

    init(_ device: PairedDevice) {
        id = device.id
        baseURL = device.baseURL.absoluteString
    }

    var device: PairedDevice? {
        guard !id.isEmpty, let url = URL(string: baseURL), url.host() != nil else { return nil }
        return PairedDevice(id: id, baseURL: url)
    }
}
