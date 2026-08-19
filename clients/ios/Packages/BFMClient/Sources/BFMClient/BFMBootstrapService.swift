import AppCore
import OpenAPIRuntime

/// `GET /mobile/bootstrap`: what the BFM says this app should show.
///
/// The app's first authenticated call, and the one that keeps the phone from
/// ever holding a list of what the federation contains. It asks.
///
/// Carries no credential of its own — the client handed in is expected to have
/// the middleware that attaches one, exactly as ``BFMTransactionsRepository``
/// does.
public struct BFMBootstrapService: BootstrapService {
    private let client: BFMHTTPClient

    public init(client: BFMHTTPClient) {
        self.client = client
    }

    /// - Throws: ``RepositoryError``. `unauthorized` for a rejected token or a
    ///   revoked device, `unavailable` for a BFM that did not answer, and
    ///   `transport` for anything else. Nothing here throws
    ///   `contractMismatch`: the response is either readable or it is not, and
    ///   a body the generated client could not decode arrives as a
    ///   `ClientError` on a status that already says what happened.
    public func bootstrap() async throws -> BootstrapSnapshot {
        let output: Bootstrap.Output
        do {
            output = try await client.generated.mobile_bootstrap()
        } catch let error as ClientError {
            throw Self.failure(error)
        }

        return try Self.snapshot(of: output)
    }
}

extension BFMBootstrapService {
    /// - Note: `try …body.json` sits outside the `do`/`catch` above, for the
    ///   reason ``BFMClientError`` states.
    private static func snapshot(of output: Bootstrap.Output) throws -> BootstrapSnapshot {
        switch output {
        case .ok(let ok):
            return snapshot(of: try ok.body.json)
        case .unauthorized, .forbidden:
            throw RepositoryError.unauthorized
        case .tooManyRequests:
            throw RepositoryError.transport("\(Bootstrap.id): rate limited")
        case .undocumented(let statusCode, _):
            // The contract documents no gateway status for this route, so a
            // `502` from something in front of the BFM lands here rather than
            // in `failure(_:)`. It still means the BFM did not answer.
            throw gateway(statusCode)
                ?? .transport("\(Bootstrap.id): undocumented status \(statusCode)")
        }
    }

    /// Whether a status means the BFM itself is not answering, as opposed to
    /// answering something this build did not expect.
    private static func gateway(_ statusCode: Int?) -> RepositoryError? {
        statusCode == 502 || statusCode == 503 ? .unavailable : nil
    }

    /// Every enum the generator closed is reopened here, as a raw value.
    ///
    /// The feature id is already an open string on the wire — a build already
    /// on a handset must decode a feature id it has never heard of rather than
    /// fail the whole payload, so the contract never closes that field into an
    /// enum in the first place. Reachability states are closed today, so the
    /// generator emits a Swift enum for them, and a build compiled against
    /// today's contract is on a phone that will still be running it after the
    /// BFM has added a third state. `MobileFeature` and `FeatureReachability`
    /// are raw-value wrappers so an unrecognised value arrives intact and is
    /// skipped by whatever maps ids to screens, rather than deciding what the
    /// whole app shows.
    ///
    /// The response's `pillars` list is read and discarded. It is the
    /// federation's own observability and nothing on a phone screen is derived
    /// from it; carrying it into `AppCore` would be a field that exists to be
    /// looked at in a debugger.
    private static func snapshot(of payload: BootstrapPayload) -> BootstrapSnapshot {
        BootstrapSnapshot(
            device: BootstrapDevice(
                id: payload.device.id,
                name: payload.device.name,
                lastSeenAt: payload.device.lastSeenAt
            ),
            registrySource: RegistrySource(rawValue: payload.registry.source.rawValue),
            features: payload.features.map {
                FeatureAvailability(
                    id: MobileFeature(rawValue: $0.id),
                    reachability: FeatureReachability(rawValue: $0.reachability.rawValue)
                )
            }
        )
    }

    /// A call that did not complete, or one whose body this build could not
    /// read on a status the contract documents — the HTML error page an
    /// intermediary returns never reaches the switch above, because the
    /// generated deserializer decodes eagerly. The status is the actionable
    /// half and it survives.
    ///
    /// Everything else — including the dead network — is a transport failure,
    /// whose diagnostic goes through ``BFMClientError``'s sanitiser so no
    /// request header reaches it.
    private static func failure(_ error: ClientError) -> RepositoryError {
        let status = error.response?.status.code
        if status == 401 || status == 403 { return .unauthorized }
        if let gateway = gateway(status) { return gateway }

        return .transport(
            BFMClientError.transportFailure(error, operation: Bootstrap.id).description
        )
    }
}

/// The generated names, shortened. Written out in full they pass 120 columns,
/// and the types are `internal` to this module — nothing here widens what a
/// caller can name.
private typealias Bootstrap = Operations.Mobile_bootstrap
private typealias BootstrapPayload = Bootstrap.Output.Ok.Body.JsonPayload
