import AppCore
import Foundation
import OpenAPIRuntime

/// Reads complete trip sources through the authenticated BFM transport.
/// Clocks, statuses and offline files are never inferred.
public struct BFMTripsRepository: TripsReading {
    private let client: BFMHTTPClient

    /// Creates the reader with the app's existing authenticated client and transport policy.
    public init(client: BFMHTTPClient) { self.client = client }

    /// Consumes the whole cursor snapshot, restarting once when the producer invalidates a cursor.
    public func trips() async throws -> [TripRecord] {
        for attempt in 0...TripsReadPolicy.maximumSnapshotRestarts {
            do { return try await completeCatalogue() } catch TripReadFailure.staleCursor {
                if attempt == TripsReadPolicy.maximumSnapshotRestarts {
                    throw RepositoryError.conflict(TripsReadPolicy.sourceChangedReason)
                }
            }
        }
        throw RepositoryError.contractMismatch
    }

    /// Returns nil only for a missing trip; an incomplete or mismatched response fails the read.
    public func trip(id: Int) async throws -> TripSnapshot? {
        let output: Operations.MobileTrips_getTripV2.Output
        do {
            output = try await client.generated.mobileTrips_getTripV2(path: .init(id: id))
        } catch let error as ClientError {
            if BFMRepositoryFailure.statusCode(in: error) == 404 { return nil }
            throw bfmReadFailure(error, operation: "mobileTrips.getTripV2")
        }
        switch output {
        case .ok(let ok):
            let value: TripSnapshot = try tripDomain(try ok.body.json)
            guard tripSnapshotMatches(value, id: id) else { throw RepositoryError.contractMismatch }
            return value
        case .notFound: return nil
        case .badRequest: throw RepositoryError.requestRejected
        case .unauthorized: throw RepositoryError.unauthorized
        case .forbidden(let value):
            throw BFMRepositoryFailure.forbiddenFailure(try value.body.json)
        case .tooManyRequests(let value):
            throw RepositoryError.rateLimited(
                retryAfterSeconds: try value.body.json.retryAfterSeconds)
        case .badGateway(let value):
            throw BFMRepositoryFailure.upstreamFailure(
                try value.body.json.code, operation: "mobileTrips.getTripV2")
        case .serviceUnavailable(let value):
            throw BFMRepositoryFailure.upstreamFailure(
                try value.body.json.code, operation: "mobileTrips.getTripV2")
        case .undocumented: throw RepositoryError.contractMismatch
        }
    }

    private func completeCatalogue() async throws -> [TripRecord] {
        var cursor: String?
        var cursors: Set<String> = []
        var ids: Set<Int> = []
        var result: [TripRecord] = []
        var total: Int?
        repeat {
            let page = try await tripPage(cursor: cursor)
            guard total == nil || total == page.totalCount,
                page.totalCount >= 0, result.count + page.items.count <= page.totalCount,
                page.items.allSatisfy({ $0.id > 0 && ids.insert($0.id).inserted })
            else { throw RepositoryError.contractMismatch }
            total = page.totalCount
            result.append(contentsOf: page.items)
            guard let next = page.nextCursor else { break }
            guard !page.items.isEmpty, cursors.insert(next).inserted else {
                throw RepositoryError.contractMismatch
            }
            cursor = next
        } while true
        guard result.count == total else { throw RepositoryError.contractMismatch }
        return result
    }

    private func tripPage(cursor: String?) async throws -> TripReadPage {
        let output: Operations.MobileTrips_listTrips.Output
        do {
            output = try await client.generated.mobileTrips_listTrips(
                query: .init(limit: Self.pageLimit, cursor: cursor))
        } catch let error as ClientError {
            if cursor != nil, BFMRepositoryFailure.code(in: error) == "invalid_cursor" {
                throw TripReadFailure.staleCursor
            }
            throw bfmReadFailure(error, operation: "mobileTrips.listTrips")
        }
        switch output {
        case .ok(let ok): return try tripDomain(try ok.body.json)
        case .badRequest(let value):
            let error: TripReadErrorCode = try tripDomain(try value.body.json)
            if cursor != nil, error.code == "invalid_cursor" { throw TripReadFailure.staleCursor }
            throw RepositoryError.requestRejected
        case .unauthorized: throw RepositoryError.unauthorized
        case .forbidden(let value):
            throw BFMRepositoryFailure.forbiddenFailure(try value.body.json)
        case .tooManyRequests(let value):
            throw RepositoryError.rateLimited(
                retryAfterSeconds: try value.body.json.retryAfterSeconds)
        case .badGateway(let value):
            throw BFMRepositoryFailure.upstreamFailure(
                try value.body.json.code, operation: "mobileTrips.listTrips")
        case .serviceUnavailable(let value):
            throw BFMRepositoryFailure.upstreamFailure(
                try value.body.json.code, operation: "mobileTrips.listTrips")
        case .undocumented: throw RepositoryError.contractMismatch
        }
    }

    /// MobileTripsQuerySchema's published maximum, used only to consume transport pages.
    private static let pageLimit = 100
}

private struct TripReadPage: Decodable {
    let items: [TripRecord]
    let nextCursor: String?
    let totalCount: Int
}

private struct TripReadErrorCode: Decodable { let code: String }
private enum TripReadFailure: Error { case staleCursor }

private func tripDomain<Value: Decodable>(_ wire: some Encodable) throws -> Value {
    let encoder = JSONEncoder()
    do { return try JSONDecoder().decode(Value.self, from: encoder.encode(wire)) } catch {
        throw RepositoryError.contractMismatch
    }
}
