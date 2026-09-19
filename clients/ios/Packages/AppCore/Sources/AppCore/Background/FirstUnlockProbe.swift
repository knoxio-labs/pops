import Foundation

/// Whether the phone has been unlocked since it started, which is when data
/// protected `completeUntilFirstUserAuthentication` (the Inventory replica,
/// the paired device) becomes readable.
///
/// There is no system call for it, so this reads a small marker file under
/// that same protection. The app writes the marker whenever it is in the
/// foreground, which is always after an unlock; before the first unlock
/// after a restart the read fails. A missing marker (the app was never
/// opened) reads as locked, which only costs a refresh nobody could need.
public struct FirstUnlockProbe: Sendable {
    private let marker: URL

    /// - Parameter directory: Where the marker lives, normally Application
    ///   Support.
    public init(directory: URL) {
        marker = directory.appendingPathComponent(".unlocked-since-boot", isDirectory: false)
    }

    /// Writes the marker. Call it while the app is in the foreground.
    public func markUnlocked() throws {
        try FileManager.default.createDirectory(
            at: marker.deletingLastPathComponent(), withIntermediateDirectories: true)
        #if os(iOS)
            try Data([1]).write(
                to: marker, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
        #else
            try Data([1]).write(to: marker, options: .atomic)
        #endif
    }

    /// Whether the marker can be read now.
    public var isUnlockedSinceBoot: Bool {
        (try? Data(contentsOf: marker)) != nil
    }
}
