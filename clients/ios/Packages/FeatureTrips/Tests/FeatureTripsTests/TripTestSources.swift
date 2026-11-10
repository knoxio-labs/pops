import AppCore
import Foundation

internal enum TripTestSources {
    internal static func snapshot() throws -> TripSnapshot {
        guard let url = Bundle.module.url(forResource: "trip-source", withExtension: "json") else {
            throw RepositoryError.contractMismatch
        }
        return try JSONDecoder().decode(TripSnapshot.self, from: Data(contentsOf: url))
    }
}
