import AppCore
import CryptoKit
import Foundation

@MainActor
internal final class ProtectedTripDocumentStore: TripDocumentOfflineStore {
    internal let owner: TripDocumentOfflineOwner
    internal let root: @MainActor () throws -> URL
    internal let isCurrent: @MainActor () throws -> Bool
    private let writeData: @MainActor (Data, URL, Data.WritingOptions) throws -> Void

    internal init(
        owner: TripDocumentOfflineOwner, root: @escaping @MainActor () throws -> URL,
        isCurrent: @escaping @MainActor () throws -> Bool,
        writeData: @escaping @MainActor (Data, URL, Data.WritingOptions) throws -> Void = {
            try $0.write(to: $1, options: $2)
        }
    ) {
        self.owner = owner
        self.root = root
        self.isCurrent = isCurrent
        self.writeData = writeData
    }

    internal func loadNavigation() throws -> TripDocumentOfflineNavigation? {
        try assertCurrent()
        guard let data = try readIfPresent(directory().appendingPathComponent("navigation.json"))
        else {
            return nil
        }
        let value: NavigationEnvelope = try decode(data)
        guard value.version == 1 else { throw TripDocumentOfflineError.invalidRecord }
        try validate(value.navigation)
        try assertCurrent()
        return value.navigation
    }

    internal func replaceNavigation(
        _ value: TripDocumentOfflineNavigation, replacing generation: UUID?
    ) throws {
        try assertCurrent()
        try validate(value)
        guard value.generation != generation, try loadNavigation()?.generation == generation else {
            throw TripDocumentOfflineError.generationChanged
        }
        let url = try directory().appendingPathComponent("navigation.json")
        try write(JSONEncoder().encode(NavigationEnvelope(version: 1, navigation: value)), to: url)
    }

    internal func assertCurrent() throws {
        guard try isCurrent() else { throw TripDocumentOfflineError.ownerChanged }
    }

    internal static func standardRoot() throws -> URL {
        try FileManager.default.url(
            for: .applicationSupportDirectory, in: .userDomainMask, appropriateFor: nil,
            create: true
        ).appendingPathComponent("TripsDocuments", isDirectory: true)
    }

    internal func directory() throws -> URL {
        let base = try root()
        guard base.isFileURL else { throw TripDocumentOfflineError.invalidRecord }
        var isDirectory: ObjCBool = false
        if FileManager.default.fileExists(atPath: base.path, isDirectory: &isDirectory),
            !isDirectory.boolValue
        {
            throw TripDocumentOfflineError.invalidRecord
        }
        let encoder = JSONEncoder()
        encoder.outputFormatting = .sortedKeys
        return try base.appendingPathComponent(digest(encoder.encode(owner)), isDirectory: true)
    }

    internal func readIfPresent(_ url: URL) throws -> Data? {
        do { return try Data(contentsOf: url) } catch CocoaError.fileReadNoSuchFile { return nil }
    }

    internal func decode<Value: Decodable>(_ data: Data) throws -> Value {
        do { return try JSONDecoder().decode(Value.self, from: data) } catch {
            throw TripDocumentOfflineError.invalidRecord
        }
    }

    internal func write(_ data: Data, to url: URL) throws {
        let directory = url.deletingLastPathComponent()
        try FileManager.default.createDirectory(
            at: directory, withIntermediateDirectories: true,
            attributes: [.protectionKey: FileProtectionType.completeUntilFirstUserAuthentication])
        try FileManager.default.setAttributes(
            [.protectionKey: FileProtectionType.completeUntilFirstUserAuthentication],
            ofItemAtPath: directory.path)
        try assertCurrent()
        try writeData(
            data, url, [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
    }

    internal func digest(_ data: Data) -> String {
        SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined()
    }

    private func validate(_ value: TripDocumentOfflineNavigation) throws {
        let catalogue = value.catalogue?.trips ?? []
        let tripIDs = value.trips.map { $0.snapshot.trip.id }
        let originals = value.originals.map { $0.original.id }
        guard value.owner == owner,
            catalogue.allSatisfy({ $0.id > 0 }),
            Set(catalogue.map(\.id)).count == catalogue.count,
            tripIDs.allSatisfy({ $0 > 0 }), Set(tripIDs).count == tripIDs.count,
            originals.allSatisfy({ $0 > 0 }), Set(originals).count == originals.count,
            value.selectedTripID.map({ selected in
                tripIDs.contains(selected) || catalogue.contains { $0.id == selected }
            }) ?? true
        else { throw TripDocumentOfflineError.invalidRecord }
        for resource in value.invalidatedResources ?? [] {
            switch resource {
            case .catalogue: break
            case .trip(let id), .document(let id), .file(let id):
                guard id > 0 else { throw TripDocumentOfflineError.invalidRecord }
            }
        }
        if let selected = value.selectedTripID,
            value.invalidatedResources?.contains(.trip(selected)) == true
        {
            throw TripDocumentOfflineError.invalidRecord
        }
        for trip in value.trips { try validateAssociations(trip.snapshot) }
    }

    private func validateAssociations(_ snapshot: TripSnapshot) throws {
        let associations = snapshot.documentAssociations
        let targets: [String: Set<Int>] = [
            "trip": [snapshot.trip.id],
            "visit": Set(snapshot.visits.filter { $0.tripId == snapshot.trip.id }.map(\.id)),
            "journey": Set(snapshot.journeys.filter { $0.tripId == snapshot.trip.id }.map(\.id)),
            "stay": Set(snapshot.stays.filter { $0.tripId == snapshot.trip.id }.map(\.id)),
            "event": Set(snapshot.events.filter { $0.tripId == snapshot.trip.id }.map(\.id)),
        ]
        guard
            associations.allSatisfy({
                $0.id > 0 && $0.tripId == snapshot.trip.id && $0.documentId > 0 && $0.targetId > 0
                    && targets[$0.targetKind]?.contains($0.targetId) == true
            }), Set(associations.map(\.id)).count == associations.count
        else {
            throw TripDocumentOfflineError.invalidRecord
        }
    }

    private struct NavigationEnvelope: Codable {
        let version: Int
        let navigation: TripDocumentOfflineNavigation
    }
}
