import AppCore
import OpenAPIRuntime

/// Applies explicit Trip metadata changes through the generated PATCH operation and supported typed body override.
public struct BFMTripMetadataRepository: TripMetadataWriting {
    private let client: BFMHTTPClient

    /// Uses the existing pairing-bound client and device consent; it creates no transport or retry policy.
    public init(client: BFMHTTPClient) { self.client = client }

    /// Preserves omitted/null/value field states. A source mismatch or uncertain response never mutates a local record.
    public func updateTrip(id: Int, patch: TripMetadataPatch) async throws -> TripRecord? {
        guard id > 0 else { throw RepositoryError.requestRejected }
        let output: Operations.MobileTrips_updateTrip.Output
        do {
            output = try await client.generated.mobileTrips_updateTrip(
                path: .init(id: id), body: .json(BFMTripPatchBody(patch)))
        } catch let error as ClientError {
            if BFMRepositoryFailure.statusCode(in: error) == 404 {
                guard let upstream = (error.underlyingError as? BFMRuntimePopsError)?.upstream,
                    upstream.pillar == "trips", upstream.status == 404
                else { throw RepositoryError.contractMismatch }
                return nil
            }
            throw bfmReadFailure(error, operation: "mobileTrips.updateTrip")
        }
        return try Self.updatedTrip(output, id: id)
    }

    private static func updatedTrip(_ output: Operations.MobileTrips_updateTrip.Output, id: Int)
        throws -> TripRecord?
    {
        switch output {
        case .ok(let ok):
            let trip: TripRecord = try tripDomain(try ok.body.json)
            guard trip.id == id else { throw RepositoryError.contractMismatch }
            return trip
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
        case .conflict(let value): throw RepositoryError.conflict(try value.body.json.code)
        case .tooManyRequests(let value):
            throw RepositoryError.rateLimited(
                retryAfterSeconds: try value.body.json.retryAfterSeconds)
        case .badGateway(let value):
            throw BFMRepositoryFailure.upstreamFailure(
                try value.body.json.code, operation: "mobileTrips.updateTrip")
        case .serviceUnavailable(let value):
            throw BFMRepositoryFailure.upstreamFailure(
                try value.body.json.code, operation: "mobileTrips.updateTrip")
        case .undocumented: throw RepositoryError.contractMismatch
        }
    }
}
