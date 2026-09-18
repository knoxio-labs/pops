import DesignSystem
import SwiftUI

/// Something pending about a place, said in one line at the top of its page.
internal enum InventoryLocationNotice: Equatable {
    case queuedMove(to: String)
    case conflictingMove(mine: String, theirs: String, device: String)
}

/// Which of the page's sheets or dialogs is up.
internal enum InventoryLocationTask: String, Identifiable {
    case addPlace
    case store
    case move

    internal var id: String { rawValue }
}

/// A place's page: its name over the path to it, what it amounts to, its
/// verbs, then the places inside it, what sits directly in it, and what sits
/// in it only inside containers.
internal struct InventoryLocationPage: View {
    internal let tree: InventoryLocationTree
    internal let locationID: String
    internal var notice: InventoryLocationNotice?
    @State private var task: InventoryLocationTask?
    @State private var deleting: Bool
    @State private var renaming = false
    @State private var newName = ""
    @State private var jump: InventoryLocationJump?
    @State private var resolved = false
    @State private var selection = InventorySelection()
    @State private var removed: Set<String> = []
    @State private var undoTo: [String: Set<String>] = [:]
    @State private var moving: InventoryRecordMoveRequest?
    @State private var offer: InventoryUndoOffer?

    internal init(
        tree: InventoryLocationTree,
        locationID: String,
        notice: InventoryLocationNotice? = nil,
        deleting: Bool = false,
        task: InventoryLocationTask? = nil
    ) {
        self.tree = tree
        self.locationID = locationID
        self.notice = notice
        _deleting = State(initialValue: deleting)
        _task = State(initialValue: task)
    }

    internal var body: some View {
        if let place = tree.node(locationID) {
            content(place)
        } else {
            ContentUnavailableView("Place not found", systemImage: InventorySymbol.location.system)
        }
    }

    private func content(_ place: InventoryLocationNode) -> some View {
        ScrollView {
            VStack(alignment: .leading, spacing: PopsSpacing.lg) {
                InventoryLocationHeader(tree: tree, place: place, jump: $jump)
                actions(place)
                noticeLine
                InventoryLocationSections(
                    tree: tree, place: place, selection: $selection, removed: removed)
            }
            .padding(.horizontal, PopsSpacing.lg)
            .padding(.bottom, PopsSpacing.xxl)
            .inventoryMotion(value: resolved)
            .inventoryMotion(value: removed)
        }
        .inventoryCollapsingTitle(place.name)
        .background(Color.popsBackground)
        .tint(.popsInventory)
        .navigationDestination(item: $jump) { target in
            InventoryLocationPage(tree: tree, locationID: target.id)
        }
        .sheet(item: $task) { sheet(for: $0, place: place) }
        .inventorySelectionBar(
            $selection,
            all: InventoryLocationDirectRow.rows(of: place).map(\.id).filter {
                !removed.contains($0)
            },
            actions: selectionActions(place)
        )
        .sheet(item: $moving) { moveSheet($0, from: place) }
        .inventoryUndoCapsule($offer) { undone in
            if let previous = undoTo.removeValue(forKey: undone.id) { removed = previous }
        }
        .alert("Rename", isPresented: $renaming) {
            TextField("Name", text: $newName)
            Button("Save") {}
            Button("Cancel", role: .cancel) {}
        }
    }

    private func selectionActions(_ place: InventoryLocationNode) -> [InventorySelectionAction] {
        [
            InventorySelectionAction(title: "Pick up", symbol: .inHand) { ids in
                leave(
                    ids, from: place,
                    InventoryUndoOffer(
                        message: "Picked up \(subject(ids, in: place))", symbol: .inHand))
            },
            InventorySelectionAction(title: "Move", symbol: .move) { ids in
                moving = InventoryRecordMoveRequest(ids: ids, title: subject(ids, in: place))
            },
        ]
    }

