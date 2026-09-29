import Observation

/// A visible row in the compact item-type tree.
internal struct InventoryTypePickerTreeRow: Identifiable, Equatable {
    internal let option: InventoryFormTypeOption
    internal let depth: Int
    internal let isExpanded: Bool
    internal let hasChildren: Bool

    internal var id: String { option.id }
}

/// Owns expansion and focus state for the item type picker.
///
/// The initial state reveals the selected path and opens branches until five
/// choices are visible where the catalogue has enough entries. That rule is
/// applied only during initialization; a later collapse always stays closed.
@MainActor @Observable
internal final class InventoryTypePickerTreeState {
    internal let options: [InventoryFormTypeOption]
    internal private(set) var expandedIDs: Set<String>
    internal private(set) var focusID: String?

    private let byID: [String: InventoryFormTypeOption]

    internal init(options: [InventoryFormTypeOption], selectedID: String?) {
        self.options = options
        byID = Dictionary(uniqueKeysWithValues: options.map { ($0.id, $0) })
        expandedIDs = []
        focusID = nil
        expandSelectedPath(selectedID)
        expandInitialBranches()
    }

    internal var rows: [InventoryTypePickerTreeRow] {
        var result: [InventoryTypePickerTreeRow] = []
        appendChildren(of: focusID, depth: 0, ancestors: [], to: &result)
        return result
    }

    internal var breadcrumbs: [InventoryFormTypeOption] {
        guard let focusID else { return [] }
        return path(to: focusID)
    }

    internal func toggle(_ id: String) {
        guard hasChildren(id) else { return }
        if expandedIDs.remove(id) == nil { expandedIDs.insert(id) }
    }

    internal func focus(_ id: String) {
        guard hasChildren(id) else { return }
        focusID = id
        expandedIDs.insert(id)
    }

    internal func goTo(_ id: String?) {
        guard id == nil || breadcrumbs.contains(where: { $0.id == id }) else { return }
        focusID = id
    }

    internal func resetFocus() {
        focusID = nil
    }

    private func expandSelectedPath(_ selectedID: String?) {
        guard let selectedID else { return }
        var currentID = byID[selectedID]?.parentID
        var visited: Set<String> = []
        while let id = currentID, visited.insert(id).inserted {
            expandedIDs.insert(id)
            currentID = byID[id]?.parentID
        }
    }

    private func expandInitialBranches() {
        let target = min(5, options.count)
        while rows.count < target {
            guard let candidate = rows.first(where: { hasChildren($0.id) && !$0.isExpanded })
            else { return }
            expandedIDs.insert(candidate.id)
        }
    }

    private func appendChildren(
        of parentID: String?, depth: Int, ancestors: Set<String>,
        to result: inout [InventoryTypePickerTreeRow]
    ) {
        for option in children(of: parentID) where !ancestors.contains(option.id) {
            let expanded = expandedIDs.contains(option.id)
            result.append(
                InventoryTypePickerTreeRow(
                    option: option, depth: depth, isExpanded: expanded,
                    hasChildren: hasChildren(option.id)))
            guard expanded else { continue }
            appendChildren(
                of: option.id, depth: depth + 1,
                ancestors: ancestors.union([option.id]), to: &result)
        }
    }

    private func children(of parentID: String?) -> [InventoryFormTypeOption] {
        options.filter { option in
            guard parentID == nil else { return option.parentID == parentID }
            guard let optionParentID = option.parentID else { return true }
            return byID[optionParentID] == nil || isInCycle(option.id)
        }.sorted { left, right in
            switch left.label.localizedCaseInsensitiveCompare(right.label) {
            case .orderedAscending: true
            case .orderedDescending: false
            case .orderedSame: left.id < right.id
            }
        }
    }

    private func hasChildren(_ id: String) -> Bool {
        options.contains { $0.parentID == id }
    }

    private func isInCycle(_ id: String) -> Bool {
        var currentID: String? = id
        var visited: Set<String> = []
        while let current = currentID, visited.insert(current).inserted {
            currentID = byID[current]?.parentID
        }
        return currentID != nil
    }

    private func path(to id: String) -> [InventoryFormTypeOption] {
        var result: [InventoryFormTypeOption] = []
        var currentID: String? = id
        var visited: Set<String> = []
        while let entryID = currentID, visited.insert(entryID).inserted,
            let entry = byID[entryID]
        {
            result.append(entry)
            currentID = entry.parentID
        }
        return result.reversed()
    }
}
