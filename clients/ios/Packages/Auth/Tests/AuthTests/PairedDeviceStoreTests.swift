import AppCore
import AppCoreFakes
import Foundation
import Testing

@testable import Auth

/// The real store, against real `UserDefaults` in a suite of its own.
///
/// Not a fake, because everything worth asserting here is about an encoding
/// surviving a round trip through storage — which is exactly what a fake
/// replaces with a dictionary.
///
/// A `final class` rather than a `struct` so `deinit` can remove the suite.
/// Swift Testing builds one instance per test, so each gets a suite nothing
/// else has written to and none of them leaks into the defaults the host
/// process reads.
@Suite("UserDefaultsPairedDeviceStore")
internal final class PairedDeviceStoreTests {
    private static let key = "com.knoxiolabs.pops.auth.paired-device"

    private let suiteName = "pops.tests.\(UUID().uuidString)"
    private let store: UserDefaultsPairedDeviceStore
    private let defaults: UserDefaults

    internal init() throws {
        store = UserDefaultsPairedDeviceStore(suiteName: suiteName)
        defaults = try #require(UserDefaults(suiteName: suiteName))
    }

    deinit {
        UserDefaults().removePersistentDomain(forName: suiteName)
    }

    @Test("a device survives being written and read back")
    func roundTrip() throws {
        let device = PairedDevice(
            id: "device-7",
            baseURL: try #require(URL(string: "https://pops-bfm.example.dev/bfm-api/"))
        )

        try store.save(device)

        #expect(try store.load() == device)
    }

    @Test("nothing stored is not paired, and is not an error")
    func emptyStore() throws {
        #expect(try store.load() == nil)
    }

    @Test("a later pairing replaces the earlier one rather than accumulating")
    func saveReplaces() throws {
        try store.save(.fake(id: "first"))
        try store.save(.fake(id: "second"))

        #expect(try store.load()?.id == "second")
    }

    @Test("a wipe leaves nothing, and wiping nothing succeeds")
    func wipeIsTotalAndIdempotent() throws {
        try store.save(.fake())

        try store.wipe()
        try store.wipe()

        #expect(try store.load() == nil)
    }

    /// A downgrade, a truncated write, or a build that changed the stored
    /// shape. It has to be distinguishable from "not paired", because the two
    /// call for the same screen but not for the same diagnosis — and because a
    /// crash here would be a crash on the launch path.
    @Test("a payload this build cannot read is corruption, not absence")
    func corruptPayload() {
        defaults.set(Data("not json".utf8), forKey: Self.key)

        #expect(throws: PairedDeviceStoreError.corruptedPayload) {
            _ = try store.load()
        }
    }

    /// The base URL is the one field that can decode successfully and still be
    /// useless. A relative string is a `URL` as far as `URL(string:)` is
    /// concerned, and would reach the transport as a request to nowhere.
    @Test(
        "a stored base URL that names no host is corruption",
        arguments: ["", "not a url", "/bfm-api", "mailto:someone@example.com"]
    )
    func unusableBaseURL(raw: String) {
        defaults.set(Data(#"{"id":"device-1","baseURL":"\#(raw)"}"#.utf8), forKey: Self.key)

        #expect(throws: PairedDeviceStoreError.corruptedPayload) {
            _ = try store.load()
        }
    }

    @Test("a stored device with no id is corruption")
    func emptyIdentifier() {
        defaults.set(Data(#"{"id":"","baseURL":"https://bfm.invalid"}"#.utf8), forKey: Self.key)

        #expect(throws: PairedDeviceStoreError.corruptedPayload) {
            _ = try store.load()
        }
    }
}
