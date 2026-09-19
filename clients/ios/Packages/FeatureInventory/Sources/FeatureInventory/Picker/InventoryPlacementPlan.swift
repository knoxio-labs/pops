import AppCore
import Foundation

/// What choosing a destination in the placement picker does, as the
/// commands it issues and the one line its Undo capsule says.
///
/// A new place is created first, with a freshly minted id and the next sort
/// position among its siblings, and the move then names that id. A request
/// the destination cannot serve (a place moved into a container, a new
/// place for nothing) plans no commands at all.
internal struct InventoryPlacementPlan: Equatable {
    internal let commands: [InventoryCommand]
    internal let message: String

    internal init(
        request: InventoryPlacementRequest,
        destination: InventoryDestination,
        tree: InventoryLocationTree,
        mint: () -> String = { UUID().uuidString.lowercased() }
    ) {
        var commands: [InventoryCommand] = []
        var target = destination.placement
        if case .newLocation(let parentID) = destination.kind {
            let id = mint()
            commands.append(
                .createLocation(
                    InventoryNewLocation(
                        id: id, name: destination.name, parentId: parentID,
                        sortOrder: tree.children(of: parentID).count)))
            target = .location(id)
        }
        switch (request.subject, target) {
        case (.items(let ids), .some(let placement)):
            let verb: InventoryMoveVerb
            if case .putBack = destination.kind { verb = .putBack } else { verb = request.verb }
            commands += ids.map { .moveItem(id: $0, to: placement, verb: verb) }
            message = Self.message(count: ids.count, verb: verb, destination: destination)
        case (.location(let id), .some(.location(let parentID))):
            commands.append(.moveLocation(id: id, parentId: parentID))
            message = "Moved to \(destination.name)"
        default:
            commands = []
            message = ""
        }
        self.commands = commands
    }

    private static func message(
        count: Int, verb: InventoryMoveVerb, destination: InventoryDestination
    ) -> String {
        switch verb {
        case .putBack:
            guard let path = destination.detail, !path.isEmpty else { return "Put back" }
            return "Put back in \(path)"
        case .store:
            return count == 1
                ? "Stored in \(destination.name)" : "Stored \(count) in \(destination.name)"
        case .move, .pickUp:
            return count == 1
                ? "Moved to \(destination.name)" : "Moved \(count) to \(destination.name)"
        }
    }
}