    private func moveSheet(
        _ request: InventoryRecordMoveRequest, from place: InventoryLocationNode
    ) -> some View {
        InventoryDestinationPickerSheet(
            title: request.title, tree: tree,
            recent: InventoryRetrievalFixtures.recent,
            containers: InventoryLocationFixtures.openContainers,
            onChoose: { destination in
                let message =
                    request.ids.count == 1
                    ? "Moved to \(destination.name)"
                    : "Moved \(request.ids.count) to \(destination.name)"
                leave(
                    request.ids, from: place,
                    InventoryUndoOffer(message: message, symbol: .move))
            })
    }

    private func subject(_ ids: Set<String>, in place: InventoryLocationNode) -> String {
        let rows = InventoryLocationDirectRow.rows(of: place).filter { ids.contains($0.id) }
        return rows.count == 1 ? rows[0].name : "\(rows.count) things"
    }

    private func leave(
        _ ids: Set<String>, from place: InventoryLocationNode, _ next: InventoryUndoOffer
    ) {
        undoTo[next.id] = removed
        removed.formUnion(ids)
        selection.deselectAll()
        offer = next
    }

    private func actions(_ place: InventoryLocationNode) -> some View {
        PlaygroundGlassGroup(spacing: PopsSpacing.lg) {
            HStack(spacing: PopsSpacing.lg) {
                actionButton("New place inside", symbol: .addNew) { task = .addPlace }
                actionButton("Store here", symbol: .storeHere) { task = .store }
                actionButton("Move", symbol: .move) { task = .move }
                moreMenu(place)
            }
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, PopsSpacing.xs)
    }

    private func actionButton(
        _ title: String, symbol: InventorySymbol, action: @escaping () -> Void
    ) -> some View {
        Button(action: action) {
            InventoryLocationActionFace(symbol: symbol)
        }
        .playgroundGlassButton()
        .accessibilityLabel(title)
    }

    private func moreMenu(_ place: InventoryLocationNode) -> some View {
        Menu {
            menuItem("Rename", symbol: .rename) {
                newName = place.name
                renaming = true
            }
            menuItem("Move", symbol: .move) { task = .move }
            Divider()
            menuItem("Delete", symbol: .discard, role: .destructive) { deleting = true }
        } label: {
            InventoryLocationActionFace(symbol: .manage)
        }
        .menuStyle(.button)
        .playgroundGlassButton()
        .accessibilityLabel("More")
        .confirmationDialog(
            "Delete \(place.name)?", isPresented: $deleting, titleVisibility: .visible
        ) {
            Button("Delete", role: .destructive) {}
            Button("Cancel", role: .cancel) {}
        } message: {
            Text(tree.deletionEffect(of: place.id))
        }
    }

    private func menuItem(
        _ title: String, symbol: InventorySymbol, role: ButtonRole? = nil,
        action: @escaping () -> Void
    ) -> some View {
        Button(role: role, action: action) {
            Label {
                Text(title)
            } icon: {
                symbol.image
            }
        }
    }

    @ViewBuilder private var noticeLine: some View {
        switch notice {
        case .queuedMove(let destination):
            InventoryLocationNoticeLine(
                symbol: InventorySymbol.queued.system, tint: .popsMutedForeground,
                text: "Moving to \(destination) when online")
        case .conflictingMove(let mine, let theirs, let device) where !resolved:
            InventoryLocationConflict(mine: mine, theirs: theirs, device: device) {
                resolved = true
            }
        case .conflictingMove, .none:
            EmptyView()
        }
    }

    @ViewBuilder
    private func sheet(for task: InventoryLocationTask, place: InventoryLocationNode) -> some View {
        switch task {
        case .addPlace:
            InventoryLocationCreateSheet(tree: tree, parentID: place.id)
        case .store:
            InventoryStoreHereSheet(target: .location(place))
        case .move:
            InventoryDestinationPickerSheet(
                title: place.name,
                tree: tree,
                offered: tree.reparentTargets(for: place.id),
                effect: { tree.moveEffect(of: place.id, to: $0.id) })
        }
    }
}

/// An ancestor tapped in the breadcrumb.
internal struct InventoryLocationJump: Identifiable, Hashable {
    internal let id: String
}
