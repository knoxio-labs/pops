import DesignSystem
import SwiftUI

/// What variant 1 costs and pays back once the data is in: a search built out
/// of a category's own fields, and a comparison whose rows line up because
/// both objects were made to answer the same questions.
internal struct InventoryTemplateFindingView: View {
    internal let things: [InventoryThing]
    internal let clauses: [InventoryPropertyClause]

    internal var body: some View {
        let matches = clauses.matching(things)
        return List {
            Section {
                InventoryPropertyLine(key: "Category", value: "Cable")
                ForEach(clauses) { clause in
                    InventoryPropertyLine(
                        key: clause.key,
                        value: "\(clause.comparison.rawValue) \(clause.value)"
                    )
                }
                Button {
                } label: {
                    Label("Add a condition", systemImage: "plus")
                }
            } header: {
                Text("Find")
            } footer: {
                Text(
                    "A category comes first, and its fields are the only conditions on offer. "
                        + "Nothing can be misspelled.")
            }
            Section {
                ForEach(matches) { InventoryMatchRow(thing: $0, clauses: clauses) }
            } header: {
                InventoryQuerySummary(clauses: clauses, matches: matches.count)
            }
        }
        .playgroundInsetGroupedList()
    }
}

internal struct InventoryTemplateComparisonView: View {
    internal let things: [InventoryThing]

    internal var body: some View {
        List {
            Section {
                InventoryComparisonGrid(things: things)
            } header: {
                Text("Both are cables")
            } footer: {
                Text(
                    "One template, so the rows line up by construction. Two categories could not "
                        + "be compared at all.")
            }
        }
        .playgroundInsetGroupedList()
    }
}
