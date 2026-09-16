import DesignSystem
import SwiftUI

/// Variant 2, arbitrary typed key/value properties.
///
/// No categories and no templates: an object has whatever keys somebody gave
/// it, each with a type. It never has nothing to show and it never refuses a
/// fact, which is exactly what the templates variant cannot say. What it gives
/// up is agreement, nothing makes two cables use the same word for length,
/// and a search has to be built out of keys the catalogue happens to contain.
internal struct InventoryKeyValueVariantView: View {
    internal let step: InventoryPropertyStep

    @ViewBuilder internal var body: some View {
        switch step {
        case .detail(let thing): detail(thing)
        case .create(let thing, let inferring): create(thing, inferring: inferring)
        case .edit(let thing): edit(thing)
        case .search(let things, let clauses): search(things, clauses)
        case .swap(let thing, let template): swap(thing, to: template)
        case .compare(let things): compare(things)
        }
    }

    private func detail(_ thing: InventoryThing) -> some View {
        List {
            Section { InventoryThingHeader(thing: thing) }
            Section {
                if thing.properties.isEmpty {
                    Text("No properties yet.")
                        .font(.popsBody)
                        .foregroundStyle(Color.popsMutedForeground)
                }
                ForEach(thing.properties) { property in
                    InventoryPropertyLine(
                        key: property.key,
                        value: property.value.display,
                        footnote: property.value.kindLabel
                    )
                }
                Button {
                } label: {
                    Label("Add a property", systemImage: "plus")
                }
            } header: {
                Text("Properties")
            } footer: {
                Text(
                    "Every row is a key somebody typed. A legacy key is a key like any other, "
                        + "which is why nothing here is greyed out or explained away.")
            }
            if !thing.notes.isEmpty {
                Section {
                    Text(thing.notes).font(.popsBody)
                } header: {
                    Text("Note")
                }
            }
        }
        .playgroundInsetGroupedList()
    }

    private func create(_ thing: InventoryThing, inferring: Bool) -> some View {
        List {
            Section { InventoryThingHeader(thing: thing) }
            Section {
                if inferring {
                    ForEach(thing.suggestions) { InventorySuggestionLine(property: $0) }
                } else {
                    Text("Nothing proposed. Add the first property.")
                        .font(.popsBody)
                        .foregroundStyle(Color.popsMutedForeground)
                }
                Button {
                } label: {
                    Label("Add a property", systemImage: "plus")
                }
            } header: {
                Text("Properties")
            } footer: {
                Text(
                    inferring
                        ? "A proposal here invents the key as well as the value, so accepting four of them "
                            + "is also four decisions about naming."
                        : "Without inference this screen is an empty list and a keyboard.")
            }
        }
        .playgroundInsetGroupedList()
    }

    private func edit(_ thing: InventoryThing) -> some View {
        List {
            Section { InventoryThingHeader(thing: thing) }
            Section {
                ForEach(thing.properties) { property in
                    InventoryPropertyLine(
                        key: property.key,
                        value: property.value.display,
                        footnote: property.value.kindLabel
                    )
                }
            } header: {
                Text("Properties")
            }
            draft(on: thing)
            Section {
                ForEach(thing.suggestions) { InventorySuggestionLine(property: $0) }
            } header: {
                Text("Still proposed")
            }
        }
        .playgroundInsetGroupedList()
    }

    /// The row being typed, and the two things that go wrong in it.
    private func draft(on thing: InventoryThing) -> some View {
        let collision = InventoryPropertySchema.duplicate(
            of: InventoryPropertyFixtures.draftKey, in: thing.properties)
        let unsupported = InventoryPropertySchema.unsupportedUnits(in: thing.properties)
        return Section {
            InventoryPropertyLine(
                key: InventoryPropertyFixtures.draftKey,
                value:
                    "\(InventoryPropertyFixtures.draftValue) \(InventoryPropertyFixtures.draftUnit)",
                footnote: "Measurement",
                tone: .popsMutedForeground
            )
            if let collision {
                InventoryPropertyProblem(
                    message: "Already here as \"\(collision.key)\"",
                    resolution:
                        "Case, spaces and hyphens do not make a new key. Edit that one, or rename this."
                )
            }
            ForEach(unsupported) { property in
                InventoryPropertyProblem(
                    message: "\(property.value.unitSymbol ?? "") is not a unit the catalogue knows",
                    resolution:
                        "Kept as text on \"\(property.key)\", so no search can compare it with a length."
                )
            }
        } header: {
            Text("New property")
        }
    }

    private func search(_ things: [InventoryThing], _ clauses: [InventoryPropertyClause])
        -> some View
    {
        let matches = clauses.matching(things)
        return List {
            Section {
                ForEach(clauses) { clause in
                    InventoryPropertyLine(
                        key: clause.key, value: "\(clause.comparison.rawValue) \(clause.value)")
                }
                Button {
                } label: {
                    Label("Add a condition", systemImage: "plus")
                }
            } header: {
                Text("Find")
            } footer: {
                Text(
                    "A condition starts by picking a key out of every key the catalogue has ever seen, "
                        + "\(keyCount(things)) of them here, and two of those mean the same thing.")
            }
            Section {
                ForEach(matches) { InventoryMatchRow(thing: $0, clauses: clauses) }
            } header: {
                InventoryQuerySummary(clauses: clauses, matches: matches.count)
            }
        }
        .playgroundInsetGroupedList()
    }

    private func keyCount(_ things: [InventoryThing]) -> Int {
        Set(things.flatMap(\.properties).map(\.id)).count
    }

    private func compare(_ things: [InventoryThing]) -> some View {
        List {
            Section {
                InventoryComparisonGrid(things: things)
            } header: {
                Text("Two items")
            } footer: {
                Text(
                    "The rows line up only because both were typed the same way. A \"cable length\" on one "
                        + "of them would have become its own row with a gap beside it.")
            }
        }
        .playgroundInsetGroupedList()
    }

    /// There is no type to swap. Every key an object has, it keeps, which is
    /// this variant's answer to the migration question and also the reason it
    /// has no way to make two cables agree.
    private func swap(_ thing: InventoryThing, to template: InventoryTemplate) -> some View {
        List {
            Section { InventoryThingHeader(thing: thing) }
            Section {
                Text("Nothing to swap.")
                    .font(.popsBody)
                    .foregroundStyle(Color.popsForeground)
            } header: {
                Text("Type")
            } footer: {
                Text(
                    "There are no types here, so an item cannot be the wrong one and no change can "
                        + "move a value anywhere. Making these look like a \(template.name) means "
                        + "editing \(thing.properties.count) keys by hand, on every item.")
            }
            Section {
                ForEach(thing.properties) {
                    InventoryPropertyLine(key: $0.key, value: $0.value.display)
                }
            } header: {
                Text("Unchanged · \(thing.properties.count)")
            }
        }
        .playgroundInsetGroupedList()
    }
}
