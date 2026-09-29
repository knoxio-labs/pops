import Observation

internal enum TypePickerTreeMode: String, CaseIterable {
    case outline
    case automatic
    case manual
}

internal struct TypePickerTreeRow: Identifiable, Equatable {
    internal let node: TypePickerType
    internal let depth: Int
    internal let isExpanded: Bool
    internal let hasChildren: Bool

    internal var id: String { node.id }
}

@Observable
@MainActor
internal final class TypePickerTreeState {
    internal let mode: TypePickerTreeMode
    internal private(set) var expandedIDs: Set<String>
    internal private(set) var focusID: String

    internal init(mode: TypePickerTreeMode) {
        self.mode = mode
        self.expandedIDs = []
        self.focusID = "item"
    }

    internal var rows: [TypePickerTreeRow] {
        var result: [TypePickerTreeRow] = []
        appendChildren(of: focusID, depth: 1, ancestors: [focusID], to: &result)
        return result
    }

    internal var breadcrumbs: [TypePickerType] {
        path(to: focusID)
    }

    internal func toggle(_ id: String) {
        guard let node = TypePickerTaxonomy.node(id), !TypePickerTaxonomy.children(of: id).isEmpty
        else { return }

        if mode == .automatic,
            let depth = distance(from: focusID, to: id),
            depth >= 2,
            let parentID = node.parentID
        {
            expandedIDs.insert(id)
            focusID = parentID
            return
        }

        if expandedIDs.remove(id) != nil {
            return
        }

        expandedIDs.insert(id)
    }

    internal func focus(_ id: String) {
        guard TypePickerTaxonomy.node(id) != nil,
            !TypePickerTaxonomy.children(of: id).isEmpty
        else { return }

        focusID = id
        expandedIDs.insert(id)
    }

    internal func goTo(_ id: String) {
        guard id == "item" || breadcrumbs.dropLast().contains(where: { $0.id == id }) else {
            return
        }
        focusID = id
    }

    internal func resetFocus() {
        focusID = "item"
    }

    private func appendChildren(
        of parentID: String,
        depth: Int,
        ancestors: Set<String>,
        to result: inout [TypePickerTreeRow]
    ) {
        for child in TypePickerTaxonomy.children(of: parentID) where !ancestors.contains(child.id) {
            let children = TypePickerTaxonomy.children(of: child.id)
            let reachesAutomaticLimit = mode == .automatic && depth >= 2
            let isExpanded = expandedIDs.contains(child.id) && !reachesAutomaticLimit
            result.append(
                TypePickerTreeRow(
                    node: child,
                    depth: depth,
                    isExpanded: isExpanded,
                    hasChildren: !children.isEmpty
                ))

            guard isExpanded, !children.isEmpty, !reachesAutomaticLimit else { continue }
            appendChildren(
                of: child.id,
                depth: depth + 1,
                ancestors: ancestors.union([child.id]),
                to: &result
            )
        }
    }

    private func path(to id: String) -> [TypePickerType] {
        guard let node = TypePickerTaxonomy.node(id) else { return [] }
        var reversedPath: [TypePickerType] = []
        var current: TypePickerType? = node
        var visited: Set<String> = []

        while let entry = current, visited.insert(entry.id).inserted {
            reversedPath.append(entry)
            current = entry.parentID.flatMap(TypePickerTaxonomy.node)
        }
        return reversedPath.reversed()
    }

    private func distance(from ancestorID: String, to descendantID: String) -> Int? {
        var distance = 0
        var currentID: String? = descendantID
        var visited: Set<String> = []

        while let id = currentID, visited.insert(id).inserted {
            guard id != ancestorID else { return distance }
            distance += 1
            currentID = TypePickerTaxonomy.node(id)?.parentID
        }
        return nil
    }
}
