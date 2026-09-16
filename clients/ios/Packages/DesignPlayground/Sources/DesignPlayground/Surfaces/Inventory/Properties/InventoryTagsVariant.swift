import DesignSystem
import SwiftUI

/// Variant 3 — tags plus a freeform description.
///
/// No fields and no values: what an object can do is said in words, and the
/// rest is a sentence. It is the fastest thing to write, it never has an empty
/// state, and the sideboard — which the other three struggle to make look like
/// anything — reads better here than anywhere else.
///
/// What it cannot do is arithmetic. "Every cable that carries at least 30 W"
/// has no form on this screen, and the search step is where that stops being
/// an abstraction.
internal struct InventoryTagsVariantView: View {
    internal let step: InventoryPropertyStep

    @ViewBuilder internal var body: some View {
        switch step {
        case .detail(let thing): detail(thing)
        case .create(let thing, let inferring): create(thing, inferring: inferring)
        case .edit(let thing): edit(thing)
        case .search(let things, let clauses): search(things, clauses)
        case .compare(let things): compare(things)
        }
    }

    private func detail(_ thing: InventoryThing) -> some View {
        List {
            Section { InventoryThingHeader(thing: thing) }
            Section {
                if thing.tags.isEmpty {
                    Text("No tags.").font(.popsBody).foregroundStyle(Color.popsMutedForeground)
                } else {
                    chips(thing.tags)
                }
                Button {
                } label: {
                    Label("Add a tag", systemImage: "plus")
                }
            } header: {
                Text("Can do")
            }
            Section {
                Text(thing.notes.isEmpty ? "Nothing written down." : thing.notes)
                    .font(.popsBody)
                    .foregroundStyle(
                        thing.notes.isEmpty ? Color.popsMutedForeground : Color.popsForeground)
            } header: {
                Text("Description")
            } footer: {
                Text("Search reads both, as text. \"18 W\" here is a string, not a wattage.")
            }
        }
        .playgroundInsetGroupedList()
    }

    private func chips(_ tags: [String]) -> some View {
        InventoryChipFlow(spacing: PopsSpacing.sm) {
            ForEach(tags, id: \.self) { InventoryPropertyChip($0) }
        }
        .padding(.vertical, PopsSpacing.xs)
    }

    private func create(_ thing: InventoryThing, inferring: Bool) -> some View {
        List {
            Section { InventoryThingHeader(thing: thing) }
            Section {
                if inferring {
                    chips(thing.suggestions.map { "\($0.key.lowercased()) \($0.value.display)" })
                    Text("Tap a suggestion to keep it, or type your own.")
                        .font(.popsCaption)
                        .foregroundStyle(Color.popsMutedForeground)
                } else {
                    Text("Nothing proposed. Type what it does.")
                        .font(.popsBody)
                        .foregroundStyle(Color.popsMutedForeground)
                }
            } header: {
                Text("Can do")
            } footer: {
                Text(
                    "Proposals are phrases rather than fields, so accepting one cannot be wrong about a type."
                )
            }
            Section {
                Text("Add a description")
                    .font(.popsBody)
                    .foregroundStyle(Color.popsMutedForeground)
            } header: {
                Text("Description")
            }
        }
        .playgroundInsetGroupedList()
    }

    private func edit(_ thing: InventoryThing) -> some View {
        List {
            Section { InventoryThingHeader(thing: thing) }
            Section {
                chips(thing.tags + [InventoryPropertyFixtures.draftKey])
            } header: {
                Text("Can do")
            } footer: {
                Text(
                    "A tag that duplicates another is a second tag. Nothing collides, and nothing agrees either."
                )
            }
            Section {
                InventoryPropertyProblem(
                    message: "\"4 ft\" stays as written",
                    resolution:
                        "No unit is parsed here, so nothing is refused and nothing is comparable.",
                    tone: .popsMutedForeground
                )
            } header: {
                Text("Units")
            }
        }
        .playgroundInsetGroupedList()
    }

    private func search(_ things: [InventoryThing], _ clauses: [InventoryPropertyClause])
        -> some View
    {
        List {
            Section {
                InventoryPropertyLine(key: "Text", value: "usb-c 30w")
                chips(["charges a laptop", "fast data"])
            } header: {
                Text("Find")
            } footer: {
                Text("Tags narrow, words match. There is no way to write \"at least 30 W\".")
            }
            Section {
                ForEach(textMatches(things)) { InventoryMatchRow(thing: $0, clauses: []) }
            } header: {
                Text("Matches the words")
            } footer: {
                Text(
                    "Two of these are here because somebody wrote the wattage into the description and "
                        + "one is missing because nobody did.")
            }
        }
        .playgroundInsetGroupedList()
    }

    /// Whatever the text happens to catch, which is the point being made.
    private func textMatches(_ things: [InventoryThing]) -> [InventoryThing] {
        things.filter { thing in
            thing.tags.contains { $0.contains("laptop") || $0.contains("fast") }
        }
    }

    private func compare(_ things: [InventoryThing]) -> some View {
        List {
            ForEach(things) { thing in
                Section {
                    chips(thing.tags)
                    Text(thing.notes).font(.popsBody).foregroundStyle(Color.popsForeground)
                } header: {
                    Text(thing.name)
                }
            }
            Section {
                Text("There is no table to draw. Comparing these means reading both.")
                    .font(.popsSubheadline)
                    .foregroundStyle(Color.popsMutedForeground)
            }
        }
        .playgroundInsetGroupedList()
    }
}
