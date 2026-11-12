import AppCore
import Foundation
import OpenAPIRuntime

/// Canonical capture reads and device-authorized writes through the existing authenticated transport.
public struct BFMTripCapturesRepository: TripCapturesReading, TripCapturesWriting {
    private let client: BFMHTTPClient
    /// Uses the paired device's client; no separate host, credential or retry engine is created.
    public init(client: BFMHTTPClient) { self.client = client }

    /// Retains canonical source identities; unavailability never becomes an empty successful read.
    public func captures(tripID: Int) async throws -> TripCaptureWorkspace {
        let output: Operations.MobileTripCaptures_workspace.Output
        do {
            output = try await client.generated.mobileTripCaptures_workspace(
                path: .init(tripId: tripID))
        } catch let error as ClientError {
            throw bfmReadFailure(error, operation: "mobileTripCaptures.workspace")
        }
        switch output {
        case .ok(let ok):
            let value: TripCaptureWorkspace = try captureDomain(try ok.body.json)
            guard validCaptures(value.captures, tripID: tripID) else {
                throw RepositoryError.contractMismatch
            }
            return value
        case .badRequest, .notFound: throw RepositoryError.requestRejected
        case .unauthorized: throw RepositoryError.unauthorized
        case .forbidden(let value): throw try captureForbidden(try value.body.json)
        case .conflict(let value): throw RepositoryError.conflict(try value.body.json.code)
        case .tooManyRequests(let value):
            throw RepositoryError.rateLimited(
                retryAfterSeconds: try value.body.json.retryAfterSeconds)
        case .badGateway(let value):
            throw BFMRepositoryFailure.upstreamFailure(
                try value.body.json.code, operation: "mobileTripCaptures.workspace")
        case .serviceUnavailable(let value):
            throw BFMRepositoryFailure.upstreamFailure(
                try value.body.json.code, operation: "mobileTripCaptures.workspace")
        case .undocumented: throw RepositoryError.contractMismatch
        }
    }

    /// Sends the supplied UUID unchanged. Neither transport failures nor an expired token create a new operation.
    public func createCapture(tripID: Int, operation: TripCaptureCreateOperation) async throws
        -> TripCaptureOperationResult
    {
        let output: Operations.MobileTripCaptures_create.Output
        do {
            output = try await client.generated.mobileTripCaptures_create(
                path: .init(tripId: tripID), body: .json(try captureDomain(operation)))
        } catch let error as ClientError {
            throw bfmReadFailure(error, operation: "mobileTripCaptures.create")
        }
        switch output {
        case .ok(let ok):
            let value: TripCaptureOperationResult = try captureDomain(try ok.body.json)
            guard value.receipt.operationId == operation.operationId,
                validCaptures(value.receipt.captures, tripID: tripID),
                validCaptures(value.current.captures, tripID: tripID)
            else { throw RepositoryError.contractMismatch }
            return value
        case .badRequest, .notFound: throw RepositoryError.requestRejected
        case .unauthorized: throw RepositoryError.unauthorized
        case .forbidden(let value): throw try captureForbidden(try value.body.json)
        case .conflict(let value): throw RepositoryError.conflict(try value.body.json.code)
        case .tooManyRequests(let value):
            throw RepositoryError.rateLimited(
                retryAfterSeconds: try value.body.json.retryAfterSeconds)
        case .badGateway(let value):
            throw BFMRepositoryFailure.upstreamFailure(
                try value.body.json.code, operation: "mobileTripCaptures.create")
        case .serviceUnavailable(let value):
            throw BFMRepositoryFailure.upstreamFailure(
                try value.body.json.code, operation: "mobileTripCaptures.create")
        case .undocumented: throw RepositoryError.contractMismatch
        }
    }
}

private func validCaptures(_ captures: [TripCaptureRecord], tripID: Int) -> Bool {
    captures.allSatisfy { $0.id > 0 && $0.revision > 0 && $0.tripId == tripID }
        && Set(captures.map(\.id)).count == captures.count
}

private struct CaptureForbiddenPayload: Decodable { let code: String }
private func captureForbidden(_ wire: some Encodable) throws -> RepositoryError {
    let value: CaptureForbiddenPayload = try captureDomain(wire)
    return value.code == "capability_not_granted" ? .featureUnavailable : .unauthorized
}

private func captureDomain<Value: Decodable>(_ wire: some Encodable) throws -> Value {
    do { return try JSONDecoder().decode(Value.self, from: JSONEncoder().encode(wire)) } catch {
        throw RepositoryError.contractMismatch
    }
}
