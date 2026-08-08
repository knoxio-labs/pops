import Foundation

#if canImport(UIKit)
    import UIKit
#endif

/// What the handset can say about itself, for the two fields
/// `POST /devices/pair` requires.
///
/// A seam because both values are read from the running device and neither can
/// be arranged from a test, and because the simulator answers one of them
/// wrongly (see ``SystemDeviceDescription``).
public protocol DeviceDescribing: Sendable {
    /// The label to put in the name field before the person edits it.
    ///
    /// A *suggestion*, not an identity. Since iOS 16 `UIDevice.current.name`
    /// returns the generic model name — every handset is "iPhone" — unless the
    /// app holds an entitlement Apple grants by application. That is why the
    /// pairing screen offers an editable field instead of sending this
    /// silently: three devices all called "iPhone" make the operator's revoke
    /// screen a guess.
    var suggestedName: String { get }

    /// Hardware identifier as the handset reports it, e.g. `iPhone17,1`.
    var modelIdentifier: String { get }
}

/// The real one.
public struct SystemDeviceDescription: DeviceDescribing {
    public init() {}

    public var suggestedName: String {
        #if canImport(UIKit)
            return UIDevice.current.name
        #else
            // The host toolchain, where this package is compiled so its logic
            // can be tested without a simulator. Never shipped.
            return ProcessInfo.processInfo.hostName
        #endif
    }

    public var modelIdentifier: String {
        // A simulator's `hw.machine` is the *Mac's* architecture — `arm64` —
        // which would land in the operator's device list as the model of every
        // simulator ever paired. The simulator publishes the device it is
        // pretending to be in its environment instead, so that is preferred
        // when it is there. On hardware the variable is absent and `hw.machine`
        // is the answer.
        if let simulated = ProcessInfo.processInfo.environment["SIMULATOR_MODEL_IDENTIFIER"],
            !simulated.isEmpty
        {
            return simulated
        }
        return Self.sysctlString(named: "hw.machine") ?? "unknown"
    }

    /// `sysctlbyname` in two passes: the first asks how many bytes, the second
    /// fills them. Sized from the first call rather than from a fixed buffer,
    /// because a value longer than the guess would otherwise come back
    /// truncated and still look like a model identifier.
    private static func sysctlString(named name: String) -> String? {
        var size = 0
        guard sysctlbyname(name, nil, &size, nil, 0) == 0, size > 0 else { return nil }

        var buffer = [UInt8](repeating: 0, count: size)
        guard sysctlbyname(name, &buffer, &size, nil, 0) == 0 else { return nil }

        // `sysctl` reports a NUL-terminated string and counts the terminator in
        // `size`, so the bytes are truncated at it rather than decoded whole —
        // a trailing `\0` inside a Swift `String` survives all the way to the
        // JSON body. The failable initialiser rather than `String(decoding:as:)`:
        // bytes that are not UTF-8 are not a model identifier, and substituting
        // replacement characters would send that through as one.
        guard let value = String(bytes: buffer.prefix { $0 != 0 }, encoding: .utf8),
            !value.isEmpty
        else { return nil }
        return value
    }
}
