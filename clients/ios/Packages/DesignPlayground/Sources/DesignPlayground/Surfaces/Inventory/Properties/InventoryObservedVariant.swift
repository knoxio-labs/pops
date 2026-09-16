import DesignSystem
import SwiftUI

/// Variant 5, templates observed, never authored.
///
/// The other four all assume a type exists before the object does: someone
/// wrote a Cable template, or nobody did and the object has no fields. This
/// one derives the template from what items like this already record, so the
/// first cable needs no setup and the fourth is offered the shape the first
/// three settled into.
///
/// Its cost is that the template moves under you, accept a field today and
/// the cluster may imply a different one next month, and that everything it
/// offers is a count rather than a decision. Whether that reads as helpful or
/// as unstable is the thing to look at.
internal struct InventoryObservedVariantView: View {
    internal let step: InventoryPropertyStep

    @ViewBuilder internal var body: some View {
        switch step {
        case .detail(let thing): detail(thing)
        case .create(let thing, let inferring): create(thing, inferring: inferring)
        case .edit(let thing): edit(thing)
        case .search(let things, let clauses):
            InventoryObservedFindingView(things: things, clauses: clauses)
        case .compare(let things):
            InventoryHybridComparisonView(things: things)
        case .swap(let thing, let template):
            InventoryObservedSwapView(thing: thing, template: template)
        }
    }

    private var catalogue: [InventoryThing] { InventoryPropertyFixtures.all }

    private func detail(_ thing: InventoryThing) -> some View {
        let observed = InventoryObservation.observed(like: thing, in: catalogue)
        return List {
            Section { InventoryThingHeader(thing: thing) }
            if let observed {
                agreed(observed, on: thing)
            } else {
                firstOfItsKind(thing)
            }
            unmatched(thing, observed: observed)
            if let observed { renames(on: thing, given: observed) }
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

    private func agreed(_ observed: InventoryObservedTemplate, on thing: InventoryThing)
        -> some View
    {
        Section {
            ForEach(observed.fields) { field in
                InventoryPropertyLine(
                    key: field.key,
                    value: InventoryComparison.value(of: field.key, in: thing) ?? "Not set",
                    tone: InventoryComparison.value(of: field.key, in: thing) == nil
                        ? .popsMutedForeground : .popsForeground
                )
            }
        } header: {
            Text(observed.name)
        } footer: {
            Text(
                "Nobody wrote this list. It is what the other \(observed.sampleCount) "
                    + "\(observed.name.lowercased())s here already record.")
        }
    }

    private func firstOfItsKind(_ thing: InventoryThing) -> some View {
        Section {
            Button {
            } label: {
                Label("Add a property", systemImage: "plus")
            }
        } header: {
            Text(thing.category)
        } footer: {
            Text(
                "Nothing else here is a \(thing.category.lowercased()), so there is nothing to "
                    + "learn from yet. Whatever this one records becomes the suggestion for the next."
            )
        }
    }

    /// Keys this object has that its cluster does not. Not an error and not a
    /// second class of property, just the part nobody else has agreed with
    /// yet, which is how a field gets born here.
    @ViewBuilder
    private func unmatched(_ thing: InventoryThing, observed: InventoryObservedTemplate?)
        -> some View
    {
        let agreed = Set(observed?.fields.map(\.id) ?? [])
        let extras = thing.properties.filter { !agreed.contains($0.id) }
        if !extras.isEmpty {
            Section {
                ForEach(extras) { property in
                    InventoryPropertyLine(
                        key: property.key,
                        value: property.value.display,
                        footnote: property.origin == .legacy ? "From an older record" : nil
                    )
                }
            } header: {
                Text("Only on this one")
            } footer: {
                Text(
                    "Record it on two more and it becomes part of what a \(thing.category.lowercased()) is."
                )
            }
        }
    }

    private func create(_ thing: InventoryThing, inferring: Bool) -> some View {
        let observed = InventoryObservation.observed(like: thing, in: catalogue)
        return List {
            Section { InventoryThingHeader(thing: thing) }
            Section {
                ForEach(observed?.fields ?? []) { field in
                    InventoryPropertyLine(
                        key: field.key,
                        value: field.unit.map { "Empty · \($0)" } ?? "Empty",
                        tone: .popsMutedForeground
                    )
                }
                if observed == nil {
                    Text("Nothing like it yet. Start with one property.")
                        .font(.popsBody)
                        .foregroundStyle(Color.popsMutedForeground)
                }
            } header: {
                Text(observed.map { "Like \($0.sampleCount) others" } ?? "First of its kind")
            } footer: {
                Text(
                    inferring
                        ? "The fields come from the catalogue and the values from the photo. The list is "
                            + "the same offline; only the values go missing."
                        : "The photo could not be read, and the fields are unaffected, they were never "
                            + "coming from it.")
            }
        }
        .playgroundInsetGroupedList()
    }

    private func edit(_ thing: InventoryThing) -> some View {
        let observed = InventoryObservation.observed(like: thing, in: catalogue)
        return List {
            Section { InventoryThingHeader(thing: thing) }
            Section {
                ForEach(thing.properties) {
                    InventoryPropertyLine(key: $0.key, value: $0.value.display)
                }
            } header: {
                Text("Recorded")
            }
            if let observed {
                renames(on: thing, given: observed)
            } else {
                Section {
                    Text("Nothing else here is a \(thing.category.lowercased()) yet.")
                        .font(.popsBody)
                        .foregroundStyle(Color.popsMutedForeground)
                } header: {
                    Text("Nearly a match")
                } footer: {
                    Text(
                        "So nothing can be suggested, no spelling to settle on, and no rename to "
                            + "offer. The first of anything gets no help here, and pretending "
                            + "otherwise would mean inventing a convention from one example.")
                }
            }
        }
        .playgroundInsetGroupedList()
    }

    /// A custom key the catalogue mostly records under another name. The
    /// mechanism that keeps key/value's drift from happening without anyone
    /// having had to write a schema first.
    @ViewBuilder
    private func renames(on thing: InventoryThing, given observed: InventoryObservedTemplate)
        -> some View
    {
        let pairs = thing.custom.compactMap { property in
            InventoryObservation.renameSuggestion(for: property, given: observed, on: thing)
                .map { (property, $0) }
        }
        if !pairs.isEmpty {
            Section {
                ForEach(pairs, id: \.0.id) { property, field in
                    InventoryPropertyProblem(
                        message: "\(observed.sampleCount) others call this \"\(field.key)\"",
                        resolution:
                            "\"\(property.key)\" measures the same thing. Renaming it lines this item "
                            + "up with them; keeping it leaves a key only this one uses.",
                        tone: .popsAccent
                    )
                }
            } header: {
                Text("Nearly a match")
            }
        }
    }
}
