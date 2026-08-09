import AppCore
import Auth
import BFMClient
import Foundation
import HTTPTypes
import OpenAPIRuntime
import Synchronization

/// A scripted sequence of outcomes whose final entry repeats.
///
/// Repeating rather than trapping on exhaustion is what lets a test say "every
/// refresh from here on fails" in one line, and — more importantly for this
/// suite — it means a test asserting that something happened *once* cannot pass
/// merely because the double ran out of answers.
internal struct Script<Value: Sendable>: Sendable {
    private var outcomes: [Result<Value, any Error>]
    private var index = 0

    internal init(_ outcomes: [Result<Value, any Error>]) {
        precondition(!outcomes.isEmpty, "a script needs at least one outcome")
        self.outcomes = outcomes
    }

    internal mutating func next() -> Result<Value, any Error> {
        defer { index = min(index + 1, outcomes.count - 1) }
        return outcomes[index]
    }
}

/// A ``DeviceRefreshExchange`` that answers from a script, counts what it was
/// asked, and can be made to park mid-call.
///
/// `Mutex` rather than an actor so a synchronous assertion can read the counts
/// after the fact — and because making the double an actor would add a second
/// serialisation point to a suite whose whole subject is the first one.
internal final class ScriptedRefreshExchange: DeviceRefreshExchange {
    internal struct Spend: Sendable, Equatable {
        internal let refreshToken: String
        internal let nonce: String
        internal let signatureBase64: String
    }

    private let challengeScript: Mutex<Script<RefreshChallenge>>
    private let refreshScript: Mutex<Script<RefreshedSession>>
    private let recordedChallenges = Mutex<Int>(0)
    private let recordedSpends = Mutex<[Spend]>([])
    private let beforeRefresh: @Sendable () async -> Void

    internal init(
        challenges: [Result<RefreshChallenge, any Error>] = [.success(.stub())],
        refreshes: [Result<RefreshedSession, any Error>] = [.success(.stub())],
        beforeRefresh: @escaping @Sendable () async -> Void = {}
    ) {
        challengeScript = Mutex(Script(challenges))
        refreshScript = Mutex(Script(refreshes))
        self.beforeRefresh = beforeRefresh
    }

    internal var challengeCount: Int { recordedChallenges.withLock { $0 } }
    internal var spends: [Spend] { recordedSpends.withLock { $0 } }

    internal func challenge() async throws -> RefreshChallenge {
        recordedChallenges.withLock { $0 += 1 }
        return try challengeScript.withLock { $0.next() }.get()
    }

    internal func refresh(
        refreshToken: String,
        nonce: String,
        signatureBase64: String
    ) async throws -> RefreshedSession {
        await beforeRefresh()
        recordedSpends.withLock {
            $0.append(
                Spend(
                    refreshToken: refreshToken,
                    nonce: nonce,
                    signatureBase64: signatureBase64
                )
            )
        }
        return try refreshScript.withLock { $0.next() }.get()
    }
}

/// Records what the session was told, in order.
internal final class RecordingSessionEvents: SessionEventSink {
    private let recorded = Mutex<[SessionEvent]>([])

    internal var events: [SessionEvent] { recorded.withLock { $0 } }

    internal func send(_ event: SessionEvent) async {
        recorded.withLock { $0.append(event) }
    }
}

extension RefreshChallenge {
    internal static func stub(nonce: String = "nonce-1", expiresInSeconds: Int = 60)
        -> RefreshChallenge
    {
        RefreshChallenge(nonce: nonce, expiresInSeconds: expiresInSeconds)
    }
}

extension RefreshedSession {
    internal static func stub(
        accessToken: String = "access-2",
        refreshToken: String = "refresh-2",
        expiresInSeconds: Int = 900
    ) -> RefreshedSession {
        RefreshedSession(
            accessToken: accessToken,
            refreshToken: refreshToken,
            expiresInSeconds: expiresInSeconds
        )
    }
}

extension DeviceTokens {
    internal static func stub(
        accessToken: String = "access-1",
        refreshToken: String = "refresh-1",
        expiresAt: Date = Date(timeIntervalSince1970: 1_700_000_900)
    ) -> DeviceTokens {
        DeviceTokens(
            accessToken: accessToken,
            refreshToken: refreshToken,
            accessTokenExpiresAt: expiresAt
        )
    }
}

extension HTTPRequest {
    /// A request on the surface the middleware authenticates.
    internal static func mobile(_ path: String = "/mobile/bootstrap") -> HTTPRequest {
        HTTPRequest(method: .get, scheme: nil, authority: nil, path: path)
    }
}
