import AppCore
import Foundation
import HTTPTypes
import Testing

@testable import BFMClient

/// The app's first authenticated call, and the reason the phone holds no list
/// of what the federation contains.
@Suite("BFMBootstrapService")
internal struct BootstrapTests {
    private static let healthy = """
        {"device":{"id":"device-7","name":"Joao's iPhone","lastSeenAt":"2026-08-10T09:15:00Z"},\
        "registry":{"source":"fresh"},\
        "pillars":[{"id":"finance","reachability":"healthy"}],\
        "features":[{"id":"transactions","reachability":"healthy"}]}
        """

    private func service(_ transport: StubTransport) throws -> BFMBootstrapService {
        BFMBootstrapService(
            client: BFMHTTPClient(
                baseURL: try #require(URL(string: "https://bfm.example")),
                transport: transport
            )
        )
    }

    private func snapshot(_ json: String) async throws -> BootstrapSnapshot {
        try await service(StubTransport(status: .ok, json: json)).bootstrap()
    }

    /// The same response as ``healthy``, with the timestamp spelled the way the
    /// BFM actually spells it.
    ///
    /// `device.lastSeenAt` is a `Date().toISOString()`, so it carries
    /// milliseconds — and every fixture in this suite was written without them,
    /// which is why nothing here noticed that the generated client's default
    /// date decoding refused the real thing. The app answered by falling back
    /// to its compiled feature list under a "could not be reached" banner, on a
    /// federation that was healthy. Caught by the Maestro flow's first run
    /// against a real pillar (POPS-1698).
    private static let healthyWithMilliseconds = """
        {"device":{"id":"device-7","name":"Joao's iPhone","lastSeenAt":"2026-08-10T09:15:00.123Z"},\
        "registry":{"source":"fresh"},\
        "pillars":[{"id":"finance","reachability":"healthy"}],\
        "features":[{"id":"transactions","reachability":"healthy"}]}
        """

    @Test("decodes the millisecond timestamp a real BFM sends")
    func decodesFractionalSeconds() async throws {
        let snapshot = try await snapshot(Self.healthyWithMilliseconds)

        let expected = try Date(
            "2026-08-10T09:15:00.123Z",
            strategy: Date.ISO8601FormatStyle(includingFractionalSeconds: true)
        )

        #expect(snapshot.device.lastSeenAt == expected)
        #expect(snapshot.registrySource == .fresh)
    }

    @Test("the response becomes the app's own vocabulary")
    func mapsTheResponse() async throws {
        let snapshot = try await snapshot(Self.healthy)

        #expect(snapshot.device.id == "device-7")
        #expect(snapshot.device.name == "Joao's iPhone")
        #expect(
            snapshot.device.lastSeenAt == (try Date("2026-08-10T09:15:00Z", strategy: .iso8601))
        )
        #expect(snapshot.registrySource == .fresh)
        #expect(
            snapshot.features == [FeatureAvailability(id: .transactions, reachability: .healthy)])
    }

    @Test("the call goes to GET /mobile/bootstrap")
    func requestTargetsTheContractsPath() async throws {
        let transport = StubTransport(status: .ok, json: Self.healthy)
        _ = try await service(transport).bootstrap()

        let sent = try #require(await transport.recorded.all.first)
        #expect(sent.request.method == .get)
        #expect(sent.request.path == "/mobile/bootstrap")
        #expect(sent.operationID == "mobile.bootstrap")
    }

    /// The distinction the BFM keeps deliberately. Collapsed into a boolean it
    /// would throw away the only useful information on the one occasion this
    /// endpoint earns its keep.
    @Test(
        "every reachability state reaches the app as itself",
        arguments: [
            ("healthy", FeatureReachability.healthy),
            ("degraded", FeatureReachability.degraded),
            ("unavailable", FeatureReachability.unavailable),
            ("contract-mismatch", FeatureReachability.contractMismatch),
        ]
    )
    func reachabilityIsCarried(wire: String, expected: FeatureReachability) async throws {
        let json = """
            {"device":{"id":"d","name":"n","lastSeenAt":"2026-08-10T09:15:00Z"},\
            "registry":{"source":"fresh"},"pillars":[],\
            "features":[{"id":"transactions","reachability":"\(wire)"}]}
            """

        #expect(try await snapshot(json).features.first?.reachability == expected)
    }

    @Test(
        "every registry source reaches the app as itself",
        arguments: [
            ("fresh", RegistrySource.fresh), ("cached", .cached),
            ("stale-fallback", .staleFallback), ("unavailable", .unavailable),
        ]
    )
    func registrySourceIsCarried(wire: String, expected: RegistrySource) async throws {
        let json = """
            {"device":{"id":"d","name":"n","lastSeenAt":"2026-08-10T09:15:00Z"},\
            "registry":{"source":"\(wire)"},"pillars":[],"features":[]}
            """

        #expect(try await snapshot(json).registrySource == expected)
    }

    /// The registry blinking is a degradation the app is told about, not a
    /// failure it stops on. The BFM already promises not to `500` here; this
    /// asserts the client does not turn the answer into one either.
    @Test("a BFM answering from no registry at all is still an answer")
    func registryUnavailableIsNotAFailure() async throws {
        let json = """
            {"device":{"id":"d","name":"n","lastSeenAt":"2026-08-10T09:15:00Z"},\
            "registry":{"source":"unavailable"},"pillars":[],"features":[]}
            """

        let snapshot = try await snapshot(json)

        #expect(snapshot.registrySource == .unavailable)
        #expect(snapshot.features.isEmpty)
    }

    @Test("a rejected token and a revoked device both end the session")
    func credentialFailures() async {
        await #expect(throws: RepositoryError.unauthorized) {
            try await service(
                StubTransport(
                    status: .unauthorized, json: #"{"code":"invalid_token","message":"x"}"#)
            ).bootstrap()
        }
        await #expect(throws: RepositoryError.unauthorized) {
            try await service(
                StubTransport(status: .forbidden, json: #"{"code":"device_revoked","message":"x"}"#)
            ).bootstrap()
        }
    }

    @Test("a status the contract does not document is never mistaken for an answer")
    func undocumentedStatus() async {
        let thrown = await #expect(throws: RepositoryError.self) {
            try await service(StubTransport(status: .init(code: 418), json: "{}")).bootstrap()
        }

        guard case .transport = thrown else {
            Issue.record("expected a transport failure, got \(String(describing: thrown))")
            return
        }
    }

    /// A gateway in front of the BFM answering for it. `unavailable` rather
    /// than a transport diagnostic, because "the BFM is not answering" is the
    /// fact the launch path acts on.
    @Test("a gateway answering for the BFM reads as unavailable")
    func gatewayFailure() async {
        await #expect(throws: RepositoryError.unavailable) {
            try await service(StubTransport(status: .badGateway, json: "<html>bad</html>"))
                .bootstrap()
        }
    }

    @Test("a call that never completed carries the failure and none of the request")
    func transportFailure() async throws {
        struct Dead: Error {}
        let transport = StubTransport { _, _ in throw Dead() }

        let thrown = await #expect(throws: RepositoryError.self) {
            try await service(transport).bootstrap()
        }

        guard case .transport(let diagnostic) = try #require(thrown) else {
            Issue.record("expected a transport failure, got \(String(describing: thrown))")
            return
        }
        #expect(diagnostic.contains("mobile.bootstrap"))
    }
}
