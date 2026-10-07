import AuthTestSupport
import Foundation
import Synchronization
import Testing

@testable import Auth

private final class BlockingTokenStore: TokenStore {
    private let wrapped = InMemoryTokenStore()
    private let firstSave = Mutex(true)
    private let saveStarted = DispatchSemaphore(value: 0)
    private let saveCanContinue = DispatchSemaphore(value: 0)
    private let wipeAttempted = DispatchSemaphore(value: 0)
    private let wipeStarted = DispatchSemaphore(value: 0)
    private let wipeFinished = DispatchSemaphore(value: 0)

    func load() throws -> DeviceTokens? { try wrapped.load() }

    func save(_ tokens: DeviceTokens) throws {
        let shouldBlock = firstSave.withLock { isFirstSave in
            defer { isFirstSave = false }
            return isFirstSave
        }
        if shouldBlock {
            saveStarted.signal()
            saveCanContinue.wait()
        }
        try wrapped.save(tokens)
    }

    func wipe() throws {
        wipeStarted.signal()
        try wrapped.wipe()
        wipeFinished.signal()
    }

    func waitUntilSaveStarted() -> Bool {
        saveStarted.wait(timeout: .now() + .seconds(5)) == .success
    }
    func continueSave() { saveCanContinue.signal() }
    func signalWipeAttempt() { wipeAttempted.signal() }
    func waitUntilWipeAttempted() -> Bool {
        wipeAttempted.wait(timeout: .now() + .seconds(5)) == .success
    }
    func waitUntilWipeStarted() -> Bool {
        wipeStarted.wait(timeout: .now() + .milliseconds(500)) == .success
    }
    func waitUntilWipeFinished() -> Bool {
        wipeFinished.wait(timeout: .now() + .seconds(5)) == .success
    }
}

private final class ThreadOperation: Sendable {
    private let completed = DispatchSemaphore(value: 0)
    private let failure = Mutex<String?>(nil)

    init(_ operation: @escaping @Sendable () throws -> Void) {
        Thread.detachNewThread { [self] in
            defer { completed.signal() }
            do {
                try operation()
            } catch {
                failure.withLock { $0 = String(describing: error) }
            }
        }
    }

    func wait() -> (finished: Bool, failure: String?) {
        let finished = completed.wait(timeout: .now() + .seconds(10)) == .success
        return (finished, failure.withLock { $0 })
    }
}

private struct CredentialWrapperRace: Sendable {
    let keyStore = InMemoryKeyStore()
    let tokenStore = BlockingTokenStore()
    let deviceStore = InMemoryPairedDeviceStore()
    let pairingStore: DeviceCredentialStore
    let wipeStore: DeviceCredentialStore
    let candidate: DeviceKeyCandidate

    init() throws {
        pairingStore = DeviceCredentialStore(
            keyStore: keyStore,
            tokenStore: tokenStore,
            pairedDeviceStore: deviceStore
        )
        wipeStore = DeviceCredentialStore(
            keyStore: keyStore,
            tokenStore: tokenStore,
            pairedDeviceStore: deviceStore
        )
        candidate = try pairingStore.createPairingCandidate(expectedRevision: 0)
    }

    static func tokens() -> DeviceTokens {
        DeviceTokens(
            accessToken: "access",
            refreshToken: "refresh",
            accessTokenExpiresAt: Date(timeIntervalSince1970: 1_786_000_000)
        )
    }

    func beginPairing() -> ThreadOperation {
        ThreadOperation {
            _ = try pairingStore.commitPairing(
                candidate: candidate,
                tokens: Self.tokens(),
                device: .fake(id: "paired-before-wipe"),
                expectedRevision: 0
            )
        }
    }

    func beginWipe() -> ThreadOperation {
        ThreadOperation {
            tokenStore.signalWipeAttempt()
            try wipeStore.wipe()
        }
    }
}

@Suite("credential wrapper concurrency")
internal struct DeviceCredentialStoreConcurrencyTests {
    @Test("separate credential wrappers serialize pairing and wipe")
    func separateWrappersSerializePairingAndWipe() async throws {
        let race = try CredentialWrapperRace()
        let pairingTask = race.beginPairing()
        let saveStarted = race.tokenStore.waitUntilSaveStarted()
        let wipeTask = race.beginWipe()
        let wipeAttempted = race.tokenStore.waitUntilWipeAttempted()
        let wipeEnteredStore = race.tokenStore.waitUntilWipeStarted()
        let wipeFinished = !wipeEnteredStore || race.tokenStore.waitUntilWipeFinished()
        race.tokenStore.continueSave()
        let pairingResult = pairingTask.wait()
        let wipeResult = wipeTask.wait()

        #expect(saveStarted)
        #expect(wipeAttempted)
        #expect(wipeFinished)
        #expect(!wipeEnteredStore)
        #expect(pairingResult.finished)
        #expect(pairingResult.failure == nil)
        #expect(wipeResult.finished)
        #expect(wipeResult.failure == nil)
        #expect(try race.tokenStore.load() == nil)
        #expect(try race.keyStore.publicKey() == nil)
        #expect(try race.deviceStore.loadSnapshot()?.device == nil)
        #expect(try race.deviceStore.loadSnapshot()?.revision == 2)
    }
}
