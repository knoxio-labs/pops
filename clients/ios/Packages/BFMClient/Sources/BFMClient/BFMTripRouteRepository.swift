import AppCore
import OpenAPIRuntime

/// Reads the canonical mixed route through the paired BFM transport without adding source or mutation authority.
public struct BFMTripRouteRepository: TripsRouteReading {
    private let client: BFMHTTPClient

    /// Uses the app's existing authenticated transport and device identity.
    public init(client: BFMHTTPClient) { self.client = client }

    /// Preserves root order, alternatives, applied history and missing identities at the route's own revision.
    public func route(tripId: Int) async throws -> TripRouteSnapshot? {
        guard tripId > 0 else {
            throw RepositoryError.requestRejected
        }
        guard let output = try await response(tripId: tripId) else { return nil }
        return try snapshot(output, tripId: tripId)
    }

    private func response(tripId: Int) async throws -> Operations.MobileTrips_getRoute.Output? {
        do {
            return try await client.generated.mobileTrips_getRoute(path: .init(tripId: tripId))
        } catch let error as ClientError {
            if BFMRepositoryFailure.statusCode(in: error) == 404 {
                guard let upstream = (error.underlyingError as? BFMRuntimePopsError)?.upstream,
                    upstream.pillar == "trips", upstream.status == 404
                else { throw RepositoryError.contractMismatch }
                return nil
            }
            throw bfmReadFailure(error, operation: "mobileTrips.getRoute")
        }
    }

    private func snapshot(
        _ output: Operations.MobileTrips_getRoute.Output, tripId: Int
    ) throws -> TripRouteSnapshot? {
        switch output {
        case .ok(let ok):
            let value: TripRouteSnapshot = try tripDomain(try ok.body.json)
            guard value.tripId == tripId else {
                throw RepositoryError.contractMismatch
            }
            return value
        case .notFound(let value):
            let upstream = try value.body.json.details.upstream
            guard upstream.pillar == "trips", upstream.status == 404 else {
                throw RepositoryError.contractMismatch
            }
            return nil
        case .badRequest: throw RepositoryError.requestRejected
        case .unauthorized: throw RepositoryError.unauthorized
        case .forbidden(let value):
            throw BFMRepositoryFailure.forbiddenFailure(try value.body.json)
        case .tooManyRequests(let value):
            throw RepositoryError.rateLimited(
                retryAfterSeconds: try value.body.json.retryAfterSeconds)
        case .badGateway(let value):
            throw BFMRepositoryFailure.upstreamFailure(
                try value.body.json.code, operation: "mobileTrips.getRoute")
        case .serviceUnavailable(let value):
            throw BFMRepositoryFailure.upstreamFailure(
                try value.body.json.code, operation: "mobileTrips.getRoute")
        case .undocumented: throw RepositoryError.contractMismatch
        }
    }
}

extension Operations.MobileTrips_getRoute.Output.Forbidden.Body.JsonPayload: WireForbiddenBody {
    internal var capabilityNotGranted: String? {
        if case .case2(let denied) = self { denied.capability } else { nil }
    }
}
