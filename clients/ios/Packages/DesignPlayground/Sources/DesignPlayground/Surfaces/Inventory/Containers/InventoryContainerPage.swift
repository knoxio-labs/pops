import SwiftUI

/// A container's page: the approved item detail with the container's verbs in
/// its action row and its contents as one more section (ADR-001).
///
/// Unpacking is this page's ordinary actions: rows leave by swipe, or several
/// at once once their marks are tapped, and each action leaves an undo
/// capsule rather than asking first.
internal struct InventoryContainerPage: View {
    private let stage: InventoryContainerUnpackingStage?
    @State private var profile: InventoryContainerProfile
    @State private var storing: Bool
    @State private var unpacking: InventoryContainerUnpacking
    @State private var offer: InventoryUndoOffer?
    @State private var before:
        (profile: InventoryContainerProfile, unpacking: InventoryContainerUnpacking)?
    @State private var moving: InventoryContainerMoveRequest?
    @State private var keeping = false

    internal init(
        profile: InventoryContainerProfile,
        storing: Bool = false,
        unpacking stage: InventoryContainerUnpackingStage? = nil
    ) {
        self.stage = stage
        _profile = State(initialValue: profile)
        _storing = State(initialValue: storing)
        _unpacking = State(initialValue: stage?.start ?? InventoryContainerUnpacking())
    }

    internal var body: some View {
        InventoryItemDetailView(
            detail: profile.detail,
            actions: InventoryContainerActions.row(for: profile),
            onAction: handle,
            capability: {
                InventoryContainerContentsSection(
                    profile: profile, unpacking: $unpacking,
                    onTakeOut: takeOut, onMove: { moving = InventoryContainerMoveRequest(ids: $0) },
                    onChoose: choose)
            }
        )
        .inventorySelectionBar(
            $unpacking.selection, all: remainingIDs,
            actions: [
                InventorySelectionAction(title: "Pick up", symbol: .inHand, perform: takeOut),
                InventorySelectionAction(title: "Move", symbol: .move) {
                    moving = InventoryContainerMoveRequest(ids: $0)
                },
                InventorySelectionAction(title: "Take out", symbol: .takeOut, perform: setDown),
            ]
        )
        .sheet(isPresented: $storing) {
            InventoryStoreHereSheet(target: .container(profile))
        }
        .sheet(item: $moving) { request in
            picker(title: title(for: request.ids)) { move(request.ids, to: $0) }
        }
        .sheet(isPresented: $keeping) {
            picker(title: profile.item.name, commitTitle: "Keep", excludingSelf: true) {
                keep(in: $0)
            }
        }
        .inventoryUndoCapsule($offer, lingers: stage != nil) { _ in
            guard let before else { return }
            profile = before.profile
            unpacking = before.unpacking
        }
        .task { await playStage() }
    }

    private func picker(
        title: String, commitTitle: String = "Move", excludingSelf: Bool = false,
        onChoose: @escaping (InventoryDestination) -> Void
    ) -> some View {
        InventoryDestinationPickerSheet(
            title: title, commitTitle: commitTitle, tree: InventoryLocationFixtures.home,
            recent: InventoryRetrievalFixtures.recent,
            containers: InventoryLocationFixtures.openContainers.filter {
                !excludingSelf || $0.name != profile.item.name
            },
            onChoose: onChoose)
    }

    private var remainingIDs: [String] {
        profile.contents.entries.map(\.id).filter { !unpacking.removed.contains($0) }
    }

    private func title(for ids: Set<String>) -> String {
        guard ids.count == 1, let id = ids.first,
            let entry = profile.contents.entries.first(where: { $0.id == id })
        else { return "\(ids.count) items" }
        return entry.item.name
    }

    private func handle(_ action: InventoryAction) {
        switch action.id {
        case InventoryContainerActions.storeHereID:
            storing = true
        case "close":
            act(InventoryUndoOffer(message: "Closed \(profile.item.name)", symbol: .close)) {
                profile = profile.closed()
            }
        default:
            break
        }
    }

    private func takeOut(_ ids: Set<String>) {
        guard !ids.isEmpty else { return }
        let message = ids.count == 1 ? "Picked up \(title(for: ids))" : "Picked up \(ids.count)"
        act(InventoryUndoOffer(message: message, symbol: .inHand)) { leave(ids) }
    }

    private func setDown(_ ids: Set<String>) {
        guard !ids.isEmpty else { return }
        let place = profile.item.placement.effectiveLocation ?? "where it stands"
        let what = ids.count == 1 ? title(for: ids) : "\(ids.count)"
        act(InventoryUndoOffer(message: "Took out \(what), now in \(place)", symbol: .takeOut)) {
            leave(ids)
        }
    }

    private func move(_ ids: Set<String>, to destination: InventoryDestination) {
        let message =
            ids.count == 1
            ? "Moved to \(destination.name)" : "Moved \(ids.count) to \(destination.name)"
        act(InventoryUndoOffer(message: message, symbol: .move)) { leave(ids) }
    }

    private func leave(_ ids: Set<String>) {
        unpacking.removed.formUnion(ids)
        unpacking.selection.deselectAll()
    }

    private func choose(_ choice: InventoryEmptyContainerChoice) {
        switch choice {
        case .keep:
            keeping = true
        case .retire:
            act(InventoryUndoOffer(message: "Retired \(profile.item.name)", symbol: .retired)) {
                profile = profile.retired()
                unpacking.emptiedResolved = true
            }
        }
    }

    private func keep(in destination: InventoryDestination) {
        act(InventoryUndoOffer(message: "Kept in \(destination.name)", symbol: .storeHere)) {
            profile = profile.stored(in: destination.name)
            unpacking.emptiedResolved = true
        }
    }

    private func act(_ next: InventoryUndoOffer, _ change: () -> Void) {
        before = (profile, unpacking)
        change()
        offer = next
    }

    private func playStage() async {
        guard let then = stage?.then else { return }
        try? await Task.sleep(for: InventoryMotion.stagedBeat)
        switch then {
        case .moveSelected(let place):
            move(
                unpacking.selection.ids,
                to: InventoryDestination(id: place, name: place, kind: .location))
        case .takeOutAll:
            takeOut(Set(profile.contents.entries.map(\.id)).subtracting(unpacking.removed))
        case .close:
            handle(InventoryAction("close", "Close", symbol: .close, heading: .container))
        }
    }
}

/// Which rows a Move from the container page carries.
internal struct InventoryContainerMoveRequest: Identifiable {
    internal let ids: Set<String>

    internal var id: String { ids.sorted().joined(separator: ",") }
}
